import { httpGet, httpPost, toNumber } from "../utils/http.js";
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

interface ReservationTokenResponse {
  accessToken: string;
  accessTokenExpiration?: string;
  refreshToken?: string;
  refreshTokenExpiration?: string;
}

interface ReservationTrendRow {
  date: string;
  formattedDate?: string;
  income: number;
  expense: number;
  potentialIncome: number;
  potentialExpense: number;
}

interface ReservationMonthlyRow {
  month: string;
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

const reservationTokenCache = new Map<string, { token: string; expiresAt: number }>();
const reservationMonthLabels = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
] as const;

function emptySnapshot(
  config: SourceConfig,
  status: ProjectFinanceSnapshot["status"],
  issues: string[]
): ProjectFinanceSnapshot {
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

function readExpiry(tokenResponse: ReservationTokenResponse): number {
  const expiresAt = tokenResponse.accessTokenExpiration
    ? new Date(tokenResponse.accessTokenExpiration).getTime()
    : Number.NaN;

  if (Number.isFinite(expiresAt)) {
    return expiresAt;
  }

  return Date.now() + 10 * 60 * 1000;
}

async function resolveReservationToken(source: SourceConfig): Promise<string | undefined> {
  if (source.token) {
    return source.token;
  }

  if (!source.authEmail || !source.authPassword) {
    return undefined;
  }

  const cacheKey = `${source.slug}:${source.apiBase}:${source.authEmail}`;
  const cachedToken = reservationTokenCache.get(cacheKey);

  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const tokenResponse = await httpPost<
    { email: string; password: string },
    ReservationTokenResponse
  >(source.apiBase, "/Auth/CreateToken", {
    email: source.authEmail,
    password: source.authPassword,
  });

  if (!tokenResponse.accessToken) {
    throw new Error("Rezervasyon token alinamadi.");
  }

  reservationTokenCache.set(cacheKey, {
    token: tokenResponse.accessToken,
    expiresAt: readExpiry(tokenResponse),
  });

  return tokenResponse.accessToken;
}

export async function fetchReservationSnapshot(
  source: SourceConfig,
  context: SourceContext
): Promise<ProjectFinanceSnapshot> {
  if (!source.apiBase) {
    return emptySnapshot(source, "pending", ["API adresi tanimlanmadi."]);
  }

  try {
    const token = await resolveReservationToken(source);
    const [cashSummary, monthlyData, dailyData, recentTransactions] = await Promise.all([
      httpGet<ReservationApiResponse<Record<string, number>>>(
        source.apiBase,
        "/Accounting/cash-summary",
        token
      ),
      httpGet<ReservationApiResponse<ReservationMonthlyRow[]>>(
        source.apiBase,
        "/Accounting/monthly-data",
        token
      ),
      httpGet<ReservationApiResponse<ReservationTrendRow[]>>(
        source.apiBase,
        `/Accounting/daily-data?days=${context.range.days}`,
        token
      ),
      httpGet<ReservationApiResponse<ReservationActivityRow[]>>(
        source.apiBase,
        "/Accounting/recent-transactions?count=8",
        token
      ),
    ]);

    const dailyTrend: TrendPoint[] = (dailyData.data || []).map((item) => ({
      date: item.date.slice(0, 10),
      label: item.formattedDate || item.date.slice(5, 10),
      income: toNumber(item.income),
      expense: toNumber(item.expense),
      potentialIncome: toNumber(item.potentialIncome),
      potentialExpense: toNumber(item.potentialExpense),
    }));

    const currentYear = new Date().getFullYear();
    const selectedYear = Number(context.range.start.slice(0, 4));
    const selectedMonthIndex = Number(context.range.start.slice(5, 7)) - 1;
    const supportsRequestedYear = selectedYear === currentYear;
    const monthlyRows = (monthlyData.data || []).map((item, index) => ({
      monthIndex: index,
      label: item.month || reservationMonthLabels[index] || `Ay ${index + 1}`,
      income: toNumber(item.income),
      expense: toNumber(item.expense),
      potentialIncome: toNumber(item.potentialIncome),
      potentialExpense: toNumber(item.potentialExpense),
    }));
    const monthlyTrend: TrendPoint[] = monthlyRows.map((item) => ({
      date: `${currentYear}-${String(item.monthIndex + 1).padStart(2, "0")}-01`,
      label: item.label,
      income: item.income,
      expense: item.expense,
      potentialIncome: item.potentialIncome,
      potentialExpense: item.potentialExpense,
    }));

    const baseTrend =
      supportsRequestedYear && (context.range.key === "month" || context.range.key === "year")
        ? context.range.key === "month"
          ? monthlyTrend.filter((item) => Number(item.date.slice(5, 7)) - 1 === selectedMonthIndex)
          : monthlyTrend
        : dailyTrend;

    const totals = baseTrend.reduce(
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

    const highlights = [
      `${context.range.label} icinde gerceklesen gelir ${Math.round(totals.realizedIncome).toLocaleString("tr-TR")} TL.`,
      `Nakit agirlik ${strongestCurrency} tarafinda toplanmis gorunuyor.`,
    ];

    const issues: string[] = [];

    if ((context.range.key === "month" || context.range.key === "year") && !supportsRequestedYear) {
      issues.push("Rezervasyon muhasebe servisi secili donem icin yalnizca mevcut yil ozetini destekliyor.");
    }

    if (totals.potentialIncome > 0) {
      highlights.push(
        `${context.range.label} icinde ${Math.round(totals.potentialIncome).toLocaleString("tr-TR")} TL potansiyel gelir bekliyor.`
      );
    }

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
      trend: baseTrend,
      activities,
      highlights,
      issues,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bilinmeyen hata";
    return emptySnapshot(source, "error", [message]);
  }
}
