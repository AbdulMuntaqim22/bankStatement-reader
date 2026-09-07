import { dateRange } from "../group/credits";
import type { TxGroup } from "../parse/types";

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function downloadCsv(groups: TxGroup[], filename: string): void {
  const lines = [
    "Title,Type,Date,Count,Total",
    ...groups.map((group) =>
      [
        csvEscape(group.title),
        group.type === "credit" ? "Credit" : "Debit",
        csvEscape(dateRange(group)),
        String(group.count),
        group.total.toFixed(2),
      ].join(","),
    ),
  ];
  triggerDownload(
    new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }),
    filename,
  );
}

export function downloadJson(groups: TxGroup[], filename: string): void {
  const payload = {
    groups,
    total: groups.reduce((sum, group) => sum + group.total, 0),
    transactionCount: groups.reduce((sum, group) => sum + group.count, 0),
  };
  triggerDownload(
    new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8",
    }),
    filename,
  );
}
