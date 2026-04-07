import { enumerateDates, formatLabel } from "../utils/date.js";
import { httpGet, httpPost, toNumber } from "../utils/http.js";
import type {
  ActivityItem,
  ProjectFinanceSnapshot,
  SourceConfig,
  SourceContext,
  SourceSegment,
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

interface PortRow {
  id: number;
  name: string;
}

interface AuthTokenResponse {
  accessToken: string;
  refreshToken?: string;
}

const GEZI_SEGMENT_LABEL = "Gezi S\u00f6zle\u015fmeleri";
const GEZI_SEGMENT_KEY = GEZI_SEGMENT_LABEL;
const OTHER_SEGMENT_KEY = "other";
const DEFAULT_EVRAK_SEGMENTS = [
  "\u00dcsk\u00fcdar Terminali",
  "Be\u015fikta\u015f Terminali",
  "Kabata\u015f Terminali",
  "Sirkeci Terminali",
  GEZI_SEGMENT_LABEL,
] as const;

const evrakTokenCache = new Map<string, { token: string; expiresAt: number }>();

function normalizeSegmentLabel(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("tr-TR")
    .replace(/\s+/g, " ")
    .trim();
}

function getPortSegmentKey(portId: number): string {
  return `port:${portId}`;
}

function getSegmentKeyForPortName(portName: string | undefined, ports: PortRow[]): string {
  if (!portName) {
    return OTHER_SEGMENT_KEY;
  }

  const normalizedPortName = normalizeSegmentLabel(portName);
  const matchedPort = ports.find((port) => normalizeSegmentLabel(port.name) === normalizedPortName);

  if (matchedPort) {
    return getPortSegmentKey(matchedPort.id);
  }

  return `name:${normalizedPortName}`;
}

function getSelectedPort(selectedSegment: string | undefined, ports: PortRow[]): PortRow | undefined {
  if (!selectedSegment || selectedSegment === "all" || selectedSegment === GEZI_SEGMENT_KEY) {
    return undefined;
  }

  if (selectedSegment.startsWith("port:")) {
    const portId = Number(selectedSegment.slice(5));
    return ports.find((port) => port.id === portId);
  }

  return ports.find((port) => getSegmentKeyForPortName(port.name, ports) === selectedSegment);
}

function getSelectedSegmentLabel(selectedSegment: string | undefined, ports: PortRow[]): string | undefined {
  if (!selectedSegment || selectedSegment === "all") {
    return undefined;
  }

  if (selectedSegment === GEZI_SEGMENT_KEY) {
    return GEZI_SEGMENT_LABEL;
  }

  return getSelectedPort(selectedSegment, ports)?.name;
}

function readJwtExpiry(token: string): number {
  try {
    const payload = token.split(".")[1];

    if (!payload) {
      return Date.now() + 15 * 60 * 1000;
    }

    const normalizedPayload = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decodedPayload = JSON.parse(Buffer.from(normalizedPayload, "base64").toString("utf8"));
    const exp = Number(decodedPayload?.exp);

    if (!Number.isFinite(exp)) {
      return Date.now() + 15 * 60 * 1000;
    }

    return exp * 1000;
  } catch {
    return Date.now() + 15 * 60 * 1000;
  }
}

async function resolveAuthToken(source: SourceConfig): Promise<string | undefined> {
  if (source.token) {
    return source.token;
  }

  if (!source.authEmail || !source.authPassword) {
    return undefined;
  }

  const cacheKey = `${source.slug}:${source.apiBase}:${source.authEmail}`;
  const cachedToken = evrakTokenCache.get(cacheKey);

  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const response = await httpPost<
    { email: string; password: string },
    EvrakApiResponse<AuthTokenResponse>
  >(source.apiBase, "/Auth/CreateToken", {
    email: source.authEmail,
    password: source.authPassword,
  });

  const token = response.data?.accessToken;

  if (!token) {
    throw new Error("EvrakTakip token alinamadi.");
  }

  evrakTokenCache.set(cacheKey, {
    token,
    expiresAt: readJwtExpiry(token),
  });

  return token;
}

function emptySnapshot(
  source: SourceConfig,
  status: ProjectFinanceSnapshot["status"],
  issues: string[]
): ProjectFinanceSnapshot {
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
    segments: [],
  };
}

async function fetchExpenseRowsForDay(
  source: SourceConfig,
  date: string,
  token?: string
): Promise<ExpenseTotalRow[]> {
  try {
    const result = await httpGet<EvrakApiResponse<ExpenseTotalRow | ExpenseTotalRow[]>>(
      source.apiBase,
      `/Expenses/daily-expense?StartCreatedDate=${date}&EndCreatedDate=${date}`,
      token
    );

    return Array.isArray(result.data) ? result.data : [result.data];
  } catch {
    return [];
  }
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
    const selectedSegment = context.filters?.evrakSegment;
    const issues: string[] = [];
    const token = await resolveAuthToken(source);
    let ports: PortRow[] = [];

    try {
      const portsResponse = await httpGet<EvrakApiResponse<PortRow[]>>(
        source.apiBase,
        "/ports/all-for-login",
        token
      );
      ports = portsResponse.data || [];
    } catch {
      issues.push("Iskele listesi alinamadi.");
    }

    const selectedPort = getSelectedPort(selectedSegment, ports);
    const selectedSegmentLabel = getSelectedSegmentLabel(selectedSegment, ports);
    const portQuery = selectedPort ? `&PortId=${selectedPort.id}` : "";

    const [
      incomeTotalsResult,
      expenseTotalsResult,
      incomeByBoxOfficeResult,
      portIncomeResult,
      geziEarningsResult,
    ] = await Promise.allSettled([
      httpGet<EvrakApiResponse<IncomeTotalRow[]>>(
        source.apiBase,
        `/BankForms/get-total-income-two-dates?StartDate=${start}&EndDate=${end}${portQuery}`,
        token
      ),
      httpGet<EvrakApiResponse<ExpenseTotalRow | ExpenseTotalRow[]>>(
        source.apiBase,
        `/Expenses/get-total-expense-two-dates?StartCreatedDate=${start}&EndCreatedDate=${end}`,
        token
      ),
      httpGet<EvrakApiResponse<IncomeByBoxOfficeRow[]>>(
        source.apiBase,
        `/BankForms/income-by-boxoffice?PageSize=10&PageNumber=1&StartDate=${start}&EndDate=${end}${portQuery}`,
        token
      ),
      httpGet<EvrakApiResponse<PortIncomeWithDates>>(
        source.apiBase,
        `/BankForms/port-income?PageSize=50&PageNumber=1&StartDate=${start}&EndDate=${end}${portQuery}`,
        token
      ),
      httpGet<EvrakApiResponse<number>>(
        source.apiBase,
        "/TourContracts_V2/get-total-earnings",
        token
      ),
    ]);

    const incomeTotals =
      incomeTotalsResult.status === "fulfilled" ? incomeTotalsResult.value.data || [] : [];
    const expenseTotals =
      expenseTotalsResult.status === "fulfilled" ? expenseTotalsResult.value.data : [];
    const incomeByBoxOffice =
      incomeByBoxOfficeResult.status === "fulfilled" ? incomeByBoxOfficeResult.value.data || [] : [];
    const portIncome =
      portIncomeResult.status === "fulfilled"
        ? portIncomeResult.value.data || { dates: [], portIncomes: [] }
        : { dates: [], portIncomes: [] };
    const geziEarnings =
      geziEarningsResult.status === "fulfilled" ? toNumber(geziEarningsResult.value.data) : 0;

    if (incomeTotalsResult.status === "rejected") {
      issues.push("Gelir toplamlari alinirken bir hata olustu.");
    }

    if (expenseTotalsResult.status === "rejected") {
      issues.push("Gider toplamlari alinirken bir hata olustu.");
    }

    if (incomeByBoxOfficeResult.status === "rejected") {
      issues.push("Gise dagilimi bilgisi alinamadi.");
    }

    if (portIncomeResult.status === "rejected") {
      issues.push("Gunluk gelir akisi alinamadi.");
    }

    if (geziEarningsResult.status === "rejected") {
      issues.push("Gezi Sozlesmeleri toplam kazanci alinamadi.");
    }

    const expensePayload = Array.isArray(expenseTotals) ? expenseTotals : [expenseTotals];
    const segmentMap = new Map<string, SourceSegment>();
    const seededLabels = Array.from(
      new Set([
        ...ports.map((port) => (port?.name || "").trim()).filter(Boolean),
        ...DEFAULT_EVRAK_SEGMENTS,
      ])
    );
    const defaultSegmentOrder = new Map<string, number>(
      seededLabels.map((segment, index) => [segment, index])
    );

    for (const label of seededLabels) {
      segmentMap.set(label, {
        key: label === GEZI_SEGMENT_LABEL ? GEZI_SEGMENT_KEY : getSegmentKeyForPortName(label, ports),
        label,
        realizedIncome: 0,
        realizedExpense: 0,
        profit: 0,
      });
    }

    for (const row of incomeTotals) {
      const label = row.portName || "Diger";
      const current = segmentMap.get(label) || {
        key: getSegmentKeyForPortName(label, ports),
        label,
        realizedIncome: 0,
        realizedExpense: 0,
        profit: 0,
      };
      current.realizedIncome += toNumber(row.totalAmount);
      segmentMap.set(label, current);
    }

    for (const row of expensePayload) {
      const label = row?.portName || "Diger";
      const current = segmentMap.get(label) || {
        key: getSegmentKeyForPortName(label, ports),
        label,
        realizedIncome: 0,
        realizedExpense: 0,
        profit: 0,
      };
      current.realizedExpense += toNumber(row?.expensesTotal);
      segmentMap.set(label, current);
    }

    segmentMap.set(GEZI_SEGMENT_LABEL, {
      key: GEZI_SEGMENT_KEY,
      label: GEZI_SEGMENT_LABEL,
      realizedIncome: geziEarnings,
      realizedExpense: 0,
      profit: geziEarnings,
    });

    const segments = Array.from(segmentMap.values())
      .map((segment) => ({
        ...segment,
        profit: segment.realizedIncome - segment.realizedExpense,
      }))
      .sort((left, right) => {
        const leftOrder = defaultSegmentOrder.get(left.label);
        const rightOrder = defaultSegmentOrder.get(right.label);

        if (leftOrder !== undefined && rightOrder !== undefined) {
          return leftOrder - rightOrder;
        }

        if (leftOrder !== undefined) {
          return -1;
        }

        if (rightOrder !== undefined) {
          return 1;
        }

        return right.realizedIncome - left.realizedIncome;
      });

    const matchesSegment = (portName?: string) =>
      !selectedSegment ||
      selectedSegment === "all" ||
      getSegmentKeyForPortName(portName, ports) === selectedSegment;

    const baseRealizedIncome = incomeTotals
      .filter((item) => matchesSegment(item.portName))
      .reduce((sum, item) => sum + toNumber(item.totalAmount), 0);

    const realizedExpense = expensePayload
      .filter((item) => matchesSegment(item?.portName))
      .reduce((sum, item) => sum + toNumber(item?.expensesTotal), 0);

    const realizedIncome = baseRealizedIncome + geziEarnings;
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

    for (const port of portIncome.portIncomes || []) {
      if (!matchesSegment(port.portName)) {
        continue;
      }

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
        rows: await fetchExpenseRowsForDay(source, date, token),
      }))
    );

    for (const pair of expensePairs) {
      const row = dayMap.get(pair.date);

      if (!row) {
        continue;
      }

      row.expense = pair.rows
        .filter((item) => matchesSegment(item?.portName))
        .reduce((sum, item) => sum + toNumber(item?.expensesTotal), 0);
    }

    const trend = Array.from(dayMap.values());
    const topBoxOffice = incomeByBoxOffice
      .filter((port) => matchesSegment(port.portName))
      .flatMap((port) =>
        (port.incomes || []).map((boxOffice) => ({
          portName: port.portName,
          boxOfficeName: boxOffice.boxOfficeName,
          amount: toNumber(boxOffice.currencyAmount),
        }))
      )
      .sort((left, right) => right.amount - left.amount)[0];

    const activities: ActivityItem[] = trend
      .filter((item) => item.income > 0 || item.expense > 0)
      .slice(-6)
      .map((item) => ({
        id: `${source.slug}-${item.date}`,
        sourceSlug: source.slug,
        sourceName: source.name,
        date: item.date,
        description:
          selectedSegmentLabel && selectedSegment !== GEZI_SEGMENT_KEY
            ? `${item.label} gunu ${selectedSegmentLabel} hareket ozeti`
            : `${item.label} gunu EvrakTakip hareket ozeti`,
        amount: item.income - item.expense,
        currency: "TRY",
        type: item.income >= item.expense ? "income" : "expense",
      }));

    return {
      slug: source.slug,
      name: source.name,
      status: issues.length > 0 ? "partial" : "ready",
      lastUpdatedAt: new Date().toISOString(),
      currencyTotals: { TRY: realizedIncome - realizedExpense },
      realizedIncome,
      realizedExpense,
      potentialIncome: 0,
      potentialExpense: 0,
      profit: realizedIncome - realizedExpense,
      trend,
      activities,
      segments,
      highlights: topBoxOffice
        ? [
            `${topBoxOffice.boxOfficeName} / ${topBoxOffice.portName} en yuksek geliri uretti.`,
            `${context.range.label} icinde toplam gelir ${Math.round(realizedIncome).toLocaleString("tr-TR")} TL.`,
            "Gezi Sozlesmeleri toplam kazanci tarih filtresinden bagimsiz gosterilir.",
          ]
        : [
            selectedSegmentLabel
              ? `${selectedSegmentLabel} icin gelir ve gider toplamlari alindi.`
              : `${context.range.label} icin gelir ve gider toplamlari alindi.`,
            "Gezi Sozlesmeleri toplam kazanci tarih filtresinden bagimsiz gosterilir.",
          ],
      issues,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bilinmeyen hata";
    return emptySnapshot(source, "error", [message]);
  }
}
