import type { TrendPoint } from "../types/dashboard";
import { formatCompactNumber } from "../lib/format";

interface TrendPanelProps {
  title: string;
  subtitle: string;
  points: TrendPoint[];
}

export function TrendPanel({ title, subtitle, points }: TrendPanelProps) {
  const max = Math.max(
    1,
    ...points.map((point) =>
      Math.max(point.income, point.expense, point.potentialIncome, point.potentialExpense)
    )
  );

  return (
    <section className="panel">
      <div className="panel__header">
        <div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
      </div>

      <div className="trend">
        {points.map((point) => (
          <div className="trend__row" key={point.date}>
            <div className="trend__meta">
              <span>{point.label}</span>
              <strong>{formatCompactNumber(point.income - point.expense)}</strong>
            </div>

            <div className="trend__bars">
              <span
                className="trend__bar trend__bar--income"
                style={{ width: `${(point.income / max) * 100}%` }}
                title={`Gelir ${point.income}`}
              />
              <span
                className="trend__bar trend__bar--expense"
                style={{ width: `${(point.expense / max) * 100}%` }}
                title={`Gider ${point.expense}`}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
