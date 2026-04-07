export type SourceStatus = "ready" | "partial" | "pending" | "error";

export type CurrencyTotals = Record<string, number>;

export interface TrendPoint {
  date: string;
  label: string;
  income: number;
  expense: number;
  potentialIncome: number;
  potentialExpense: number;
}

export interface ActivityItem {
  id: string;
  sourceSlug: string;
  sourceName: string;
  date: string;
  description: string;
  amount: number;
  currency: string;
  type: "income" | "expense";
}

export interface SourceSegment {
  key: string;
  label: string;
  realizedIncome: number;
  realizedExpense: number;
  profit: number;
}

export interface ProjectFinanceSnapshot {
  slug: string;
  name: string;
  status: SourceStatus;
  lastUpdatedAt: string;
  currencyTotals: CurrencyTotals;
  realizedIncome: number;
  realizedExpense: number;
  potentialIncome: number;
  potentialExpense: number;
  profit: number;
  trend: TrendPoint[];
  highlights: string[];
  activities: ActivityItem[];
  issues: string[];
  segments?: SourceSegment[];
}

export interface DashboardRange {
  key: string;
  label: string;
  days: number;
  start: string;
  end: string;
}

export interface DashboardPayload {
  generatedAt: string;
  range: DashboardRange;
  totals: {
    realizedIncome: number;
    realizedExpense: number;
    potentialIncome: number;
    potentialExpense: number;
    profit: number;
    currencyTotals: CurrencyTotals;
  };
  sources: ProjectFinanceSnapshot[];
  combinedTrend: TrendPoint[];
  insights: string[];
}

export interface SourceContext {
  range: DashboardRange;
  filters?: {
    evrakSegment?: string;
  };
}

export interface SourceConfig {
  slug: string;
  name: string;
  apiBase: string;
  token?: string;
  authEmail?: string;
  authPassword?: string;
}
