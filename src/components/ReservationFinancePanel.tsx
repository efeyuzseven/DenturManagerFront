import { formatMoney } from "../lib/format";

interface ReservationFinancePanelProps {
  realizedIncome: number;
  realizedExpense: number;
  potentialIncome: number;
  potentialExpense: number;
}

export function ReservationFinancePanel({
  realizedIncome,
  realizedExpense,
  potentialIncome,
  potentialExpense,
}: ReservationFinancePanelProps) {
  const potentialIncomeGap = Math.max(0, potentialIncome - realizedIncome);
  const potentialExpenseGap = Math.max(0, potentialExpense - realizedExpense);

  const items = [
    {
      label: "Potansiyel Gelir",
      value: potentialIncome,
      className: "reservation-breakdown-item--potential-income",
    },
    {
      label: "Alınan Ödeme",
      value: realizedIncome,
      className: "reservation-breakdown-item--income",
    },
    {
      label: "Potansiyel Gelir Farkı",
      value: potentialIncomeGap,
      className: "reservation-breakdown-item--potential-income-gap",
    },
    {
      label: "Potansiyel Gider",
      value: potentialExpense,
      className: "reservation-breakdown-item--potential-expense",
    },
    {
      label: "Ödenen",
      value: realizedExpense,
      className: "reservation-breakdown-item--expense",
    },
    {
      label: "Potansiyel Gider Farkı",
      value: potentialExpenseGap,
      className: "reservation-breakdown-item--potential-expense-gap",
    },
  ];

  return (
    <section className="panel reservation-breakdown-panel">
      <div className="reservation-breakdown-card">
        <div className="reservation-breakdown-grid">
          {items.map((item) => (
            <article
              key={item.label}
              className={`reservation-breakdown-item ${item.className}`}
            >
              <span>{item.label}</span>
              <b>{formatMoney(item.value)}</b>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
