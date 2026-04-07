import { useMemo, useState } from "react";
import { formatMoney } from "../lib/format";
import type { TrendPoint } from "../types/dashboard";

interface TrendPanelProps {
  title: string;
  subtitle: string;
  points: TrendPoint[];
}

type GroupMode = "daily" | "weekly" | "monthly";
type ViewMode = "table" | "chart";

type TrendRow = {
  key: string;
  label: string;
  income: number;
  expense: number;
  potentialIncome: number;
  potentialExpense: number;
};

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
  }).format(new Date(`${value}T00:00:00`));
}

function formatMonthLabel(value: string) {
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("tr-TR", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));
}

function resolveGroupMode(points: TrendPoint[]): GroupMode {
  if (points.length > 180) {
    return "monthly";
  }

  if (points.length > 60) {
    return "weekly";
  }

  return "daily";
}

function aggregateTrend(points: TrendPoint[]): { rows: TrendRow[]; mode: GroupMode } {
  const mode = resolveGroupMode(points);

  if (mode === "daily") {
    return {
      mode,
      rows: points.map((point) => ({
        key: point.date,
        label: point.label,
        income: point.income,
        expense: point.expense,
        potentialIncome: point.potentialIncome,
        potentialExpense: point.potentialExpense,
      })),
    };
  }

  if (mode === "weekly") {
    const rows: TrendRow[] = [];

    for (let index = 0; index < points.length; index += 7) {
      const chunk = points.slice(index, index + 7);
      const first = chunk[0];
      const last = chunk[chunk.length - 1];

      rows.push({
        key: `${first.date}-${last.date}`,
        label: `${formatShortDate(first.date)} - ${formatShortDate(last.date)}`,
        income: chunk.reduce((sum, item) => sum + item.income, 0),
        expense: chunk.reduce((sum, item) => sum + item.expense, 0),
        potentialIncome: chunk.reduce((sum, item) => sum + item.potentialIncome, 0),
        potentialExpense: chunk.reduce((sum, item) => sum + item.potentialExpense, 0),
      });
    }

    return { mode, rows };
  }

  const monthMap = new Map<string, TrendRow>();

  for (const point of points) {
    const monthKey = point.date.slice(0, 7);
    const current = monthMap.get(monthKey) || {
      key: monthKey,
      label: formatMonthLabel(monthKey),
      income: 0,
      expense: 0,
      potentialIncome: 0,
      potentialExpense: 0,
    };

    current.income += point.income;
    current.expense += point.expense;
    current.potentialIncome += point.potentialIncome;
    current.potentialExpense += point.potentialExpense;
    monthMap.set(monthKey, current);
  }

  return {
    mode,
    rows: Array.from(monthMap.values()),
  };
}

export function TrendPanel({ title, subtitle, points }: TrendPanelProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const { rows, mode } = aggregateTrend(points);
  const modeLabel =
    mode === "daily" ? "Günlük görünüm" : mode === "weekly" ? "Haftalık özet" : "Aylık özet";
  const maxValue = useMemo(
    () =>
      Math.max(
        1,
        ...rows.flatMap((row) => [row.income, row.expense, Math.abs(row.income - row.expense)])
      ),
    [rows]
  );

  return (
    <section className="panel">
      <div className="panel__header">
        <div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>

        <div className="trend-panel__actions">
          <div className="trend-view-switch">
            <button
              className={viewMode === "table" ? "is-active" : ""}
              onClick={() => setViewMode("table")}
              aria-label="Tablo görünümü"
              title="Tablo görünümü"
              type="button"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="M3 10h18M9 5v14M15 5v14" />
              </svg>
            </button>
            <button
              className={viewMode === "chart" ? "is-active" : ""}
              onClick={() => setViewMode("chart")}
              aria-label="Grafik görünümü"
              title="Grafik görünümü"
              type="button"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 19V9" />
                <path d="M10 19V5" />
                <path d="M16 19v-7" />
                <path d="M22 19v-11" />
              </svg>
            </button>
          </div>
          <span className="trend-panel__badge">{modeLabel}</span>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="empty-state">Bu tarih aralığında gösterilecek akış bulunmuyor.</p>
      ) : viewMode === "chart" ? (
        <div className="trend-chart">
          <div className="trend-chart__legend">
            <span><i className="trend-chart__swatch trend-chart__swatch--income" />Gelir</span>
            <span><i className="trend-chart__swatch trend-chart__swatch--expense" />Gider</span>
          </div>

          <div className="trend-chart__viewport">
            <div className="trend-chart__grid">
              {rows.map((row) => {
                const net = row.income - row.expense;

                return (
                  <article className="trend-chart__group" key={row.key}>
                    <span className={net >= 0 ? "trend-chart__net text-positive" : "trend-chart__net text-negative"}>
                      {formatMoney(net)}
                    </span>

                    <div className="trend-chart__columns">
                      <div className="trend-chart__column">
                        <span
                          className="trend-chart__bar trend-chart__bar--income"
                          style={{ height: `${(row.income / maxValue) * 100}%` }}
                          title={`Gelir: ${formatMoney(row.income)}`}
                        />
                      </div>

                      <div className="trend-chart__column">
                        <span
                          className="trend-chart__bar trend-chart__bar--expense"
                          style={{ height: `${(row.expense / maxValue) * 100}%` }}
                          title={`Gider: ${formatMoney(row.expense)}`}
                        />
                      </div>
                    </div>

                    <strong className="trend-chart__label">{row.label}</strong>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="trend-table">
          <table>
            <thead>
              <tr>
                <th>Dönem</th>
                <th>Gelir</th>
                <th>Gider</th>
                <th>Net Sonuç</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const net = row.income - row.expense;

                return (
                  <tr key={row.key}>
                    <td>{row.label}</td>
                    <td>{formatMoney(row.income)}</td>
                    <td>{formatMoney(row.expense)}</td>
                    <td className={net >= 0 ? "text-positive" : "text-negative"}>
                      {formatMoney(net)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
