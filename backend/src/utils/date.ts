import type { DashboardRange } from "../types.js";

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function differenceInDays(start: Date, end: Date): number {
  const millisecondsPerDay = 1000 * 60 * 60 * 24;
  return Math.floor((end.getTime() - start.getTime()) / millisecondsPerDay) + 1;
}

export function resolveRange(
  rangeKey: string | undefined,
  startInput?: string,
  endInput?: string,
  labelInput?: string,
  modeInput?: string
): DashboardRange {
  if (startInput && endInput) {
    const start = new Date(`${startInput}T00:00:00`);
    const end = new Date(`${endInput}T00:00:00`);

    return {
      key: modeInput || "custom",
      label: labelInput || `${startInput} - ${endInput}`,
      days: Math.max(1, differenceInDays(start, end)),
      start: formatDate(start),
      end: formatDate(end),
    };
  }

  const normalized = rangeKey === "7d" || rangeKey === "90d" ? rangeKey : "30d";
  const days = normalized === "7d" ? 7 : normalized === "90d" ? 90 : 30;
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (days - 1));

  return {
    key: normalized,
    label: `${days} gun`,
    days,
    start: formatDate(start),
    end: formatDate(end),
  };
}

export function enumerateDates(start: string, end: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${start}T00:00:00`);
  const boundary = new Date(`${end}T00:00:00`);

  while (cursor <= boundary) {
    dates.push(formatDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

export function formatLabel(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
  }).format(parsed);
}
