import { formatDateTime, formatMoney, statusLabel } from "../lib/format";
import type { ProjectFinanceSnapshot } from "../types/dashboard";

interface SourceCardProps {
  source: ProjectFinanceSnapshot;
}

export function SourceCard({ source }: SourceCardProps) {
  return (
    <article className={`source-card source-card--${source.status}`}>
      <div className="source-card__header">
        <div>
          <span className="source-card__label">{statusLabel(source.status)}</span>
          <h3>{source.name}</h3>
        </div>
        <strong className={source.profit >= 0 ? "text-positive" : "text-negative"}>
          {formatMoney(source.profit)}
        </strong>
      </div>

      <div className="source-card__stats">
        <div>
          <span>Gelir</span>
          <strong>{formatMoney(source.realizedIncome)}</strong>
        </div>
        <div>
          <span>Gider</span>
          <strong>{formatMoney(source.realizedExpense)}</strong>
        </div>
        <div>
          <span>Potansiyel</span>
          <strong>{formatMoney(source.potentialIncome - source.potentialExpense)}</strong>
        </div>
      </div>

      <ul className="source-card__list">
        {source.highlights.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>

      {source.issues.length > 0 ? (
        <div className="source-card__issues">
          {source.issues.map((issue) => (
            <p key={issue}>{issue}</p>
          ))}
        </div>
      ) : null}

      <p className="source-card__footer">
        Son güncelleme: {formatDateTime(source.lastUpdatedAt)}
      </p>
    </article>
  );
}
