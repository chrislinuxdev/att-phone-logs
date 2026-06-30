import { createRequire } from "module";
import * as fs from "fs";
import * as path from "path";
import {
  PhoneLogsDatabaseService,
  resolveRepoRoot,
} from "../phone-logs/phone-logs.db";
import {
  getUsageRows,
  normalizePhoneNumber,
  normalizeStoredPhoneNumbers,
} from "../phone-logs/phone-log-format";
import { ServiceType } from "../phone-logs/phone-logs.types";

const requireFromHere = createRequire(__filename);

const dataConfigs: Array<{ sourceName: string; serviceType: ServiceType }> = [
  { sourceName: "calls", serviceType: "VOICE" },
  { sourceName: "texts", serviceType: "TEXT" },
];

interface ImportCounts {
  phoneLogPayloads: number;
  nicknameMappings: number;
  cookieHistory: number;
}

async function main() {
  const repoRoot = resolveRepoRoot();
  const dataRoot = resolveDataRoot(repoRoot);
  const db = new PhoneLogsDatabaseService();
  const counts: ImportCounts = {
    phoneLogPayloads: 0,
    nicknameMappings: 0,
    cookieHistory: 0,
  };

  await db.onModuleInit();

  try {
    counts.phoneLogPayloads = await importPhoneLogPayloads(db, dataRoot);
    counts.nicknameMappings = await importNicknameMappings(db, dataRoot);
    counts.cookieHistory = await importCookieHistory(db, repoRoot);
  } finally {
    await db.onModuleDestroy();
  }

  console.log(`Imported ${counts.phoneLogPayloads} phone-log payloads.`);
  console.log(`Imported ${counts.nicknameMappings} nickname mappings.`);
  console.log(`Imported ${counts.cookieHistory} cookie history rows.`);
}

async function importPhoneLogPayloads(db: PhoneLogsDatabaseService, dataRoot: string) {
  let importedCount = 0;

  for (const config of dataConfigs) {
    const sourceDir = path.join(dataRoot, config.sourceName);

    if (!fs.existsSync(sourceDir)) {
      continue;
    }

    const fileNames = fs.readdirSync(sourceDir)
      .filter(fileName => fileName.endsWith(".json"))
      .sort();

    for (const fileName of fileNames) {
      const filePath = path.join(sourceDir, fileName);
      const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
      normalizeStoredPhoneNumbers(payload);

      const parsed = parsePhoneLogFileName(fileName, payload);
      await db.upsertPhoneLogPayload({
        serviceType: config.serviceType,
        phoneNumber: parsed.phoneNumber,
        statementId: parsed.statementId,
        fileName,
        payload,
        backupPath: filePath,
        source: "file-import",
        importedAt: new Date(),
      });
      importedCount += 1;
    }
  }

  return importedCount;
}

async function importNicknameMappings(db: PhoneLogsDatabaseService, dataRoot: string) {
  const nicknameFile = path.join(dataRoot, "local-phone-nicknames.js");

  if (!fs.existsSync(nicknameFile)) {
    return 0;
  }

  const nicknameModule = requireFromHere(nicknameFile);
  const mappings = nicknameModule.phoneLogLocalNicknames || {};
  let importedCount = 0;

  for (const [phoneNumber, nickname] of Object.entries(mappings)) {
    if (await db.importNicknameIfMissing(phoneNumber, nickname, "local-phone-nicknames.js")) {
      importedCount += 1;
    }
  }

  return importedCount;
}

async function importCookieHistory(db: PhoneLogsDatabaseService, repoRoot: string) {
  const cookieFile = path.join(repoRoot, "att_cookies.txt");

  if (!fs.existsSync(cookieFile)) {
    return 0;
  }

  const cookieHeader = fs.readFileSync(cookieFile, "utf8").trim();
  const result = await db.saveCookieHistory(cookieHeader, "att_cookies.txt import", true);
  return result ? 1 : 0;
}

function parsePhoneLogFileName(fileName: string, payload: unknown) {
  const fileBase = fileName.replace(/\.json$/i, "");
  const match = fileBase.match(/^(\d{10,11})-(.+)$/);
  const payloadPhoneNumber = getPayloadPhoneNumber(payload);

  return {
    phoneNumber: normalizePhoneNumber(match?.[1] || payloadPhoneNumber),
    statementId: match?.[2] || fileBase,
  };
}

function getPayloadPhoneNumber(payload: unknown) {
  const row = getUsageRows(payload).find(item => normalizePhoneNumber(item.lineNumber));
  return normalizePhoneNumber(row?.lineNumber);
}

function resolveDataRoot(repoRoot: string) {
  const candidates = [
    process.env.PHONE_LOGS_DATA_DIR,
    path.join(repoRoot, "apps", "api", "data", "phone-logs"),
    path.join(repoRoot, "data", "phone-logs"),
    path.resolve(process.cwd(), "data", "phone-logs"),
    path.resolve(__dirname, "..", "data", "phone-logs"),
    path.resolve(__dirname, "..", "..", "data", "phone-logs"),
  ].filter(Boolean) as string[];

  return candidates.find(candidate => fs.existsSync(candidate)) || candidates[0];
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
