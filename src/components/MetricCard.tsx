import type { ReactNode } from "react";

interface MetricCardProps {
  eyebrow: string;
  value: string;
  caption: string;
  tone?: "income" | "expense" | "neutral";
  aside?: ReactNode;
}

export function MetricCard({
  eyebrow,
  value,
  caption,
  tone = "neutral",
  aside,
}: MetricCardProps) {
  return (
    <article className={`metric-card metric-card--${tone}`}>
      <div className="metric-card__top">
        <span className="metric-card__eyebrow">{eyebrow}</span>
        {aside}
      </div>
      <strong className="metric-card__value">{value}</strong>
      <p className="metric-card__caption">{caption}</p>
    </article>
  );
}
