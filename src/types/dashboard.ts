export type SourceStatus = "ready" | "partial" | "pending" | "error";

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
  currencyTotals: Record<string, number>;
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

export interface DashboardPayload {
  generatedAt: string;
  range: {
    key: string;
    label: string;
    days: number;
    start: string;
    end: string;
  };
  totals: {
    realizedIncome: number;
    realizedExpense: number;
    potentialIncome: number;
    potentialExpense: number;
    profit: number;
    currencyTotals: Record<string, number>;
  };
  sources: ProjectFinanceSnapshot[];
  combinedTrend: TrendPoint[];
  insights: string[];
}
