import { httpGet, toNumber } from "../utils/http.js";
import { enumerateDates, formatLabel } from "../utils/date.js";
import type {
  ActivityItem,
  ProjectFinanceSnapshot,
  SourceConfig,
  SourceContext,
  TrendPoint,
} from "../types.js";

interface EvrakApiResponse<T> {
  code: number;
  data: T;
  messages: string[];
}

interface IncomeTotalRow {
  portName: string;
  totalAmount: number;
}

interface ExpenseTotalRow {
  portName: string;
  expensesCount: number;
  expensesTotal: number;
}

interface IncomeByBoxOfficeRow {
  portId: number;
  portName: string;
  incomes: Array<{
    boxOfficeName: string;
    currencyAmount: number;
  }>;
}

interface PortIncomeWithDates {
  dates: string[];
  portIncomes: Array<{
    portId?: number;
    portName: string;
    incomes: Array<{
      processDate: string;
      currencyAmount: number;
    }>;
  }>;
}

function emptySnapshot(source: SourceConfig, status: ProjectFinanceSnapshot["status"], issues: string[]): ProjectFinanceSnapshot {
  return {
    slug: source.slug,
    name: source.name,
    status,
    lastUpdatedAt: new Date().toISOString(),
    currencyTotals: { TRY: 0 },
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

async function fetchExpenseForDay(source: SourceConfig, date: string): Promise<number> {
  const result = await httpGet<EvrakApiResponse<ExpenseTotalRow | ExpenseTotalRow[]>>(
    source.apiBase,
    `/Expenses/daily-expense?StartCreatedDate=${date}&EndCreatedDate=${date}`,
    source.token
  );

  const payload = Array.isArray(result.data) ? result.data : [result.data];
  return payload.reduce((sum, item) => sum + toNumber(item?.expensesTotal), 0);
}

export async function fetchEvrakSnapshot(
  source: SourceConfig,
  context: SourceContext
): Promise<ProjectFinanceSnapshot> {
  if (!source.apiBase) {
    return emptySnapshot(source, "pending", ["API adresi tanimlanmadi."]);
  }

  try {
    const start = context.range.start;
    const end = context.range.end;

    const [incomeTotals, expenseTotals, incomeByBoxOffice, portIncome] = await Promise.all([
      httpGet<EvrakApiResponse<IncomeTotalRow[]>>(
        source.apiBase,
        `/BankForms/get-total-income-two-dates?StartDate=${start}&EndDate=${end}`,
        source.token
      ),
      httpGet<EvrakApiResponse<ExpenseTotalRow | ExpenseTotalRow[]>>(
        source.apiBase,
        `/Expenses/get-total-expense-two-dates?StartCreatedDate=${start}&EndCreatedDate=${end}`,
        source.token
      ),
      httpGet<EvrakApiResponse<IncomeByBoxOfficeRow[]>>(
        source.apiBase,
        `/BankForms/income-by-boxoffice?PageSize=10&PageNumber=1&StartDate=${start}&EndDate=${end}`,
        source.token
      ),
      httpGet<EvrakApiResponse<PortIncomeWithDates>>(
        source.apiBase,
        `/BankForms/port-income?PageSize=50&PageNumber=1&StartDate=${start}&EndDate=${end}`,
        source.token
      ),
    ]);

    const realizedIncome = (incomeTotals.data || []).reduce(
      (sum, item) => sum + toNumber(item.totalAmount),
      0
    );

    const expensePayload = Array.isArray(expenseTotals.data)
      ? expenseTotals.data
      : [expenseTotals.data];
    const realizedExpense = expensePayload.reduce(
      (sum, item) => sum + toNumber(item?.expensesTotal),
      0
    );

    const dayMap = new Map<string, TrendPoint>();
    for (const date of enumerateDates(start, end)) {
      dayMap.set(date, {
        date,
        label: formatLabel(date),
        income: 0,
        expense: 0,
        potentialIncome: 0,
        potentialExpense: 0,
      });
    }

    for (const port of portIncome.data?.portIncomes || []) {
      for (const income of port.incomes || []) {
        const date = income.processDate?.slice(0, 10);
        if (!date || !dayMap.has(date)) {
          continue;
        }
        dayMap.get(date)!.income += toNumber(income.currencyAmount);
      }
    }

    const expensePairs = await Promise.all(
      Array.from(dayMap.keys()).map(async (date) => ({
        date,
        total: await fetchExpenseForDay(source, date),
      }))
    );

    for (const pair of expensePairs) {
      const row = dayMap.get(pair.date);
      if (row) {
        row.expense = pair.total;
      }
    }

    const trend = Array.from(dayMap.values());
    const topBoxOffice = (incomeByBoxOffice.data || [])
      .flatMap((port) =>
        (port.incomes || []).map((boxOffice) => ({
          portName: port.portName,
          boxOfficeName: boxOffice.boxOfficeName,
          amount: toNumber(boxOffice.currencyAmount),
        }))
      )
      .sort((a, b) => b.amount - a.amount)[0];

    const activities: ActivityItem[] = trend
      .filter((item) => item.income > 0 || item.expense > 0)
      .slice(-6)
      .map((item) => ({
        id: `${source.slug}-${item.date}`,
        sourceSlug: source.slug,
        sourceName: source.name,
        date: item.date,
        description: `${item.label} gunu EvrakTakip ozet hareketi`,
        amount: item.income - item.expense,
        currency: "TRY",
        type: item.income >= item.expense ? "income" : "expense",
      }));

    return {
      slug: source.slug,
      name: source.name,
      status: "partial",
      lastUpdatedAt: new Date().toISOString(),
      currencyTotals: { TRY: realizedIncome - realizedExpense },
      realizedIncome,
      realizedExpense,
      potentialIncome: 0,
      potentialExpense: 0,
      profit: realizedIncome - realizedExpense,
      trend,
      activities,
      highlights: topBoxOffice
        ? [
            `${topBoxOffice.boxOfficeName} / ${topBoxOffice.portName} en yuksek geliri uretti.`,
            `${context.range.label} icinde toplam gelir ${Math.round(realizedIncome).toLocaleString("tr-TR")} TL.`,
          ]
        : [`${context.range.label} icin gelir ve gider toplamlari alindi.`],
      issues: [
        "EvrakTakip tarafinda potansiyel gelir-gider alani hazir endpoint olarak bulunmadi.",
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bilinmeyen hata";
    return emptySnapshot(source, "error", [message]);
  }
}
