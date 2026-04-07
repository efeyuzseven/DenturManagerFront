import { useEffect, useMemo, useRef, useState } from "react";
import "./index.css";
import { ActivityFeed } from "./components/ActivityFeed";
import { MetricCard } from "./components/MetricCard";
import { TrendPanel } from "./components/TrendPanel";
import { formatDateTime, formatMoney, statusLabel } from "./lib/format";
import { getDashboardOverview } from "./services/dashboardApi";
import type {
  ActivityItem,
  DashboardPayload,
  ProjectFinanceSnapshot,
  SourceSegment,
} from "./types/dashboard";
import reservationLogo from "./images/peremerezervasyonlogo.png";
import denturLogo from "./images/dentur-logo-3.png";
import denturWideLogo from "./images/dentur_logo_157x50.png";

type FilterMode = "day" | "month" | "year";
type ProjectSection = "reservation" | "evrak" | "avrasya";
type ProjectTabDefinition = {
  key: ProjectSection;
  title: string;
  logo: string;
};

type EvrakFilterState = {
  start: string;
  end: string;
  segmentKey: string;
};

const PROJECT_ORDER_STORAGE_KEY = "dentur-manager-project-order";
const projectTabDefinitions: ProjectTabDefinition[] = [
  {
    key: "reservation",
    title: "Rezervasyon",
    logo: reservationLogo,
  },
  {
    key: "evrak",
    title: "EvrakTakip",
    logo: denturLogo,
  },
  {
    key: "avrasya",
    title: "Avrasya",
    logo: denturWideLogo,
  },
];

function normalizeProjectOrder(order?: string[]): ProjectSection[] {
  const allowed = new Set<ProjectSection>(projectTabDefinitions.map((item) => item.key));
  const normalized: ProjectSection[] = [];

  for (const item of order || []) {
    if (allowed.has(item as ProjectSection) && !normalized.includes(item as ProjectSection)) {
      normalized.push(item as ProjectSection);
    }
  }

  for (const item of projectTabDefinitions) {
    if (!normalized.includes(item.key)) {
      normalized.push(item.key);
    }
  }

  return normalized;
}

function getInitialProjectOrder(): ProjectSection[] {
  if (typeof window === "undefined") {
    return normalizeProjectOrder();
  }

  try {
    const storedValue = window.localStorage.getItem(PROJECT_ORDER_STORAGE_KEY);

    if (!storedValue) {
      return normalizeProjectOrder();
    }

    return normalizeProjectOrder(JSON.parse(storedValue) as string[]);
  } catch {
    return normalizeProjectOrder();
  }
}

function formatDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function formatDateLabel(value: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
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

function getCurrentMonthStart() {
  const now = new Date();
  return formatDate(new Date(now.getFullYear(), now.getMonth(), 1));
}

function App() {
  const today = formatDate(new Date());
  const [filterMode, setFilterMode] = useState<FilterMode>("month");
  const [selectedDay, setSelectedDay] = useState(today);
  const [selectedMonth, setSelectedMonth] = useState(today.slice(0, 7));
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));
  const [section, setSection] = useState<ProjectSection>("reservation");
  const [projectOrder, setProjectOrder] = useState<ProjectSection[]>(() => getInitialProjectOrder());
  const [draggingProject, setDraggingProject] = useState<ProjectSection | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [data, setData] = useState<DashboardPayload | null>(null);
  const dashboardCacheRef = useRef<Record<string, DashboardPayload>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sourceSnapshots, setSourceSnapshots] = useState<
    Partial<Record<ProjectSection, ProjectFinanceSnapshot>>
  >({});
  const [evrakDraftFilters, setEvrakDraftFilters] = useState<EvrakFilterState>({
    start: getCurrentMonthStart(),
    end: today,
    segmentKey: "all",
  });
  const [evrakAppliedFilters, setEvrakAppliedFilters] = useState<EvrakFilterState>({
    start: getCurrentMonthStart(),
    end: today,
    segmentKey: "all",
  });

  const dashboardQuery = useMemo(() => {
    if (section === "evrak") {
      return {
        mode: "custom" as const,
        start: evrakAppliedFilters.start,
        end: evrakAppliedFilters.end,
        label: `${formatDateLabel(evrakAppliedFilters.start)} - ${formatDateLabel(evrakAppliedFilters.end)}`,
        evrakSegment:
          evrakAppliedFilters.segmentKey !== "all" ? evrakAppliedFilters.segmentKey : undefined,
      };
    }

    if (filterMode === "day") {
      return {
        mode: "day" as const,
        start: selectedDay,
        end: selectedDay,
        label: formatDateLabel(selectedDay),
      };
    }

    if (filterMode === "month") {
      return {
        mode: "month" as const,
        ...createMonthRange(selectedMonth),
      };
    }

    return {
      mode: "year" as const,
      ...createYearRange(selectedYear),
    };
  }, [
    evrakAppliedFilters.end,
    evrakAppliedFilters.segmentKey,
    evrakAppliedFilters.start,
    filterMode,
    section,
    selectedDay,
    selectedMonth,
    selectedYear,
  ]);
  const dashboardRequestKey = useMemo(
    () => JSON.stringify({ source: section, query: dashboardQuery }),
    [dashboardQuery, section]
  );

  useEffect(() => {
    let mounted = true;

    async function load() {
      const cachedPayload = dashboardCacheRef.current[dashboardRequestKey];

      if (cachedPayload) {
        if (mounted) {
          setData(cachedPayload);
          setLoading(false);
          setError(null);
          const cachedSource = getProjectSource(cachedPayload, section);
          if (cachedSource) {
            setSourceSnapshots((current) => ({
              ...current,
              [section]: cachedSource,
            }));
          }
        }
        return;
      }

      try {
        setLoading(true);
        setError(null);
        setData(null);
        const response = await getDashboardOverview({
          ...dashboardQuery,
          source: section,
        });
        if (mounted) {
          dashboardCacheRef.current[dashboardRequestKey] = response;
          setData(response);
          const fetchedSource = getProjectSource(response, section);
          if (fetchedSource) {
            setSourceSnapshots((current) => ({
              ...current,
              [section]: fetchedSource,
            }));
          }
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
  }, [dashboardQuery, dashboardRequestKey, section]);

  useEffect(() => {
    window.localStorage.setItem(PROJECT_ORDER_STORAGE_KEY, JSON.stringify(projectOrder));
  }, [projectOrder]);

  const currentSource = useMemo(() => getProjectSource(data, section), [data, section]);
  const currentProjectMeta = useMemo(
    () => projectTabDefinitions.find((item) => item.key === section) ?? projectTabDefinitions[0],
    [section]
  );

  const activities = useMemo<ActivityItem[]>(() => {
    return [...(currentSource?.activities || [])]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 8);
  }, [currentSource]);

  const projectTabs = useMemo(
    () =>
      projectOrder.map((key) => {
        const definition = projectTabDefinitions.find((item) => item.key === key);

        return {
          key,
          title: definition?.title ?? key,
          logo: definition?.logo ?? denturLogo,
          subtitle: sourceSnapshots[key]?.status || "pending",
        };
      }),
    [projectOrder, sourceSnapshots]
  );

  const notes = currentSource ? [...currentSource.highlights, ...currentSource.issues] : [];
  const evrakSegments = useMemo(
    () =>
      currentSource?.slug === "evrak"
        ? (currentSource.segments || []).filter((segment) => segment.key !== "Tüm Portlar")
        : [],
    [currentSource]
  );
  const visibleEvrakSegments = useMemo(
    () => {
      if (evrakAppliedFilters.segmentKey === "all") {
        return evrakSegments;
      }

      if (evrakAppliedFilters.segmentKey === "Gezi Sözleşmeleri") {
        return evrakSegments.filter((segment) => segment.key === "Gezi Sözleşmeleri");
      }

      return evrakSegments.filter(
        (segment) =>
          segment.key === evrakAppliedFilters.segmentKey || segment.key === "Gezi Sözleşmeleri"
      );
    },
    [evrakAppliedFilters.segmentKey, evrakSegments]
  );
  const normalizedEvrakSegments = useMemo(
    () => evrakSegments.filter((segment) => segment.label !== "Tüm Portlar"),
    [evrakSegments]
  );
  const visibleNormalizedEvrakSegments = useMemo(() => {
    if (evrakAppliedFilters.segmentKey === "all") {
      return normalizedEvrakSegments;
    }

    if (evrakAppliedFilters.segmentKey === "Gezi Sözleşmeleri") {
      return normalizedEvrakSegments.filter((segment) => segment.label === "Gezi Sözleşmeleri");
    }

    return normalizedEvrakSegments.filter(
      (segment) =>
        segment.key === evrakAppliedFilters.segmentKey || segment.label === "Gezi Sözleşmeleri"
    );
  }, [evrakAppliedFilters.segmentKey, normalizedEvrakSegments]);

  const displayEvrakSegments = useMemo(
    () =>
      normalizedEvrakSegments.filter(
        (segment) =>
          segment.key.startsWith("port:") ||
          segment.key.toLocaleLowerCase("tr-TR").includes("gezi")
      ),
    [normalizedEvrakSegments]
  );
  const visibleDisplayEvrakSegments = useMemo(() => {
    if (evrakAppliedFilters.segmentKey === "all") {
      return displayEvrakSegments;
    }

    if (!evrakAppliedFilters.segmentKey.startsWith("port:")) {
      return displayEvrakSegments.filter((segment) => !segment.key.startsWith("port:"));
    }

    return displayEvrakSegments.filter(
      (segment) => segment.key === evrakAppliedFilters.segmentKey || !segment.key.startsWith("port:")
    );
  }, [displayEvrakSegments, evrakAppliedFilters.segmentKey]);

  void visibleEvrakSegments;
  void visibleNormalizedEvrakSegments;

  function moveProjectTab(from: ProjectSection, to: ProjectSection) {
    if (from === to) {
      return;
    }

    setProjectOrder((currentOrder) => {
      const nextOrder = [...currentOrder];
      const fromIndex = nextOrder.indexOf(from);
      const toIndex = nextOrder.indexOf(to);

      if (fromIndex === -1 || toIndex === -1) {
        return currentOrder;
      }

      nextOrder.splice(fromIndex, 1);
      nextOrder.splice(toIndex, 0, from);
      return nextOrder;
    });
  }

  function applyEvrakFilters() {
    const start =
      evrakDraftFilters.start <= evrakDraftFilters.end
        ? evrakDraftFilters.start
        : evrakDraftFilters.end;
    const end =
      evrakDraftFilters.start <= evrakDraftFilters.end
        ? evrakDraftFilters.end
        : evrakDraftFilters.start;

    setEvrakDraftFilters((current) => ({
      ...current,
      start,
      end,
    }));
    setEvrakAppliedFilters({
      start,
      end,
      segmentKey: evrakDraftFilters.segmentKey,
    });
  }

  function handleEvrakSegmentCard(segment: SourceSegment) {
    setEvrakDraftFilters((current) => ({
      ...current,
      segmentKey: segment.key,
    }));
    setEvrakAppliedFilters((current) => ({
      ...current,
      segmentKey: segment.key,
    }));
  }

  return (
    <main className={`workspace ${sidebarOpen ? "workspace--expanded" : "workspace--collapsed"}`}>
      <aside className={`sidebar ${sidebarOpen ? "is-open" : "is-collapsed"}`}>
        <div className="sidebar__top">
          <button
            className="sidebar__hamburger"
            onClick={() => setSidebarOpen((value) => !value)}
            type="button"
            aria-label="Menüyü aç veya kapat"
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
                onDragStart={() => setDraggingProject(tab.key)}
                onDragEnd={() => setDraggingProject(null)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  if (draggingProject) {
                    moveProjectTab(draggingProject, tab.key);
                  }
                  setDraggingProject(null);
                }}
                type="button"
                title={tab.title}
                draggable
              >
                <span className="project-menu__icon">
                  <img src={tab.logo} alt={`${tab.title} logosu`} />
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
        <header className={`topbar panel ${section === "evrak" ? "topbar--evrak" : ""}`}>
          <div className="topbar__project">
            <div className="topbar__logo">
              <img src={currentProjectMeta.logo} alt={`${currentProjectMeta.title} logosu`} />
            </div>
            <div>
              <p className="topbar__eyebrow">Seçili Proje</p>
              <h1>{currentSource?.name ?? currentProjectMeta.title}</h1>
              <p className="topbar__description">
                {currentSource
                  ? `${currentSource.name} gelir, gider ve operasyonel finans özeti`
                  : "Projeye ait veri yüklenemedi."}
              </p>
            </div>
          </div>

          {section === "evrak" ? (
            <div className="evrak-filters">
              <label className="filter-input">
                <span>İlk Tarih</span>
                <input
                  type="date"
                  value={evrakDraftFilters.start}
                  onChange={(event) =>
                    setEvrakDraftFilters((current) => ({
                      ...current,
                      start: event.target.value,
                    }))
                  }
                />
              </label>

              <label className="filter-input">
                <span>Son Tarih</span>
                <input
                  type="date"
                  value={evrakDraftFilters.end}
                  onChange={(event) =>
                    setEvrakDraftFilters((current) => ({
                      ...current,
                      end: event.target.value,
                    }))
                  }
                />
              </label>

              <label className="filter-input filter-input--wide">
                <span>Listeleme</span>
                <select
                  value={evrakDraftFilters.segmentKey}
                  onChange={(event) =>
                    setEvrakDraftFilters((current) => ({
                      ...current,
                      segmentKey: event.target.value,
                    }))
                  }
                >
                  <option value="all">Tümünü Listele</option>
                  {displayEvrakSegments.map((segment) => (
                    <option key={segment.key} value={segment.key}>
                      {segment.label}
                    </option>
                  ))}
                </select>
              </label>

              <button className="primary-button" type="button" onClick={applyEvrakFilters}>
                Raporla
              </button>
            </div>
          ) : (
            <div className="topbar__controls">
              <div className="range-switch">
                {(["day", "month", "year"] as const).map((mode) => (
                  <button
                    key={mode}
                    className={mode === filterMode ? "is-active" : ""}
                    onClick={() => setFilterMode(mode)}
                    type="button"
                  >
                    {mode === "day" ? "Gün" : mode === "month" ? "Ay" : "Yıl"}
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
                  <span>Yıl</span>
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
          )}
        </header>

        {error ? (
          <section className="error-banner">
            <strong>Bağlantı kurulamadı.</strong>
            <p>{error}</p>
            <p>`npm run dev` ile frontend ve backend&apos;i birlikte kaldır. Sonra `backend/.env` içini doldur.</p>
          </section>
        ) : null}

        {section === "evrak" && visibleDisplayEvrakSegments.length > 0 ? (
          <section className="segment-grid">
            {visibleDisplayEvrakSegments.map((segment) => (
              <button
                key={segment.key}
                className={`segment-card ${
                  evrakAppliedFilters.segmentKey === segment.key ? "is-active" : ""
                }`}
                onClick={() => handleEvrakSegmentCard(segment)}
                type="button"
              >
                <strong>{segment.label}</strong>
                <span>Toplam Kazanç</span>
                <b>{formatMoney(segment.realizedIncome)}</b>
              </button>
            ))}
          </section>
        ) : null}

        <section className="metrics-grid">
          <MetricCard
            eyebrow="Gerçek Gelir"
            value={formatMoney(currentSource?.realizedIncome ?? 0)}
            caption={`${currentSource?.name ?? "Proje"} için seçili dönem tahsilatı`}
            tone="income"
          />
          <MetricCard
            eyebrow="Gerçek Gider"
            value={formatMoney(currentSource?.realizedExpense ?? 0)}
            caption="Seçili projedeki gerçekleşen gider"
            tone="expense"
          />
          <MetricCard
            eyebrow="Net Sonuç"
            value={formatMoney(currentSource?.profit ?? 0)}
            caption="Gelir eksi gider"
            tone="neutral"
          />
          {section === "reservation" ? (
            <MetricCard
              eyebrow="Potansiyel Bakiye"
              value={formatMoney(
                (currentSource?.potentialIncome ?? 0) - (currentSource?.potentialExpense ?? 0)
              )}
              caption="Potansiyel gelir ve gider farkı"
              tone="neutral"
              aside={
                <span className="metric-pill">
                  {loading ? "Yükleniyor" : statusLabel(currentSource?.status || "pending")}
                </span>
              }
            />
          ) : null}
        </section>

        <section className="dashboard-columns">
          <section className="column-stack">
            <TrendPanel
              title={`${currentSource?.name ?? "Proje"} Günlük Akış`}
              subtitle={`${data?.range.label ?? "-"} aralığındaki trend`}
              points={currentSource?.trend ?? []}
            />

            <ActivityFeed items={activities} />
          </section>

          <section className="column-stack">
            <section className="panel stack-panel summary-panel">
              <div className="panel__header">
                <div>
                  <h3>Dönem Özeti</h3>
                  <p>{data ? `${data.range.start} / ${data.range.end}` : "- / -"}</p>
                </div>
              </div>

              <div className="summary-compact-grid">
                <div className="summary-box">
                  <span>Son güncelleme</span>
                  <strong>{currentSource ? formatDateTime(currentSource.lastUpdatedAt) : "-"}</strong>
                </div>

                <div className="currency-list currency-list--compact">
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
              </div>
            </section>

            <section className="panel notes-panel">
              <div className="panel__header">
                <div>
                  <h3>Proje Notları</h3>
                  <p>Seçili proje için özet ve entegrasyon notları</p>
                </div>
              </div>

              <div className="insight-list">
                {notes.length === 0 ? (
                  <article className="insight-card">
                    <span />
                    <p>Bu proje için ek not bulunmuyor.</p>
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
      </section>
    </main>
  );
}

export default App;
