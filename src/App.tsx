import { useEffect, useMemo, useState } from "react";
import "./index.css";
import { ActivityFeed } from "./components/ActivityFeed";
import { MetricCard } from "./components/MetricCard";
import { TrendPanel } from "./components/TrendPanel";
import { formatDateTime, formatMoney, statusLabel } from "./lib/format";
import { getDashboardOverview } from "./services/dashboardApi";
import type { ActivityItem, DashboardPayload, ProjectFinanceSnapshot } from "./types/dashboard";

type FilterMode = "day" | "month" | "year";
type ProjectSection = "reservation" | "evrak" | "avrasya";

function formatDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function createMonthRange(monthValue: string) {
  const [year, month] = monthValue.split("-").map(Number);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);

  return {
    start: formatDate(start),
    end: formatDate(end),
    label: new Intl.DateTimeFormat("tr-TR", {
      month: "long",
      year: "numeric",
    }).format(start),
  };
}

function createYearRange(yearValue: string) {
  const year = Number(yearValue);
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31);

  return {
    start: formatDate(start),
    end: formatDate(end),
    label: `${year}`,
  };
}

function getProjectSource(
  data: DashboardPayload | null,
  section: ProjectSection
): ProjectFinanceSnapshot | null {
  if (!data) {
    return null;
  }

  return data.sources.find((source) => source.slug === section) || null;
}

function App() {
  const [filterMode, setFilterMode] = useState<FilterMode>("month");
  const [selectedDay, setSelectedDay] = useState(formatDate(new Date()));
  const [selectedMonth, setSelectedMonth] = useState(formatDate(new Date()).slice(0, 7));
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));
  const [section, setSection] = useState<ProjectSection>("reservation");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const dashboardQuery = useMemo(() => {
    if (filterMode === "day") {
      return {
        mode: "day" as const,
        start: selectedDay,
        end: selectedDay,
        label: new Intl.DateTimeFormat("tr-TR", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        }).format(new Date(`${selectedDay}T00:00:00`)),
      };
    }

    if (filterMode === "month") {
      return {
        mode: "month" as const,
        ...createMonthRange(selectedMonth),
      };
    }

    if (filterMode === "year") {
      return {
        mode: "year" as const,
        ...createYearRange(selectedYear),
      };
    }

    return {
      mode: "month" as const,
      ...createMonthRange(selectedMonth),
    };
  }, [filterMode, selectedDay, selectedMonth, selectedYear]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const response = await getDashboardOverview(dashboardQuery);
        if (mounted) {
          setData(response);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Bilinmeyen hata");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      mounted = false;
    };
  }, [dashboardQuery]);

  const currentSource = useMemo(() => getProjectSource(data, section), [data, section]);

  const activities = useMemo<ActivityItem[]>(() => {
    return [...(currentSource?.activities || [])]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 8);
  }, [currentSource]);

  const projectTabs = useMemo(
    () => [
      {
        key: "reservation" as const,
        title: "Rezervasyon",
        subtitle: getProjectSource(data, "reservation")?.status || "pending",
      },
      {
        key: "evrak" as const,
        title: "EvrakTakip",
        subtitle: getProjectSource(data, "evrak")?.status || "pending",
      },
      {
        key: "avrasya" as const,
        title: "Avrasya",
        subtitle: getProjectSource(data, "avrasya")?.status || "pending",
      },
    ],
    [data]
  );

  const notes = currentSource
    ? [...currentSource.highlights, ...currentSource.issues]
    : [];

  return (
    <main className="workspace">
      <aside className={`sidebar ${sidebarOpen ? "is-open" : "is-collapsed"}`}>
        <div className="sidebar__top">
          <button
            className="sidebar__hamburger"
            onClick={() => setSidebarOpen((value) => !value)}
            type="button"
            aria-label="Menuyu ac veya kapat"
          >
            <span />
            <span />
            <span />
          </button>
          {sidebarOpen ? <span className="sidebar__brand">Dentur Manager</span> : null}
        </div>

        <div className="sidebar__group">
          {sidebarOpen ? <p className="sidebar__label">Projeler</p> : null}
          <nav className="project-menu">
            {projectTabs.map((tab) => (
              <button
                key={tab.key}
                className={`project-menu__item ${section === tab.key ? "is-active" : ""}`}
                onClick={() => setSection(tab.key)}
                type="button"
                title={tab.title}
              >
                <span className="project-menu__icon">
                  {tab.title.slice(0, 1)}
                </span>
                {sidebarOpen ? (
                  <span className="project-menu__text">
                    <strong>{tab.title}</strong>
                    <small>{statusLabel(tab.subtitle)}</small>
                  </span>
                ) : null}
              </button>
            ))}
          </nav>
        </div>

        {sidebarOpen && currentSource ? (
          <div className="sidebar__foot">
            <span className={`sidebar__status sidebar__status--${currentSource.status}`}>
              {statusLabel(currentSource.status)}
            </span>
            <strong>{currentSource.name}</strong>
            <p>Son veri: {formatDateTime(currentSource.lastUpdatedAt)}</p>
          </div>
        ) : null}
      </aside>

      <section className="dashboard">
        <header className="topbar panel">
          <div>
            <p className="topbar__eyebrow">Secili Proje</p>
            <h1>{currentSource?.name ?? "Proje bekleniyor"}</h1>
            <p className="topbar__description">
              {currentSource
                ? `${currentSource.name} gelir, gider ve operasyonel finans ozeti`
                : "Projeye ait veri yuklenemedi."}
            </p>
          </div>

          <div className="topbar__controls">
            <div className="range-switch">
              {(["day", "month", "year"] as const).map((mode) => (
                <button
                  key={mode}
                  className={mode === filterMode ? "is-active" : ""}
                  onClick={() => setFilterMode(mode)}
                  type="button"
                >
                  {mode === "day" ? "Gun" : mode === "month" ? "Ay" : "Yil"}
                </button>
              ))}
            </div>

            {filterMode === "day" ? (
              <label className="filter-input">
                <span>Tarih</span>
                <input
                  type="date"
                  value={selectedDay}
                  onChange={(event) => setSelectedDay(event.target.value)}
                />
              </label>
            ) : null}

            {filterMode === "month" ? (
              <label className="filter-input">
                <span>Ay</span>
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(event) => setSelectedMonth(event.target.value)}
                />
              </label>
            ) : null}

            {filterMode === "year" ? (
              <label className="filter-input">
                <span>Yil</span>
                <input
                  type="number"
                  min="2020"
                  max="2100"
                  value={selectedYear}
                  onChange={(event) => setSelectedYear(event.target.value)}
                />
              </label>
            ) : null}
          </div>
        </header>

        {error ? (
          <section className="error-banner">
            <strong>Baglanti kurulamadi.</strong>
            <p>{error}</p>
            <p>`npm run dev` ile frontend ve backend'i birlikte kaldir. Sonra `backend/.env` icini doldur.</p>
          </section>
        ) : null}

        <section className="metrics-grid">
          <MetricCard
            eyebrow="Gercek Gelir"
            value={formatMoney(currentSource?.realizedIncome ?? 0)}
            caption={`${currentSource?.name ?? "Proje"} icin secili donem tahsilati`}
            tone="income"
          />
          <MetricCard
            eyebrow="Gercek Gider"
            value={formatMoney(currentSource?.realizedExpense ?? 0)}
            caption="Secili projedeki gerceklesen gider"
            tone="expense"
          />
          <MetricCard
            eyebrow="Net Sonuc"
            value={formatMoney(currentSource?.profit ?? 0)}
            caption="Gelir eksi gider"
            tone="neutral"
          />
          <MetricCard
            eyebrow="Potansiyel Bakiye"
            value={formatMoney(
              (currentSource?.potentialIncome ?? 0) - (currentSource?.potentialExpense ?? 0)
            )}
            caption="Potansiyel gelir ve gider farki"
            tone="neutral"
            aside={<span className="metric-pill">{loading ? "Yukleniyor" : statusLabel(currentSource?.status || "pending")}</span>}
          />
        </section>

        <section className="content-grid">
          <TrendPanel
            title={`${currentSource?.name ?? "Proje"} Gunluk Akis`}
            subtitle={`${data?.range.label ?? "-"} araligindaki trend`}
            points={currentSource?.trend ?? []}
          />

          <section className="panel stack-panel">
            <div className="panel__header">
              <div>
                <h3>Donem Ozeti</h3>
                <p>
                  {data ? `${data.range.start} / ${data.range.end}` : "- / -"}
                </p>
              </div>
            </div>

            <div className="summary-box">
              <span>Kaynak durumu</span>
              <strong>{statusLabel(currentSource?.status || "pending")}</strong>
            </div>

            <div className="summary-box">
              <span>Son guncelleme</span>
              <strong>{currentSource ? formatDateTime(currentSource.lastUpdatedAt) : "-"}</strong>
            </div>

            <div className="currency-list">
              {Object.entries(currentSource?.currencyTotals || {}).length === 0 ? (
                <div className="currency-list__row">
                  <span>Para birimi</span>
                  <strong>-</strong>
                </div>
              ) : (
                Object.entries(currentSource?.currencyTotals || {}).map(([currency, amount]) => (
                  <div className="currency-list__row" key={currency}>
                    <span>{currency}</span>
                    <strong>{formatMoney(amount, currency)}</strong>
                  </div>
                ))
              )}
            </div>
          </section>
        </section>

        <section className="content-grid">
          <ActivityFeed items={activities} />

          <section className="panel">
            <div className="panel__header">
              <div>
                <h3>Proje Notlari</h3>
                <p>Secili proje icin ozet ve entegrasyon notlari</p>
              </div>
            </div>

            <div className="insight-list">
              {notes.length === 0 ? (
                <article className="insight-card">
                  <span />
                  <p>Bu proje icin ek not bulunmuyor.</p>
                </article>
              ) : (
                notes.map((item) => (
                  <article className="insight-card" key={item}>
                    <span />
                    <p>{item}</p>
                  </article>
                ))
              )}
            </div>
          </section>
        </section>
      </section>
    </main>
  );
}

export default App;
