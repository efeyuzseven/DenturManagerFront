import { httpGet, toNumber } from "../utils/http.js";
import type {
  ActivityItem,
  ProjectFinanceSnapshot,
  SourceConfig,
  SourceContext,
  TrendPoint,
} from "../types.js";

interface ReservationApiResponse<T> {
  data: T;
  statusCode: number;
  isSuccess: boolean;
  message?: string;
}

interface ReservationTrendRow {
  date: string;
  formattedDate?: string;
  income: number;
  expense: number;
  potentialIncome: number;
  potentialExpense: number;
}

interface ReservationActivityRow {
  id: string;
  date: string;
  description: string;
  amount: number;
  currency: string;
  type: "income" | "expense";
}

function emptySnapshot(config: SourceConfig, status: ProjectFinanceSnapshot["status"], issues: string[]): ProjectFinanceSnapshot {
  return {
    slug: config.slug,
    name: config.name,
    status,
    lastUpdatedAt: new Date().toISOString(),
    currencyTotals: {},
    realizedIncome: 0,
    realizedExpense: 0,
    potentialIncome: 0,
    potentialExpense: 0,
    profit: 0,
    trend: [],
    highlights: [],
    activities: [],
    issues,
  };
}

export async function fetchReservationSnapshot(
  source: SourceConfig,
  context: SourceContext
): Promise<ProjectFinanceSnapshot> {
  if (!source.apiBase) {
    return emptySnapshot(source, "pending", ["API adresi tanimlanmadi."]);
  }

  try {
    const [cashSummary, dailyData, recentTransactions] = await Promise.all([
      httpGet<ReservationApiResponse<Record<string, number>>>(
        source.apiBase,
        "/Accounting/cash-summary",
        source.token
      ),
      httpGet<ReservationApiResponse<ReservationTrendRow[]>>(
        source.apiBase,
        `/Accounting/daily-data?days=${context.range.days}`,
        source.token
      ),
      httpGet<ReservationApiResponse<ReservationActivityRow[]>>(
        source.apiBase,
        "/Accounting/recent-transactions?count=8",
        source.token
      ),
    ]);

    const trend: TrendPoint[] = (dailyData.data || []).map((item) => ({
      date: item.date.slice(0, 10),
      label: item.formattedDate || item.date.slice(5, 10),
      income: toNumber(item.income),
      expense: toNumber(item.expense),
      potentialIncome: toNumber(item.potentialIncome),
      potentialExpense: toNumber(item.potentialExpense),
    }));

    const totals = trend.reduce(
      (acc, item) => {
        acc.realizedIncome += item.income;
        acc.realizedExpense += item.expense;
        acc.potentialIncome += item.potentialIncome;
        acc.potentialExpense += item.potentialExpense;
        return acc;
      },
      {
        realizedIncome: 0,
        realizedExpense: 0,
        potentialIncome: 0,
        potentialExpense: 0,
      }
    );

    const activities: ActivityItem[] = (recentTransactions.data || []).map((item) => ({
      id: item.id,
      sourceSlug: source.slug,
      sourceName: source.name,
      date: item.date,
      description: item.description,
      amount: toNumber(item.amount),
      currency: item.currency,
      type: item.type,
    }));

    const profit = totals.realizedIncome - totals.realizedExpense;
    const strongestCurrency =
      Object.entries(cashSummary.data || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || "TRY";

    return {
      slug: source.slug,
      name: source.name,
      status: "ready",
      lastUpdatedAt: new Date().toISOString(),
      currencyTotals: cashSummary.data || {},
      realizedIncome: totals.realizedIncome,
      realizedExpense: totals.realizedExpense,
      potentialIncome: totals.potentialIncome,
      potentialExpense: totals.potentialExpense,
      profit,
      trend,
      activities,
      highlights: [
        `${context.range.label} icinde gerceklesen gelir ${Math.round(totals.realizedIncome).toLocaleString("tr-TR")} TL.`,
        `Nakit agirlik ${strongestCurrency} tarafinda toplanmis gorunuyor.`,
      ],
      issues: [],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bilinmeyen hata";
    return emptySnapshot(source, "error", [message]);
  }
}
