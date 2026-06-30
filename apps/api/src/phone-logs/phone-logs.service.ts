import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  columnsByServiceType,
  dedupeRows,
  formatDisplayRows,
  formatFileName,
  formatPhoneNumber,
  getServiceLabel,
  normalizePhoneNumber,
} from "./phone-log-format";
import { PhoneLogsDatabaseService } from "./phone-logs.db";
import {
  AggregateOption,
  ColumnFilterOption,
  PhoneLogFile,
  PhoneLogFileMetadata,
  PhoneLogView,
  ServiceType,
} from "./phone-logs.types";

const blankFilterValue = "__BLANK__";

@Injectable()
export class PhoneLogsService {
  constructor(private readonly db: PhoneLogsDatabaseService) {}

  async getOptions() {
    const files = await this.getFileMetadata();

    return {
      files,
      aggregateOptions: this.getAggregateOptions(files),
    };
  }

  async getFileMetadata(): Promise<PhoneLogFileMetadata[]> {
    const files = await this.getAllFiles();
    return files.map(({ rows, ...metadata }) => ({
      ...metadata,
      recordCount: rows.length,
    }));
  }

  async getFile(id: string): Promise<PhoneLogView> {
    const decodedId = decodeURIComponent(id);
    const files = await this.getAllFiles();
    const file = files.find(item => item.id === decodedId);

    if (!file) {
      throw new NotFoundException(`Phone log file not found: ${decodedId}`);
    }

    return this.toView(file);
  }

  async getAggregate(serviceType: ServiceType, lineNumber: string): Promise<PhoneLogView> {
    if (!columnsByServiceType[serviceType]) {
      throw new NotFoundException(`Unsupported service type: ${serviceType}`);
    }

    const normalizedLine = formatPhoneNumber(lineNumber);
    const files = await this.getAllFiles();
    const rows = files
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

  async saveNickname(phoneNumber: unknown, nickname: unknown) {
    const saved = await this.db.upsertNicknameMapping(phoneNumber, nickname, "react-page");

    if (!saved) {
      throw new BadRequestException("Phone number and nickname are required.");
    }

    return {
      phoneNumber: saved.phoneNumber,
      nickname: saved.nickname,
    };
  }

  private async getAllFiles(): Promise<PhoneLogFile[]> {
    const records = await this.db.getPhoneLogPayloads();
    const nicknames = await this.db.getNicknameMap();
    const getLocalNickname = (phoneNumber: string) => nicknames.get(normalizePhoneNumber(phoneNumber)) || "";

    return records.map(record => this.toPhoneLogFile(record, getLocalNickname));
  }

  private toPhoneLogFile(
    record: { serviceType: ServiceType; phoneNumber: string; fileName: string; payload: unknown },
    getLocalNickname: (phoneNumber: string) => string,
  ): PhoneLogFile {
    const rawRows = formatDisplayRows(record.payload, record.serviceType, record.phoneNumber, getLocalNickname);
    const rows = dedupeRows(rawRows, record.serviceType);
    const lineNumber = this.getLineNumberFromRows(rows);
    const displayName = `${formatFileName(record.fileName)} (${getServiceLabel(record.serviceType)})`;

    return {
      id: `${record.serviceType}:${record.fileName}`,
      fileName: record.fileName,
      displayName,
      serviceType: record.serviceType,
      serviceLabel: getServiceLabel(record.serviceType),
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
}
