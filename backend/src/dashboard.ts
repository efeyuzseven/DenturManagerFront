import { config } from "./config.js";
import { fetchAvrasyaSnapshot } from "./sources/avrasya.js";
import { fetchEvrakSnapshot } from "./sources/evrak.js";
import { fetchReservationSnapshot } from "./sources/reservation.js";
import type { CurrencyTotals, DashboardPayload, DashboardRange, TrendPoint } from "./types.js";

type DashboardSourceSlug = "reservation" | "evrak" | "avrasya";

const DASHBOARD_CACHE_TTL_MS = 2 * 60 * 1000;
const payloadCache = new Map<string, { expiresAt: number; value: DashboardPayload }>();

function addCurrencyTotals(target: CurrencyTotals, source: CurrencyTotals): CurrencyTotals {
  for (const [currency, amount] of Object.entries(source)) {
    target[currency] = (target[currency] || 0) + amount;
  }
  return target;
}

function combineTrend(sources: DashboardPayload["sources"], range: DashboardRange): TrendPoint[] {
  const dates = new Map<string, TrendPoint>();

  for (const source of sources) {
    for (const point of source.trend) {
      const current = dates.get(point.date) || {
        date: point.date,
        label: point.label,
        income: 0,
        expense: 0,
        potentialIncome: 0,
        potentialExpense: 0,
      };

      current.income += point.income;
      current.expense += point.expense;
      current.potentialIncome += point.potentialIncome;
      current.potentialExpense += point.potentialExpense;
      dates.set(point.date, current);
    }
  }

  return Array.from(dates.values()).sort((a, b) => a.date.localeCompare(b.date)).slice(-range.days);
}

export async function buildDashboardPayload(
  range: DashboardRange,
  filters?: { evrakSegment?: string },
  sourceFilter?: DashboardSourceSlug
): Promise<DashboardPayload> {
  const cacheKey = JSON.stringify({
    range,
    filters: filters || {},
    sourceFilter: sourceFilter || "all",
  });
  const cachedPayload = payloadCache.get(cacheKey);

  if (cachedPayload && cachedPayload.expiresAt > Date.now()) {
    return cachedPayload.value;
  }

  const context = { range, filters };
  const sources = await (async () => {
    if (sourceFilter === "reservation") {
      return [await fetchReservationSnapshot(config.reservation, context)];
    }

    if (sourceFilter === "evrak") {
      return [await fetchEvrakSnapshot(config.evrak, context)];
    }

    if (sourceFilter === "avrasya") {
      return [await fetchAvrasyaSnapshot(config.avrasya, context)];
    }

    const [reservation, evrak, avrasya] = await Promise.all([
      fetchReservationSnapshot(config.reservation, context),
      fetchEvrakSnapshot(config.evrak, context),
      fetchAvrasyaSnapshot(config.avrasya, context),
    ]);

    return [reservation, evrak, avrasya];
  })();

  const totals = sources.reduce(
    (acc, source) => {
      acc.realizedIncome += source.realizedIncome;
      acc.realizedExpense += source.realizedExpense;
      acc.potentialIncome += source.potentialIncome;
      acc.potentialExpense += source.potentialExpense;
      addCurrencyTotals(acc.currencyTotals, source.currencyTotals);
      return acc;
    },
    {
      realizedIncome: 0,
      realizedExpense: 0,
      potentialIncome: 0,
      potentialExpense: 0,
      currencyTotals: {} as CurrencyTotals,
    }
  );

  const profit = totals.realizedIncome - totals.realizedExpense;
  const bestSource = [...sources].sort((a, b) => b.profit - a.profit)[0];
  const riskiestSource = [...sources].sort((a, b) => a.profit - b.profit)[0];

  const payload: DashboardPayload = {
    generatedAt: new Date().toISOString(),
    range,
    totals: {
      ...totals,
      profit,
    },
    sources,
    combinedTrend: combineTrend(sources, range),
    insights:
      sources.length === 1
        ? [
            `${range.label} icinde toplam net sonuc ${Math.round(profit).toLocaleString("tr-TR")} TL.`,
            `${sources[0].name} verisi secili proje bazinda getirildi.`,
          ]
        : [
            `${range.label} icinde toplam net sonuc ${Math.round(profit).toLocaleString("tr-TR")} TL.`,
            `${bestSource.name} en guclu katkayi sagliyor.`,
            `${riskiestSource.name} tarafi yakin takip gerektiriyor.`,
          ],
  };

  payloadCache.set(cacheKey, {
    expiresAt: Date.now() + DASHBOARD_CACHE_TTL_MS,
    value: payload,
  });

  return payload;
}
