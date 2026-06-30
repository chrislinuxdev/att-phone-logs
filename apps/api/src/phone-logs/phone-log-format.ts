import { PhoneLogRow, ServiceType } from "./phone-logs.types";

export const columnsByServiceType: Record<ServiceType, string[]> = {
  VOICE: ["Day of Week", "Date", "Time", "Direction", "Number", "Nickname", "Duration", "Call Type", "City", "State"],
  TEXT: ["Day of Week", "Date", "Time", "Direction", "Number", "Nickname", "Description", "Usage Type"],
};

type LocalNicknameGetter = (phoneNumber: string) => string;

export function getUsageRows(value: unknown, lineNumber = ""): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];

  if (Array.isArray(value)) {
    value.forEach(item => rows.push(...getUsageRows(item, lineNumber)));
    return rows;
  }

  if (!value || typeof value !== "object") {
    return rows;
  }

  Object.entries(value).forEach(([key, item]) => {
    const nextLineNumber = /^\d{10}$/.test(key) ? key : lineNumber;

    if (key === "UsageDetailList" && Array.isArray(item)) {
      item.forEach(detail => {
        if (detail && typeof detail === "object") {
          rows.push({
            lineNumber: nextLineNumber,
            ...detail,
          });
        }
      });
      return;
    }

    rows.push(...getUsageRows(item, nextLineNumber));
  });

  return rows;
}

export function splitDateTime(row: Record<string, unknown>) {
  const dateTime = row.dateTime || row.DateTime || row.date || row.Date || "";
  const [date = "", ...timeParts] = String(dateTime).split(" ");

  return {
    date,
    time: String(row.time || row.Time || timeParts.join(" ")),
  };
}

export function getRowDate(row: Record<string, unknown>) {
  const { date, time } = splitDateTime(row);
  const match = String(date).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const timeMatch = String(time).match(/^(\d{2}):(\d{2}):(\d{2})(?:\s*([AP]M))?$/i);

  if (!match || !timeMatch) {
    return null;
  }

  const [, month, day, year] = match;
  let [, hours, minutes, seconds, meridiem] = timeMatch;
  let normalizedHours = Number(hours);

  if (meridiem) {
    const upperMeridiem = meridiem.toUpperCase();

    if (upperMeridiem === "PM" && normalizedHours < 12) {
      normalizedHours += 12;
    }

    if (upperMeridiem === "AM" && normalizedHours === 12) {
      normalizedHours = 0;
    }
  }

  return new Date(Number(year), Number(month) - 1, Number(day), normalizedHours, Number(minutes), Number(seconds));
}

export function getDateTimeSortValue(row: Record<string, unknown>) {
  const rowDate = getRowDate(row);
  return rowDate ? rowDate.getTime() : 0;
}

export function getDayOfWeek(row: Record<string, unknown>) {
  const rowDate = getRowDate(row);
  return rowDate ? rowDate.toLocaleDateString("en-US", { weekday: "long" }) : "";
}

export function normalizePhoneNumber(phoneNumber: unknown) {
  const digits = String(phoneNumber || "").replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

export function formatPhoneNumber(phoneNumber: unknown) {
  const digits = normalizePhoneNumber(phoneNumber);
  return digits.length === 10 ? `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}` : digits;
}

export function normalizeStoredPhoneNumbers(value: unknown): unknown {
  if (Array.isArray(value)) {
    value.forEach(item => normalizeStoredPhoneNumbers(item));
    return value;
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  Object.entries(value).forEach(([key, item]) => {
    if ((key === "numberCalled" || key === "recipientNumber") && typeof item === "string") {
      value[key] = formatPhoneNumber(item);
      return;
    }

    normalizeStoredPhoneNumbers(item);
  });

  return value;
}

export function getRowPhoneNumber(row: Record<string, unknown>) {
  return String(row.numberCalled || row.recipientNumber || "");
}

function addNicknameFields(row: PhoneLogRow, phoneNumber: string, getLocalNickname: LocalNicknameGetter): PhoneLogRow {
  const apiNickname = String(row.Nickname || "").trim();
  const localNickname = getLocalNickname(phoneNumber);
  const displayNickname = localNickname || apiNickname;

  return {
    ...row,
    "API Nickname": apiNickname,
    "Local Nickname": localNickname,
    "Display Nickname": displayNickname,
    "Nickname Overridden": Boolean(localNickname && apiNickname && localNickname !== apiNickname),
    "Normalized Number": normalizePhoneNumber(phoneNumber),
    "Has Nickname": Boolean(apiNickname || localNickname),
    "Short Number": normalizePhoneNumber(phoneNumber).length > 0 && normalizePhoneNumber(phoneNumber).length < 10,
  };
}

export function formatVoiceRow(row: Record<string, unknown>, fallbackLineNumber = "", getLocalNickname: LocalNicknameGetter): PhoneLogRow {
  const { date, time } = splitDateTime(row);
  const phoneNumber = getRowPhoneNumber(row);
  return addNicknameFields({
    "Day of Week": getDayOfWeek(row),
    Date: date,
    Time: time,
    Direction: String(row.direction || ""),
    Number: formatPhoneNumber(phoneNumber),
    Nickname: String(row.nickName || ""),
    Duration: String(row.callDuration ?? ""),
    "Call Type": String(row.callType || ""),
    City: String(row.city || ""),
    State: String(row.state || ""),
    Line: formatPhoneNumber(row.lineNumber || fallbackLineNumber || ""),
    "Sort Timestamp": getDateTimeSortValue(row),
  }, phoneNumber, getLocalNickname);
}

export function formatTextRow(row: Record<string, unknown>, fallbackLineNumber = "", getLocalNickname: LocalNicknameGetter): PhoneLogRow {
  const { date, time } = splitDateTime(row);
  const phoneNumber = getRowPhoneNumber(row);
  return addNicknameFields({
    "Day of Week": getDayOfWeek(row),
    Date: date,
    Time: time,
    Direction: String(row.direction || ""),
    Number: formatPhoneNumber(phoneNumber),
    Nickname: String(row.nickName || ""),
    Description: String(row.description || ""),
    "Usage Type": String(row.usageType || ""),
    Line: formatPhoneNumber(row.lineNumber || fallbackLineNumber || ""),
    "Sort Timestamp": getDateTimeSortValue(row),
  }, phoneNumber, getLocalNickname);
}

export function formatDisplayRows(details: unknown, serviceType: ServiceType, fallbackLineNumber = "", getLocalNickname: LocalNicknameGetter) {
  return getUsageRows(details, fallbackLineNumber)
    .map(row => serviceType === "TEXT"
      ? formatTextRow(row, fallbackLineNumber, getLocalNickname)
      : formatVoiceRow(row, fallbackLineNumber, getLocalNickname))
    .sort((left, right) => Number(right["Sort Timestamp"]) - Number(left["Sort Timestamp"]));
}

export function buildDedupKey(row: PhoneLogRow, serviceType: ServiceType) {
  const baseParts = [
    serviceType,
    String(row.Date || ""),
    String(row.Time || ""),
    String(row.Direction || "").toUpperCase(),
    String(row["Normalized Number"] || "").replace(/\D/g, ""),
  ];

  if (serviceType === "TEXT") {
    return baseParts.concat([
      String(row.Description || "").trim().toLowerCase(),
      String(row["Usage Type"] || "").trim().toLowerCase(),
    ]).join("|");
  }

  return baseParts.concat([
    String(row.Nickname || "").trim().toLowerCase(),
    String(row.Duration || ""),
    String(row["Call Type"] || ""),
    String(row.City || "").trim().toLowerCase(),
    String(row.State || "").trim().toLowerCase(),
  ]).join("|");
}

export function dedupeRows(rows: PhoneLogRow[], serviceType: ServiceType) {
  const seen = new Set<string>();

  return rows.filter(row => {
    const key = buildDedupKey(row, serviceType);

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export function getServiceLabel(serviceType: ServiceType) {
  return serviceType === "TEXT" ? "text" : "voice";
}

export function formatFileName(fileName: string) {
  const match = String(fileName || "").match(/^(\d{10,11})(-.+)$/);
  return match ? `${formatPhoneNumber(match[1])}${match[2]}` : fileName;
}
