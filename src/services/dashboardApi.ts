import type { DashboardPayload } from "../types/dashboard";

const apiBaseUrl =
  import.meta.env.VITE_MANAGER_API_URL?.replace(/\/$/, "") ||
  "/api";

export interface DashboardQuery {
  range?: "7d" | "30d" | "90d";
  start?: string;
  end?: string;
  label?: string;
  mode?: "preset" | "day" | "month" | "year" | "custom";
  evrakSegment?: string;
  source?: "reservation" | "evrak" | "avrasya";
}

export async function getDashboardOverview(query: DashboardQuery) {
  const params = new URLSearchParams();

  if (query.range) {
    params.set("range", query.range);
  }

  if (query.start && query.end) {
    params.set("start", query.start);
    params.set("end", query.end);
  }

  if (query.label) {
    params.set("label", query.label);
  }

  if (query.mode) {
    params.set("mode", query.mode);
  }

  if (query.evrakSegment) {
    params.set("evrakSegment", query.evrakSegment);
  }

  if (query.source) {
    params.set("source", query.source);
  }

  const response = await fetch(`${apiBaseUrl}/dashboard/overview?${params.toString()}`);
  if (!response.ok) {
    throw new Error("Dashboard verisi alinamadi.");
  }
  return (await response.json()) as DashboardPayload;
}
