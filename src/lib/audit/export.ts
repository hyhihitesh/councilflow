export type AuditExportPayload = {
  exported_at: string;
  period_days: number;
  records: Array<Record<string, unknown>>;
};

function escapeCsvValue(value: unknown) {
  if (value === null || value === undefined) return "";

  const asString =
    typeof value === "string"
      ? value
      : typeof value === "number" || typeof value === "boolean"
        ? String(value)
        : JSON.stringify(value);

  if (/[",\n\r]/.test(asString)) {
    return `"${asString.replace(/"/g, '""')}"`;
  }

  return asString;
}

export function recordsToCsv(records: Array<Record<string, unknown>>) {
  if (!records.length) return "";

  const headerSet = new Set<string>();
  for (const record of records) {
    Object.keys(record).forEach((key) => headerSet.add(key));
  }

  const headers = Array.from(headerSet);
  const headerLine = headers.join(",");

  const lines = records.map((record) =>
    headers.map((header) => escapeCsvValue(record[header])).join(","),
  );

  return [headerLine, ...lines].join("\n");
}
