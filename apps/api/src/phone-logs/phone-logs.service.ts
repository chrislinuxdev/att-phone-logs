import { Injectable, NotFoundException } from "@nestjs/common";
import { createRequire } from "module";
import * as fs from "fs";
import * as path from "path";
import {
  columnsByServiceType,
  dedupeRows,
  formatDisplayRows,
  formatFileName,
  formatPhoneNumber,
  getServiceLabel,
} from "./phone-log-format";
import {
  AggregateOption,
  ColumnFilterOption,
  PhoneLogFile,
  PhoneLogFileMetadata,
  PhoneLogView,
  ServiceType,
} from "./phone-logs.types";

const requireFromHere = createRequire(__filename);
const blankFilterValue = "__BLANK__";

const dataConfigs: Array<{ sourceName: string; serviceType: ServiceType }> = [
  { sourceName: "calls", serviceType: "VOICE" },
  { sourceName: "texts", serviceType: "TEXT" },
];

@Injectable()
export class PhoneLogsService {
  private readonly dataRoot = this.resolveDataRoot();

  getOptions() {
    const files = this.getFileMetadata();

    return {
      files,
      aggregateOptions: this.getAggregateOptions(files),
    };
  }

  getFileMetadata(): PhoneLogFileMetadata[] {
    return this.getAllFiles().map(({ rows, ...metadata }) => ({
      ...metadata,
      recordCount: rows.length,
    }));
  }

  getFile(id: string): PhoneLogView {
    const decodedId = decodeURIComponent(id);
    const file = this.getAllFiles().find(item => item.id === decodedId);

    if (!file) {
      throw new NotFoundException(`Phone log file not found: ${decodedId}`);
    }

    return this.toView(file);
  }

  getAggregate(serviceType: ServiceType, lineNumber: string): PhoneLogView {
    if (!columnsByServiceType[serviceType]) {
      throw new NotFoundException(`Unsupported service type: ${serviceType}`);
    }

    const normalizedLine = formatPhoneNumber(lineNumber);
    const rows = this.getAllFiles()
      .filter(file => file.serviceType === serviceType && file.lineNumber === normalizedLine)
      .flatMap(file => file.rows)
      .sort((left, right) => Number(right["Sort Timestamp"]) - Number(left["Sort Timestamp"]));

    if (rows.length === 0) {
      throw new NotFoundException(`No ${serviceType} rows found for line ${lineNumber}`);
    }

    const dedupedRows = dedupeRows(rows, serviceType);
    const file: PhoneLogFile = {
      id: `aggregate:${serviceType}:${normalizedLine}`,
      fileName: `All ${getServiceLabel(serviceType)} Data ${normalizedLine}`,
      displayName: `All ${getServiceLabel(serviceType)} Data ${normalizedLine}`,
      serviceType,
      serviceLabel: getServiceLabel(serviceType),
      lineNumber: normalizedLine,
      lineDisplay: normalizedLine,
      rows: dedupedRows,
      recordCount: dedupedRows.length,
    };

    return this.toView(file);
  }

  private getAllFiles(): PhoneLogFile[] {
    return dataConfigs.flatMap(config => {
      const sourceDir = path.join(this.dataRoot, config.sourceName);

      if (!fs.existsSync(sourceDir)) {
        return [];
      }

      return fs.readdirSync(sourceDir)
        .filter(fileName => fileName.endsWith(".json"))
        .sort((left, right) => right.localeCompare(left))
        .map(fileName => this.readPhoneLogFile(sourceDir, fileName, config.serviceType));
    });
  }

  private readPhoneLogFile(sourceDir: string, fileName: string, serviceType: ServiceType): PhoneLogFile {
    const filePath = path.join(sourceDir, fileName);
    const fileContent = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const rawRows = formatDisplayRows(fileContent, serviceType, "", this.getLocalNickname.bind(this));
    const rows = dedupeRows(rawRows, serviceType);
    const lineNumber = this.getLineNumberFromRows(rows);
    const displayName = `${formatFileName(fileName)} (${getServiceLabel(serviceType)})`;

    return {
      id: `${serviceType}:${fileName}`,
      fileName,
      displayName,
      serviceType,
      serviceLabel: getServiceLabel(serviceType),
      lineNumber,
      lineDisplay: lineNumber,
      rows,
      recordCount: rows.length,
    };
  }

  private toView(file: PhoneLogFile): PhoneLogView {
    const columns = columnsByServiceType[file.serviceType];

    return {
      id: file.id,
      fileName: file.fileName,
      displayName: file.displayName,
      serviceType: file.serviceType,
      serviceLabel: file.serviceLabel,
      lineNumber: file.lineNumber,
      lineDisplay: file.lineDisplay,
      columns,
      rows: file.rows,
      recordCount: file.rows.length,
      columnFilterOptions: this.buildColumnFilterOptions(file.rows, columns),
    };
  }

  private getAggregateOptions(files: PhoneLogFileMetadata[]): AggregateOption[] {
    const linesByService = files.reduce<Record<ServiceType, Set<string>>>((accumulator, file) => {
      if (file.lineNumber) {
        accumulator[file.serviceType].add(file.lineNumber);
      }

      return accumulator;
    }, { VOICE: new Set<string>(), TEXT: new Set<string>() });

    return (Object.entries(linesByService) as Array<[ServiceType, Set<string>]>)
      .flatMap(([serviceType, lines]) => [...lines].sort().map(lineNumber => ({
        id: `aggregate:${serviceType}:${lineNumber}`,
        label: `All ${serviceType === "TEXT" ? "Text" : "Voice"} Data ${lineNumber}`,
        serviceType,
        lineNumber,
        lineDisplay: lineNumber,
      })));
  }

  private buildColumnFilterOptions(rows: PhoneLogFile["rows"], columns: string[]): Record<string, ColumnFilterOption[]> {
    return columns.reduce<Record<string, ColumnFilterOption[]>>((accumulator, column) => {
      const seen = new Set<string>();
      const options: ColumnFilterOption[] = [];

      rows.forEach(row => {
        const value = this.getFilterCellValue(row, column);
        const key = value === "" ? blankFilterValue : value;

        if (seen.has(key)) {
          return;
        }

        seen.add(key);
        options.push({
          value: key,
          label: key === blankFilterValue ? "(blank)" : value,
        });
      });

      options.sort((left, right) => {
        if (left.value === blankFilterValue && right.value !== blankFilterValue) {
          return -1;
        }

        if (right.value === blankFilterValue && left.value !== blankFilterValue) {
          return 1;
        }

        return left.label.localeCompare(right.label, undefined, { numeric: true, sensitivity: "base" });
      });

      accumulator[column] = options;
      return accumulator;
    }, {});
  }

  private getFilterCellValue(row: PhoneLogFile["rows"][number], column: string) {
    const value = column === "Nickname" ? row["Display Nickname"] : row[column];
    return String(value ?? "").trim();
  }

  private getLineNumberFromRows(rows: PhoneLogFile["rows"]) {
    const row = rows.find(item => item.Line);
    return row ? String(row.Line) : "";
  }

  private getLocalNickname(phoneNumber: string) {
    const nicknames = this.getNicknameModule();
    return nicknames.getLocalNickname(phoneNumber);
  }

  private getNicknameModule(): { getLocalNickname: (phoneNumber: string) => string } {
    const nicknameFile = path.join(this.dataRoot, "local-phone-nicknames.js");
    return requireFromHere(nicknameFile);
  }

  private resolveDataRoot() {
    const candidates = [
      process.env.PHONE_LOGS_DATA_DIR,
      path.resolve(process.cwd(), "data", "phone-logs"),
      path.resolve(process.cwd(), "apps", "api", "data", "phone-logs"),
      path.resolve(__dirname, "..", "..", "data", "phone-logs"),
      path.resolve(__dirname, "..", "..", "..", "data", "phone-logs"),
    ].filter(Boolean) as string[];

    const dataRoot = candidates.find(candidate => fs.existsSync(candidate));

    if (!dataRoot) {
      return candidates[0];
    }

    return dataRoot;
  }
}
