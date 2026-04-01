import { formatDateTime, formatMoney } from "../lib/format";
import type { ActivityItem } from "../types/dashboard";

interface ActivityFeedProps {
  items: ActivityItem[];
}

export function ActivityFeed({ items }: ActivityFeedProps) {
  return (
    <section className="panel">
      <div className="panel__header">
        <div>
          <h3>Son Hareketler</h3>
          <p>Kaynak projelerden gelen son finans sinyalleri</p>
        </div>
      </div>

      <div className="activity-feed">
        {items.length === 0 ? (
          <p className="empty-state">Henüz gösterilecek hareket yok.</p>
        ) : null}

        {items.map((item) => (
          <article className="activity-feed__item" key={item.id}>
            <div>
              <span className="activity-feed__source">{item.sourceName}</span>
              <strong>{item.description}</strong>
              <p>{formatDateTime(item.date)}</p>
            </div>
            <strong className={item.amount >= 0 ? "text-positive" : "text-negative"}>
              {formatMoney(item.amount, item.currency)}
            </strong>
          </article>
        ))}
      </div>
    </section>
  );
}
