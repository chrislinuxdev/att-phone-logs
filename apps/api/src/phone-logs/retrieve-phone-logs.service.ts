import { Injectable, NotFoundException } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import { AttAuthService } from "./att-auth.service";
import { loadDotEnv, parseBoolean } from "./env.util";
import { formatDisplayRows, normalizePhoneNumber, normalizeStoredPhoneNumbers } from "./phone-log-format";
import { PhoneLogsDatabaseService } from "./phone-logs.db";
import { ServiceType } from "./phone-logs.types";

const phoneNumbers = ["3125045116", "8479024059"];

type RetrievalStatus = "running" | "waiting_for_confirmation_code" | "completed" | "failed";

interface RetrievalJob {
  id: string;
  status: RetrievalStatus;
  message: string;
  startedAt: string;
  completedAt?: string;
  error?: string;
  result?: RetrievalResult;
  codeResolver?: (code: string) => void;
}

export interface RetrievalResult {
  phoneNumber: string;
  statementIds: string[];
  serviceTypes: ServiceType[];
  filesWritten: string[];
  rowsWritten: number;
}

export interface PublicRetrievalJob {
  id: string;
  status: RetrievalStatus;
  message: string;
  startedAt: string;
  completedAt?: string;
  error?: string;
  result?: RetrievalResult;
}

@Injectable()
export class RetrievePhoneLogsService {
  private readonly repoRoot = this.resolveRepoRoot();
  private readonly dataRoot = this.resolveDataRoot();
  private readonly jobs = new Map<string, RetrievalJob>();
  private activeJobId = "";

  constructor(
    private readonly attAuthService: AttAuthService,
    private readonly db: PhoneLogsDatabaseService,
  ) {}

  startRetrieval() {
    if (this.activeJobId) {
      const activeJob = this.jobs.get(this.activeJobId);

      if (activeJob && activeJob.status !== "completed" && activeJob.status !== "failed") {
        return this.toPublicJob(activeJob);
      }
    }

    const job: RetrievalJob = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      status: "running",
      message: "Starting AT&T phone-log retrieval.",
      startedAt: new Date().toISOString(),
    };

    this.jobs.set(job.id, job);
    this.activeJobId = job.id;
    this.runRetrieval(job).catch(error => this.failJob(job, error));
    return this.toPublicJob(job);
  }

  getJob(jobId: string) {
    const job = this.jobs.get(jobId);

    if (!job) {
      throw new NotFoundException(`Retrieval job not found: ${jobId}`);
    }

    return this.toPublicJob(job);
  }

  submitConfirmationCode(jobId: string, code: string) {
    const job = this.jobs.get(jobId);

    if (!job) {
      throw new NotFoundException(`Retrieval job not found: ${jobId}`);
    }

    const cleanedCode = String(code || "").trim();

    if (!cleanedCode) {
      throw new Error("Confirmation code is required.");
    }

    if (!job.codeResolver) {
      return this.toPublicJob(job);
    }

    const resolve = job.codeResolver;
    job.codeResolver = undefined;
    job.status = "running";
    job.message = "Confirmation code submitted. Continuing AT&T login.";
    resolve(cleanedCode);

    return this.toPublicJob(job);
  }

  private async runRetrieval(job: RetrievalJob) {
    const config = this.getConfig();
    const headers = this.getBaseHeaders();

    job.message = "Capturing AT&T authentication cookie.";
    const cookie = await this.attAuthService.getAttCookie({
      requestVerificationCode: () => this.waitForConfirmationCode(job),
    });
    headers.set("Cookie", cookie);

    job.message = "Fetching available billing statements.";
    const billCycleResponse = await fetch(
      "https://www.att.com/msapi/usageorch/v2/info/billcycle/subscriber",
      this.getBillCycleRequestOptions(config.phoneNumber, headers),
    );

    if (!billCycleResponse.ok) {
      throw new Error(`Bill cycle request failed with status ${billCycleResponse.status}`);
    }

    const billCycleText = await billCycleResponse.text();
    const statementIds = Array.from(new Set(this.getStatementIds(JSON.parse(billCycleText)).map(String)));

    if (!statementIds.length) {
      throw new Error("No statement IDs found.");
    }

    const selectedStatementIds = config.useAllBillingStatements ? statementIds : [statementIds[0]];
    const filesWritten: string[] = [];
    let rowsWritten = 0;

    for (const serviceType of config.serviceTypes) {
      if (config.useAllBillingStatements && config.clearUnbilledOnAllStatements) {
        await this.clearPhoneLogArtifacts("UNBILLED", serviceType, config.phoneNumber);
      }

      for (const statementId of selectedStatementIds) {
        job.message = `Fetching ${serviceType.toLowerCase()} logs for ${statementId}.`;
        const details = await this.fetchDetails(statementId, serviceType, config.phoneNumber, headers);
        normalizeStoredPhoneNumbers(details);
        const apiDetailsTable = formatDisplayRows(details, serviceType, config.phoneNumber, () => "");
        await this.maybeRegisterLocalNicknamesFromRows(apiDetailsTable);

        const nicknames = await this.db.getNicknameMap();
        const detailsTable = formatDisplayRows(
          details,
          serviceType,
          config.phoneNumber,
          phoneNumber => nicknames.get(normalizePhoneNumber(phoneNumber)) || "",
        );
        rowsWritten += detailsTable.length;
        filesWritten.push(await this.persistPhoneLogPayload(statementId, serviceType, details, config.phoneNumber));
      }
    }

    job.status = "completed";
    job.message = "Phone-log retrieval completed.";
    job.completedAt = new Date().toISOString();
    job.result = {
      phoneNumber: config.phoneNumber,
      statementIds: selectedStatementIds,
      serviceTypes: config.serviceTypes,
      filesWritten,
      rowsWritten,
    };
    this.activeJobId = "";
  }

  private async waitForConfirmationCode(job: RetrievalJob) {
    job.status = "waiting_for_confirmation_code";
    job.message = "AT&T requested a confirmation code.";

    return new Promise<string>(resolve => {
      job.codeResolver = resolve;
    });
  }

  private getConfig() {
    loadDotEnv(path.join(this.repoRoot, ".env"));

    const phoneNumber = this.getDefaultPhoneNumber(process.env.PHONE_LOGS_DEFAULT_PHONE_NUMBER);
    const serviceTypes = this.getDefaultServiceTypes(process.env.PHONE_LOGS_DEFAULT_DETAIL_TYPE);

    if (!phoneNumber) {
      throw new Error("PHONE_LOGS_DEFAULT_PHONE_NUMBER must match an available phone number.");
    }

    if (!serviceTypes.length) {
      throw new Error("PHONE_LOGS_DEFAULT_DETAIL_TYPE must be voice, text, or both.");
    }

    return {
      phoneNumber,
      serviceTypes,
      clearUnbilledOnAllStatements: parseBoolean(process.env.PHONE_LOGS_CLEAR_UNBILLED_ON_ALL_STATEMENTS, false),
      useAllBillingStatements: parseBoolean(process.env.PHONE_LOGS_USE_ALL_BILLING_STATEMENTS, false),
    };
  }

  private getDefaultPhoneNumber(value: unknown) {
    const normalizedValue = normalizePhoneNumber(value);
    return phoneNumbers.includes(normalizedValue) ? normalizedValue : "";
  }

  private getDefaultServiceTypes(value: unknown): ServiceType[] {
    const normalizedValue = String(value || "").trim().toLowerCase();

    if (normalizedValue === "voice") {
      return ["VOICE"];
    }

    if (normalizedValue === "text") {
      return ["TEXT"];
    }

    if (normalizedValue === "both") {
      return ["VOICE", "TEXT"];
    }

    return [];
  }

  private getBaseHeaders() {
    const headers = new Headers();
    headers.append("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36");
    headers.append("Content-Type", "application/json");
    return headers;
  }

  private getBillCycleRequestOptions(phoneNumber: string, headers: Headers) {
    return {
      method: "POST",
      headers,
      body: JSON.stringify({
        account: "145295213",
        cvgWirelessBan: "232061707406",
        accounttype: "ENBLR",
        subscriber: phoneNumber,
        infocusCtn: phoneNumber,
      }),
      redirect: "follow" as RequestRedirect,
    };
  }

  private getStatementIds(value: unknown): unknown[] {
    const statementIds: unknown[] = [];

    if (Array.isArray(value)) {
      value.forEach(item => statementIds.push(...this.getStatementIds(item)));
      return statementIds;
    }

    if (!value || typeof value !== "object") {
      return statementIds;
    }

    Object.entries(value).forEach(([key, item]) => {
      if (key.replace(/[_-]/g, "").toLowerCase() === "statementid") {
        statementIds.push(item);
        return;
      }

      statementIds.push(...this.getStatementIds(item));
    });

    return statementIds;
  }

  private async fetchDetails(statementId: string, serviceType: ServiceType, phoneNumber: string, headers: Headers) {
    const servicePath = serviceType.toLowerCase();
    const accountData: Record<string, unknown> = {
      AccountNumber: "145295213",
      AccountType: "ENBLR",
      serviceType,
      SubscriberData: {
        SubscriberNumber: phoneNumber,
      },
      cvgWirelessBan: "145295213",
    };

    if (statementId === "UNBILLED") {
      accountData.ResultType = "CURRENT";
    } else {
      accountData.BillStatementID = statementId;
    }

    const response = await fetch(
      `https://www.att.com/msapi/usageorch/v2/detail/${servicePath}?pageNo=1&limit=2000&dateSort=DSC`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          AccountData: accountData,
        }),
        redirect: "follow",
      },
    );

    if (!response.ok) {
      throw new Error(`Detail request failed with status ${response.status}`);
    }

    return JSON.parse(await response.text());
  }

  private async persistPhoneLogPayload(statementId: string, serviceType: ServiceType, details: unknown, phoneNumber: string) {
    const backupPath = this.writeRawPayloadBackupFile(statementId, serviceType, details, phoneNumber);
    const fileName = path.basename(backupPath);

    await this.db.upsertPhoneLogPayload({
      serviceType,
      phoneNumber,
      statementId,
      fileName,
      payload: details,
      backupPath,
      source: "att-retrieval",
      fetchedAt: new Date(),
    });

    return backupPath;
  }

  private writeRawPayloadBackupFile(statementId: string, serviceType: ServiceType, details: unknown, phoneNumber: string) {
    const { sourcePath } = this.getPhoneLogFilePaths(statementId, serviceType, phoneNumber);

    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.writeFileSync(sourcePath, `${JSON.stringify(details, null, 2)}\n`);

    return sourcePath;
  }

  private async clearPhoneLogArtifacts(statementId: string, serviceType: ServiceType, phoneNumber: string) {
    const { sourcePath, dataPath } = this.getPhoneLogFilePaths(statementId, serviceType, phoneNumber);

    fs.rmSync(sourcePath, { force: true });
    fs.rmSync(dataPath, { force: true });
    await this.db.deletePhoneLogPayload(serviceType, phoneNumber, statementId);
  }

  private getPhoneLogFilePaths(statementId: string, serviceType: ServiceType, phoneNumber: string) {
    const sourceName = serviceType === "TEXT" ? "texts" : "calls";
    const dataName = serviceType === "TEXT" ? "texts-data" : "calls-data";
    const fileBase = `${this.sanitizeFileBase(phoneNumber)}-${this.sanitizeFileBase(statementId)}`;

    return {
      sourcePath: path.join(this.dataRoot, sourceName, `${fileBase}.json`),
      dataPath: path.join(this.dataRoot, dataName, `${fileBase}.js`),
    };
  }

  private sanitizeFileBase(fileBase: string) {
    return fileBase.replace(/[^a-z0-9._-]/gi, "_");
  }

  private async maybeRegisterLocalNicknamesFromRows(rows: Array<Record<string, unknown>>) {
    for (const row of rows) {
      await this.db.importNicknameIfMissing(row.Number, row.Nickname, "att-api");
    }
  }

  private failJob(job: RetrievalJob, error: Error) {
    job.status = "failed";
    job.message = "Phone-log retrieval failed.";
    job.error = error.message;
    job.completedAt = new Date().toISOString();
    job.codeResolver = undefined;
    this.activeJobId = "";
  }

  private toPublicJob(job: RetrievalJob): PublicRetrievalJob {
    return {
      id: job.id,
      status: job.status,
      message: job.message,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      error: job.error,
      result: job.result,
    };
  }

  private resolveRepoRoot() {
    const candidates = [
      process.cwd(),
      path.resolve(process.cwd(), "..", ".."),
      path.resolve(__dirname, "..", "..", "..", ".."),
    ];

    return candidates.find(candidate => fs.existsSync(path.join(candidate, ".env"))) || process.cwd();
  }

  private resolveDataRoot() {
    const candidates = [
      process.env.PHONE_LOGS_DATA_DIR,
      path.join(this.repoRoot, "apps", "api", "data", "phone-logs"),
      path.join(this.repoRoot, "data", "phone-logs"),
      path.resolve(process.cwd(), "data", "phone-logs"),
      path.resolve(__dirname, "..", "..", "data", "phone-logs"),
      path.resolve(__dirname, "..", "..", "..", "data", "phone-logs"),
    ].filter(Boolean) as string[];

    return candidates.find(candidate => fs.existsSync(candidate)) || candidates[0];
  }
}
