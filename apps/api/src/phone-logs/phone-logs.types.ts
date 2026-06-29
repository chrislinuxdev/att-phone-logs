export type ServiceType = "VOICE" | "TEXT";

export type PhoneLogRow = Record<string, string | number | boolean>;

export interface PhoneLogFile {
  id: string;
  fileName: string;
  displayName: string;
  serviceType: ServiceType;
  serviceLabel: string;
  lineNumber: string;
  lineDisplay: string;
  rows: PhoneLogRow[];
  recordCount: number;
}

export interface PhoneLogFileMetadata extends Omit<PhoneLogFile, "rows"> {}

export interface ColumnFilterOption {
  value: string;
  label: string;
}

export interface PhoneLogView {
  id: string;
  fileName: string;
  displayName: string;
  serviceType: ServiceType;
  serviceLabel: string;
  lineNumber: string;
  lineDisplay: string;
  columns: string[];
  rows: PhoneLogRow[];
  recordCount: number;
  columnFilterOptions: Record<string, ColumnFilterOption[]>;
}

export interface AggregateOption {
  id: string;
  label: string;
  serviceType: ServiceType;
  lineNumber: string;
  lineDisplay: string;
}
