import { enumerateDates, formatLabel } from "../utils/date.js";
import { httpGet, toNumber } from "../utils/http.js";
import type {
  ActivityItem,
  ProjectFinanceSnapshot,
  SourceConfig,
  SourceContext,
  TrendPoint,
} from "../types.js";

interface AvrasyaApiResponse<T> {
  data?: T;
  response?: {
    code?: number;
    message?: string;
  };
  errors?: string[];
}

interface AvrasyaTourTicketListResponse {
  list: AvrasyaTourTicket[];
  totalCount: number;
}

interface AvrasyaTourTicket {
  reservationInfo: {
    tourName: string;
    date: string;
    ticketNo: string;
    priceInfo: {
      totalPrice: string;
      adultQuantity: number;
      childQuantity: number;
      babyQuantity: number;
    };
    paymentStatus: number;
    createdDate: string;
  };
  passengers: Array<{
    easyTicketBiletTutari?: number | null;
  }>;
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

function inferCurrencyCode(formattedTotal: string): string {
  if (formattedTotal.includes("€")) {
    return "EUR";
  }
  if (formattedTotal.includes("$")) {
    return "USD";
  }
  if (formattedTotal.includes("£")) {
    return "GBP";
  }
  return "TRY";
}

function parseFormattedMoney(formattedTotal: string): number {
  const cleaned = formattedTotal.replace(/[^\d,.-]/g, "");

  if (!cleaned) {
    return 0;
  }

  const normalized = cleaned.includes(",") && cleaned.includes(".")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned.includes(",")
      ? cleaned.replace(",", ".")
      : cleaned;

  return toNumber(normalized);
}

function getPassengerCount(ticket: AvrasyaTourTicket): number {
  const declaredCount =
    toNumber(ticket.reservationInfo.priceInfo.adultQuantity) +
    toNumber(ticket.reservationInfo.priceInfo.childQuantity) +
    toNumber(ticket.reservationInfo.priceInfo.babyQuantity);

  if (declaredCount > 0) {
    return declaredCount;
  }

  return ticket.passengers?.length || 0;
}

async function fetchPurchasedTickets(
  source: SourceConfig,
  start: string,
  end: string
): Promise<AvrasyaTourTicket[]> {
  const size = 500;
  let page = 0;
  let totalCount = Number.POSITIVE_INFINITY;
  const allTickets: AvrasyaTourTicket[] = [];

  while (page * size < totalCount) {
    const result = await httpGet<AvrasyaApiResponse<AvrasyaTourTicketListResponse>>(
      source.apiBase,
      `/TourTicket/${page}/${size}?startDate=${start}&endDate=${end}&paymentStatus=2`,
      source.token
    );

    const payload = result.data;
    const list = payload?.list || [];
    totalCount = payload?.totalCount ?? list.length;
    allTickets.push(...list);

    if (list.length === 0) {
      break;
    }

    page += 1;
  }

  return allTickets;
}

export async function fetchAvrasyaSnapshot(
  source: SourceConfig,
  context: SourceContext
): Promise<ProjectFinanceSnapshot> {
  if (!source.apiBase) {
    return emptySnapshot(source, "pending", ["API adresi tanimlanmadi."]);
  }

  try {
    const tickets = await fetchPurchasedTickets(
      source,
      context.range.start,
      context.range.end
    );

    const trendMap = new Map<string, TrendPoint>();
    for (const date of enumerateDates(context.range.start, context.range.end)) {
      trendMap.set(date, {
        date,
        label: formatLabel(date),
        income: 0,
        expense: 0,
        potentialIncome: 0,
        potentialExpense: 0,
      });
    }

    const currencyTotals: Record<string, number> = {};
    let totalPassengers = 0;
    let nonTryCount = 0;

    for (const ticket of tickets) {
      const date = ticket.reservationInfo.date.slice(0, 10);
      const totalPrice = parseFormattedMoney(ticket.reservationInfo.priceInfo.totalPrice);
      const currency = inferCurrencyCode(ticket.reservationInfo.priceInfo.totalPrice);
      const passengerCount = getPassengerCount(ticket);

      totalPassengers += passengerCount;
      currencyTotals[currency] = (currencyTotals[currency] || 0) + totalPrice;

      if (currency !== "TRY") {
        nonTryCount += 1;
      }

      const trendRow = trendMap.get(date);
      if (trendRow) {
        trendRow.income += totalPrice;
      }
    }

    const trend = Array.from(trendMap.values());
    const realizedIncome = Object.values(currencyTotals).reduce((sum, value) => sum + value, 0);
    const averageTicketValue = tickets.length > 0 ? realizedIncome / tickets.length : 0;

    const activities: ActivityItem[] = tickets.slice(0, 8).map((ticket) => {
      const amount = parseFormattedMoney(ticket.reservationInfo.priceInfo.totalPrice);
      const passengerCount = getPassengerCount(ticket);

      return {
        id: ticket.reservationInfo.ticketNo,
        sourceSlug: source.slug,
        sourceName: source.name,
        date: ticket.reservationInfo.createdDate || ticket.reservationInfo.date,
        description: `${ticket.reservationInfo.tourName} icin ${passengerCount} yolculu satin alim`,
        amount,
        currency: inferCurrencyCode(ticket.reservationInfo.priceInfo.totalPrice),
        type: "income",
      };
    });

    const issues: string[] = [];

    if (nonTryCount > 0) {
      issues.push(
        "Bazi Avrasya biletleri TRY disi para birimi tasiyor; toplam gelir karti ham tutarlari topluyor."
      );
    }

    return {
      slug: source.slug,
      name: source.name,
      status: "ready",
      lastUpdatedAt: new Date().toISOString(),
      currencyTotals,
      realizedIncome,
      realizedExpense: 0,
      potentialIncome: 0,
      potentialExpense: 0,
      profit: realizedIncome,
      trend,
      highlights: [
        "Avrasya tarafinda gider takibi bulunmadigi icin net sonuc gelir uzerinden hesaplanir.",
        `${context.range.label} icinde ${totalPassengers.toLocaleString("tr-TR")} yolcu tasindi.`,
        `${tickets.length.toLocaleString("tr-TR")} adet odenmis bilet kaydi bulundu.`,
        `Ortalama bilet tutari ${Math.round(averageTicketValue).toLocaleString("tr-TR")} olarak hesaplandi.`,
      ],
      activities,
      issues,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bilinmeyen hata";
    return emptySnapshot(source, "error", [message]);
  }
}
