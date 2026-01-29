// src/App.jsx
import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Calculator,
  Flag,
  ClipboardList,
  Wrench,
  Building2,
  User,
  BadgeCheck,
  Factory,
  ChevronDown,
} from "lucide-react";
import { getLeaderboard } from "./services/leaderboard.service";
import { getActiveFormula } from "./services/scoringFormula.service";
import { supabaseConfigured } from "./services/supabase";
import "./styles.css";

// Findings: layout wrappers were flattened, so the shared metric bar and podium positioning lost their shared blue container and relative rank anchors.

const VIEW_TABS = [
  { key: "depots", label: "Depots" },
  { key: "leaders", label: "Leaders" },
  { key: "commanders", label: "Commanders" },
  { key: "companies", label: "Companies" },
];

const ENTITY_KEYS = ["depots", "leaders", "commanders", "companies"];
const FORMULA_TYPES = ["depots", "companies", "commanders", "platoons", "squads", "teams"];

const LEADER_ROLE_TABS = [
  { key: "platoon", label: "Platoon" },
  { key: "squad", label: "Squad" },
  { key: "team", label: "Team" },
];

function mergeClassNames(...classes) {
  return classes.filter(Boolean).join(" ");
}

function formatCurrencyPHP(n) {
  const value = Number(n) || 0;
  return value.toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  });
}

function formatCurrencyPHPCompact(n, mode = "700") {
  const value = Math.max(0, Number(n) || 0);

  if (value >= 1_000_000) {
    const m = value / 1_000_000;
    const shown = Math.floor(m * 10) / 10;
    return `₱${shown}M+`;
  }

  if (value >= 1_000) {
    const k = value / 1_000;
    if (mode === "600" && value >= 100_000) {
      const roundedK = Math.round(k / 10) * 10;
      return `₱${roundedK}K+`;
    }
    const roundedK = Math.round(k);
    return `₱${roundedK}K+`;
  }

  return `₱${value.toLocaleString("en-PH")}`;
}

function formatNumber(n) {
  return (Number(n) || 0).toLocaleString("en-US");
}

function formatMetricLabel(metricKey) {
  if (!metricKey) return "Metric";
  return metricKey
    .toString()
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getFormulaExample(divisor) {
  const value = Number(divisor) || 0;
  if (value <= 0) return null;
  const example = Math.round(value / 2);
  return `Example: ${formatNumber(example)} / ${formatNumber(value)}`;
}

function toYMD(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function toIsoWeekKey(date) {
  const ref = new Date(date);
  if (Number.isNaN(ref.getTime())) return null;
  const utcDate = new Date(Date.UTC(ref.getFullYear(), ref.getMonth(), ref.getDate()));
  const day = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((utcDate - yearStart) / 86400000 + 1) / 7);
  return `${utcDate.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function endOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

// Returns the first Monday ON or AFTER the 1st day of the month
function firstMondayOfMonth(year, monthIndex) {
  const first = new Date(year, monthIndex, 1);
  const day = first.getDay(); // 0=Sun, 1=Mon, ... 6=Sat
  const delta = (8 - day) % 7; // days to next Monday (0 if already Monday)
  return new Date(year, monthIndex, 1 + delta);
}

function buildWeekTabsForCurrentMonth(baseDate = new Date()) {
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth(); // 0=Jan

  const week1Start = startOfDay(firstMondayOfMonth(year, month));

  // Determine current week number based on Monday-based weeks
  const today = startOfDay(baseDate);
  const diffDays = Math.floor((today - week1Start) / 86400000);

  // If today is before week1Start (ex: first days before first Monday), treat as Week 1.
  const computedWeek = diffDays < 0 ? 1 : Math.floor(diffDays / 7) + 1;
  const currentWeekNumber = Math.min(4, Math.max(1, computedWeek));

  const tabs = [];

  for (let weekIndex = 1; weekIndex <= 4; weekIndex++) {
    const start = new Date(week1Start);
    start.setDate(start.getDate() + (weekIndex - 1) * 7);

    const end = new Date(start);
    end.setDate(end.getDate() + 6);

    // Display range = that week (Mon?Sun)
    const displayStart = startOfDay(start);
    const displayEnd = endOfDay(end);

    // Query range = this week only
    const queryStart = displayStart;
    const queryEnd = displayEnd;

    const isCurrent = weekIndex === currentWeekNumber;
    const enabled = weekIndex <= currentWeekNumber;

    tabs.push({
      key: `week${weekIndex}`,
      label: isCurrent ? `Week ${weekIndex} - Current` : `Week ${weekIndex}`,
      range: { start: queryStart, end: queryEnd },
      displayRange: { start: displayStart, end: displayEnd },
      isCurrent,
      enabled,
    });
  }

  return {
    tabs,
    currentKey: `week${currentWeekNumber}`,
  };
}

function formatWeekRange(displayRange) {
  if (!displayRange) return "";

  const start = displayRange.start;
  const end = displayRange.end;

  const startStr = start.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
  });
  const endStr = end.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });

  return `${startStr} - ${endStr}`;
}

function getInitials(name = "") {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function useWindowWidth() {
  const [width, setWidth] = useState(() =>
    typeof window === "undefined" ? 1024 : window.innerWidth
  );

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return width;
}

function normalizePodiumItems(topItems = []) {
  const cleaned = (topItems || []).filter(Boolean);
  const sorted = [...cleaned].sort((a, b) => {
    if (a?.rank != null && b?.rank != null) return a.rank - b.rank;
    return (b?.points ?? 0) - (a?.points ?? 0);
  });

  if (sorted.length >= 3) {
    return [sorted[1], sorted[0], sorted[2]];
  }

  if (sorted.length === 2) {
    return [sorted[1], sorted[0]];
  }

  if (sorted.length === 1) {
    return [sorted[0]];
  }

  return [];
}

function normalizeFormulaMetrics(formula) {
  const metricsSource = formula?.config?.metrics ?? [];
  if (!Array.isArray(metricsSource)) return [];
  return metricsSource.map((m) => ({
    key: (m?.key ?? m?.metric ?? m?.name ?? "").toString(),
    divisor: Number(m?.divisor ?? m?.division ?? 0),
    maxPoints: Number(m?.maxPoints ?? m?.max_points ?? m?.points ?? 0),
  }));
}

function toWeekKeyNumber(weekKey) {
  if (!weekKey || typeof weekKey !== "string") return null;
  const match = weekKey.match(/^(\d{4})-W(\d{2})$/);
  if (!match) return null;
  return Number(match[1]) * 100 + Number(match[2]);
}

function isWeekKeyInRange(weekKey, startKey, endKey) {
  const value = toWeekKeyNumber(weekKey);
  const start = toWeekKeyNumber(startKey);
  const end = toWeekKeyNumber(endKey);
  if (!value || !start) return true;
  if (!end) return value >= start;
  return value >= start && value <= end;
}

function getBattleTypeForView(viewKey, roleFilter) {
  if (viewKey === "depots") return "depots";
  if (viewKey === "companies") return "teams";
  if (viewKey === "teams") return "teams";
  if (viewKey === "commanders") return "commanders";
  if (viewKey === "platoon") return "platoons";
  if (viewKey === "leaders" && roleFilter === "platoon") return "platoons";
  if (viewKey === "leaders" && roleFilter === "squad") return "squads";
  if (viewKey === "leaders" && roleFilter === "team") return "teams";
  return viewKey || "leaders";
}

function getFaqBattleType(entityKey) {
  return entityKey || "leaders";
}

function getGroupByForView(viewKey, roleFilter) {
  if (viewKey === "commanders") return "commanders";
  if (viewKey === "companies") return "companies";
  if (viewKey === "leaders" && roleFilter === "platoon") return "platoon";
  return viewKey;
}

function App() {
  const initialWeeks = buildWeekTabsForCurrentMonth();
  const [weekTabs] = useState(initialWeeks.tabs);
  const [activeWeek, setActiveWeek] = useState(initialWeeks.currentKey);
  const activeWeekTab = weekTabs.find((w) => w.key === activeWeek);
  const weekRangeLabel = formatWeekRange(activeWeekTab?.displayRange);
  const faqWeekKey = activeWeekTab?.range?.end ? toIsoWeekKey(activeWeekTab.range.end) : null;
  const [activeView, setActiveView] = useState("depots");
  const [leaderRoleFilter, setLeaderRoleFilter] = useState(LEADER_ROLE_TABS[0].key);
  // Pagination plan:
  // - paginate ranks 4+ (rows list) at 15 per page
  // - reset page on view/week/filter changes
  // - keep ranks absolute via r.rank from full dataset
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [isFaqOpen, setIsFaqOpen] = useState(false);
  const [faqOpenKey, setFaqOpenKey] = useState("formulas");
  const [formulaOpenKey, setFormulaOpenKey] = useState("depots");
  const [leadersOpenKey, setLeadersOpenKey] = useState("platoon");
  const [formulasByType, setFormulasByType] = useState({});
  const faqButtonRef = useRef(null);
  const faqCloseRef = useRef(null);

  useEffect(() => {
    if (!supabaseConfigured) {
      setError("Service temporarily unavailable. Please try again later.");
      setLoading(false);
    } else {
      setError("");
    }
  }, [supabaseConfigured]);

  useEffect(() => {
    let isCancelled = false;
    async function load() {
      if (!supabaseConfigured) return;
      setLoading(true);
      setError("");
      try {
        const week = weekTabs.find((w) => w.key === activeWeek);
        const range = week?.range;
        const leadersPlatoonView = activeView === "leaders" && leaderRoleFilter === "platoon";
        const groupByView = getGroupByForView(activeView, leaderRoleFilter);
        const battleTypeKey = getBattleTypeForView(activeView, leaderRoleFilter);
        const weekKey = range?.end ? toIsoWeekKey(range.end) : null;

        const result = await getLeaderboard({
          startDate: toYMD(range.start),
          endDate: toYMD(range.end),
          groupBy: groupByView,
          roleFilter: activeView === "leaders" && !leadersPlatoonView ? leaderRoleFilter : null,
          battleType: battleTypeKey,
          weekKey,
        });

        if (!isCancelled) setData(result);
      } catch (e) {
        console.error(e);
        const friendly = "Unable to load leaderboard data.";
        const devDetails = e?.message
          ? `${e.message}${e.code ? ` (code: ${e.code})` : ""}`
          : friendly;
        if (!isCancelled) setError(import.meta.env.DEV ? devDetails : friendly);
      } finally {
        if (!isCancelled) setLoading(false);
      }
    }
    load();
    return () => {
      isCancelled = true;
    };
  }, [activeWeek, activeView, leaderRoleFilter]);

  const today = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "2-digit",
    year: "numeric",
  });

  const leadersPlatoonView = activeView === "leaders" && leaderRoleFilter === "platoon";
  const displayView = leadersPlatoonView ? "platoon" : activeView;
  const metrics = data?.metrics || {
    entitiesCount: 0,
    totalLeads: 0,
    totalPayins: 0,
    totalSales: 0,
  };
  const rows = data?.rows || [];
  const activeFormula = data?.formula?.data || null;
  const selectedWeekKey = data?.formula?.weekKey || null;
  const PAGE_SIZE = 10;
  const podiumRows = rows.slice(0, 3);
  const listRows = rows.slice(3);
  const total = listRows.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageStart = (page - 1) * PAGE_SIZE;
  const pageEnd = pageStart + PAGE_SIZE;
  const pageRows = listRows.slice(pageStart, pageEnd);
  const entitiesLabel =
    displayView === "commanders"
      ? "Commanders"
      : displayView === "companies"
      ? "Companies"
      : activeView === "leaders" && leaderRoleFilter === "team"
      ? "Teams"
      : activeView === "leaders" && leaderRoleFilter === "squad"
      ? "Squads"
      : displayView === "depots"
      ? "Depots"
      : displayView === "platoon"
      ? "Platoons"
      : "Leaders";

  const title =
    displayView === "platoon"
      ? "Platoon Rankings"
      : activeView === "leaders" && leaderRoleFilter === "team"
      ? "Team Leader Rankings"
      : displayView === "leaders"
      ? "Squad Leader Rankings"
      : displayView === "teams"
      ? "Team Rankings"
      : displayView === "depots"
      ? "Depot Rankings"
      : displayView === "companies"
      ? "Company Rankings"
      : "Commander Rankings";

  useEffect(() => {
    if (!activeFormula || !selectedWeekKey) return;
    if (!isWeekKeyInRange(selectedWeekKey, activeFormula.effective_start_week_key, activeFormula.effective_end_week_key)) {
      if (import.meta.env.DEV) {
        console.warn("Active formula week mismatch", { selectedWeekKey, activeFormula });
      }
    }
  }, [activeFormula, selectedWeekKey]);

  useEffect(() => {
    setPage(1);
  }, [activeWeek, activeView, leaderRoleFilter]);

  useEffect(() => {
    if (page > pageCount) {
      setPage(pageCount);
    }
  }, [page, pageCount]);

  const resolvedFormulas = {
    depots: { formula: formulasByType.depots, fallbackLabel: null },
    companies: { formula: formulasByType.teams, fallbackLabel: null },
    commanders: {
      formula: formulasByType.commanders,
      fallbackLabel: null,
    },
    platoons: { formula: formulasByType.platoons, fallbackLabel: null },
    squads: { formula: formulasByType.squads, fallbackLabel: null },
    teams: {
      formula: formulasByType.teams,
      fallbackLabel: null,
    },
  };

  useEffect(() => {
    if (!supabaseConfigured || !faqWeekKey) {
      setFormulasByType({});
      return;
    }

    let cancelled = false;

    async function loadFormulas() {
      const entries = await Promise.all(
        FORMULA_TYPES.map(async (typeKey) => {
          const battleType = getFaqBattleType(typeKey);
          try {
            const { data: formulaData, error } = await getActiveFormula(battleType, faqWeekKey);
            if (error) throw error;
            return [typeKey, formulaData ?? null];
          } catch (err) {
            if (import.meta.env.DEV) {
              console.warn("FAQ formula load failed", { typeKey, battleType, err });
            }
            return [typeKey, null];
          }
        })
      );

      if (!cancelled) {
        setFormulasByType(Object.fromEntries(entries));
      }
    }

    loadFormulas();
    return () => {
      cancelled = true;
    };
  }, [faqWeekKey, supabaseConfigured]);

  const renderFormulaBlock = (resolved) => {
    const formula = resolved?.formula ?? null;
    if (!formula) {
      return <div className="formula-text__empty">No published formula for this week.</div>;
    }

    const metrics = normalizeFormulaMetrics(formula);
    const version = formula?.version ?? formula?.revision ?? "?";
    const label = formula?.label ?? "Formula";
    const title = `${label} (v${version})`;

    return (
      <div className="formula-text">
        <div className="formula-text__title">Published: {title}</div>
        {resolved?.fallbackLabel && (
          <div className="formula-text__fallback">
            Using {resolved.fallbackLabel} formula (fallback)
          </div>
        )}
        <div className="formula-text__metrics">
          {metrics.length ? (
            metrics.map((m) => {
              const label = formatMetricLabel(m.key);
              const divisorText = formatNumber(m.divisor);
              const maxPointsText = formatNumber(m.maxPoints);
              const exampleText = getFormulaExample(m.divisor);
              return (
                <div key={m.key || m.divisor} className="formula-text__line">
                  <div className="formula-pill__main">
                    {label}: Divide by {divisorText} (Max {maxPointsText} pts)
                  </div>
                  {exampleText && <div className="formula-pill__example">{exampleText}</div>}
                </div>
              );
            })
          ) : (
            <div className="formula-text__empty">Formula metrics are not configured.</div>
          )}
        </div>
      </div>
    );
  };

  const renderFormulaBlockForLeaderSubType = (subKey) => {
    const leaderMap = {
      platoon: resolvedFormulas.platoons,
      squad: resolvedFormulas.squads,
      team: resolvedFormulas.teams,
    };
    return renderFormulaBlock(leaderMap[subKey]);
  };

  const leaderSublist = [
    { key: "platoon", label: "Platoon", Icon: Building2 },
    { key: "squad", label: "Squad", Icon: User },
    { key: "team", label: "Team", Icon: BadgeCheck },
  ];

  const leadersSubContent =
    formulaOpenKey === "leaders" ? (
      <div className="faq-subcontent">
        <div className="faq-sublist faq-sublist--leaders">
          {leaderSublist.map((sub) => {
            const isOpen = leadersOpenKey === sub.key;
            const Icon = sub.Icon;
            return (
              <div className="faq-subitem" key={sub.key}>
                <button
                  type="button"
                  className="faq-subrow faq-subrow--leaders"
                  aria-expanded={isOpen}
                  aria-controls={`faq-panel-leaders-${sub.key}`}
                  onClick={() => setLeadersOpenKey(isOpen ? null : sub.key)}
                >
                  <span className="faq-row__left">
                    <span className="faq-subrow__icon" aria-hidden="true">
                      {Icon ? (
                        <Icon size={16} className="faq-subrow__icon-svg" />
                      ) : (
                        <User size={16} className="faq-subrow__icon-svg" />
                      )}
                    </span>
                    <span className="faq-row__label">{sub.label}</span>
                  </span>
                  <ChevronDown
                    className={`faq-row__chev ${isOpen ? "is-open" : ""}`}
                    aria-hidden="true"
                  />
                </button>

                <div
                  id={`faq-panel-leaders-${sub.key}`}
                  className={`faq-content ${isOpen ? "is-open" : ""}`}
                  aria-hidden={!isOpen}
                >
                  <div className="faq-subcontent">
                    {renderFormulaBlockForLeaderSubType(sub.key)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    ) : null;

  const formulaAccordionItems = [
    {
      key: "depots",
      label: "Depots",
      content: renderFormulaBlock(resolvedFormulas.depots),
    },
    {
      key: "leaders",
      label: "Leaders",
      content: leadersSubContent,
    },
    {
      key: "commanders",
      label: "Commanders",
      content: renderFormulaBlock(resolvedFormulas.commanders),
    },
    {
      key: "companies",
      label: "Companies",
      content: renderFormulaBlock(resolvedFormulas.companies),
    },
  ];

  const openFaq = () => {
    setIsFaqOpen(true);
  };

  const closeFaq = () => {
    setIsFaqOpen(false);
    if (faqButtonRef.current) {
      faqButtonRef.current.focus();
    }
  };

  useEffect(() => {
    if (!isFaqOpen) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") closeFaq();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isFaqOpen]);

  useEffect(() => {
    if (!isFaqOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isFaqOpen]);

  useEffect(() => {
    if (!isFaqOpen) return;
    if (faqCloseRef.current) {
      faqCloseRef.current.focus();
    }
  }, [isFaqOpen]);

  return (
    <div className="page">
      {/* Full-bleed header bar */}
      <header className="site-header">
        <div className="site-header__inner">
          <div className="top-header">
            <div className="brand">
              <img src="/gg-logo.png" alt="Grinders Guild logo" className="brand-logo" />
              <div className="brand-text">Grinders Guild</div>
            </div>
            <div className="page-title">Battle of Platoons</div>
            <div className="page-date">{today}</div>
          </div>
        </div>
      </header>

      <div className="page-inner">

        {/* Week selector + metrics */}
        <section className="week-metrics">
          <div className="topbar">
            <div className="topbar-segment topbar-segment--weeks">
              <div className="week-row">
                <div className="week-label">View Previous Updates :</div>
                <div className="week-range">{weekRangeLabel}</div>
              </div>

              <div className="week-tabs">
                {weekTabs.map((w) => (
                  <button
                    key={w.key}
                    type="button"
                    className={`week-tab ${activeWeek === w.key ? "week-tab--active" : ""}`}
                    disabled={!w.enabled}
                    onClick={() => w.enabled && setActiveWeek(w.key)}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="topbar-metrics">

                <div className="topbar-divider" aria-hidden="true"></div>

              <div className="topbar-segment topbar-segment--metric">
                <div className="metric-label">{entitiesLabel}</div>
                <div className="metric-value">{metrics.entitiesCount}</div>
              </div>

              <div className="topbar-divider" aria-hidden="true"></div>

              <div className="topbar-segment topbar-segment--metric">
                <div className="metric-label">Leads</div>
                <div className="metric-value">{metrics.totalLeads}</div>
              </div>

              <div className="topbar-divider" aria-hidden="true"></div>

              <div className="topbar-segment topbar-segment--metric">
                <div className="metric-label">Payins</div>
                <div className="metric-value">{metrics.totalPayins}</div>
              </div>
            </div>
          </div>
        </section>

        {/* View toggle */}
        <section className="view-toggle-section">
          <div className="view-toggle">
            {VIEW_TABS.map((v) => (
              <button
                key={v.key}
                className={
                  "view-pill" + (v.key === activeView ? " view-pill--active" : "")
                }
                onClick={() => setActiveView(v.key)}
              >
                {v.label}
              </button>
            ))}
          </div>
          {activeView === "leaders" && (
            <div className="view-toggle leader-role-toggle">
              {LEADER_ROLE_TABS.map((role) => (
                <button
                  key={role.key}
                  className={
                    "view-pill" +
                    (role.key === leaderRoleFilter ? " view-pill--active" : "")
                  }
                  onClick={() => setLeaderRoleFilter(role.key)}
                >
                  {role.label}
                </button>
              ))}
            </div>
          )}
          <h2 className="section-title">{title}</h2>
      </section>

        {/* Loading / error */}
        {loading && (
          <div className="status-text">Loading live rankings...</div>
        )}
        {error && <div className="status-text status-text--error">{error}</div>}

        {!loading && !error && (
          <>
            {rows.length === 0 ? (
              <div className="empty-state">
                No published results yet for this period.
                <div className="empty-state__hint">Try a different date range.</div>
              </div>
            ) : (
              <>
                <Podium top3={podiumRows} view={displayView} roleFilter={leaderRoleFilter} />
                <LeaderboardRows
                  rows={pageRows}
                  view={displayView}
                  page={page}
                  pageCount={pageCount}
                  onPageChange={setPage}
                  total={total}
                />
              </>
            )}
          </>
        )}
      </div>

      {!isFaqOpen && (
        <button ref={faqButtonRef} className="faq-fab" onClick={openFaq} aria-label="Open FAQ">
          <span className="faq-fab__icon">?</span>
        </button>
      )}

      {isFaqOpen && (
        <div className="faq-backdrop" onClick={closeFaq} aria-hidden="true">
          <div
            className="faq-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="faq-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="faq-header">
              <div className="faq-header__title">
                <span className="faq-header__icon">?</span>
                <span id="faq-title">FAQ</span>
              </div>
              <button
                ref={faqCloseRef}
                className="faq-close"
                onClick={closeFaq}
                aria-label="Close FAQ"
              >
                x
              </button>
            </div>

            <div className="faq-body">
              <div className="faq-list">
                <div className="faq-item">
                  <button
                    type="button"
                    className="faq-row"
                    aria-expanded={faqOpenKey === "formulas"}
                    aria-controls="faq-panel-formulas"
                    onClick={() =>
                      setFaqOpenKey(faqOpenKey === "formulas" ? null : "formulas")
                    }
                  >
                    <span className="faq-row__left">
                      <span className="faq-row__icon" aria-hidden="true">
                        <Calculator size={18} className="faq-row__icon-svg" />
                      </span>
                      <span className="faq-row__label">Formulas</span>
                    </span>
                    <ChevronDown
                      className={`faq-row__chev ${faqOpenKey === "formulas" ? "is-open" : ""}`}
                      aria-hidden="true"
                    />
                  </button>

                  <div
                    id="faq-panel-formulas"
                    className={`faq-content ${faqOpenKey === "formulas" ? "is-open" : ""}`}
                    aria-hidden={faqOpenKey !== "formulas"}
                  >
                    <div className="faq-sublist">
                      {formulaAccordionItems.map((item) => (
                        <div className="faq-subitem" key={item.key}>
                          <button
                            type="button"
                            className="faq-subrow"
                            aria-expanded={formulaOpenKey === item.key}
                            aria-controls={`faq-panel-formula-${item.key}`}
                            onClick={() =>
                              setFormulaOpenKey(formulaOpenKey === item.key ? null : item.key)
                            }
                          >
                            <span className="faq-row__left">
                              <span className="faq-subrow__icon" aria-hidden="true">
                                {item.key === "depots" ? (
                                  <Building2 size={16} className="faq-subrow__icon-svg" />
                                ) : item.key === "leaders" ? (
                                  <User size={16} className="faq-subrow__icon-svg" />
                                ) : item.key === "commanders" ? (
                                  <BadgeCheck size={16} className="faq-subrow__icon-svg" />
                                ) : (
                                  <Factory size={16} className="faq-subrow__icon-svg" />
                                )}
                              </span>
                              <span className="faq-row__label">{item.label}</span>
                            </span>
                            <ChevronDown
                              className={`faq-row__chev ${
                                formulaOpenKey === item.key ? "is-open" : ""
                              }`}
                              aria-hidden="true"
                            />
                          </button>

                          <div
                            id={`faq-panel-formula-${item.key}`}
                            className={`faq-content ${
                              formulaOpenKey === item.key ? "is-open" : ""
                            }`}
                            aria-hidden={formulaOpenKey !== item.key}
                          >
                            <div className="faq-subcontent">{item.content}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="faq-item">
                  <button
                    type="button"
                    className="faq-row"
                    aria-expanded={faqOpenKey === "scoring"}
                    aria-controls="faq-panel-scoring"
                    onClick={() => setFaqOpenKey(faqOpenKey === "scoring" ? null : "scoring")}
                  >
                    <span className="faq-row__left">
                      <span className="faq-row__icon" aria-hidden="true">
                        <Flag size={18} className="faq-row__icon-svg" />
                      </span>
                      <span className="faq-row__label">Scoring</span>
                    </span>
                    <ChevronDown
                      className={`faq-row__chev ${faqOpenKey === "scoring" ? "is-open" : ""}`}
                      aria-hidden="true"
                    />
                  </button>
                  <div
                    id="faq-panel-scoring"
                    className={`faq-content ${faqOpenKey === "scoring" ? "is-open" : ""}`}
                    aria-hidden={faqOpenKey !== "scoring"}
                  >
                    <div className="faq-panel-body">Placeholder</div>
                  </div>
                </div>

                <div className="faq-item">
                  <button
                    type="button"
                    className="faq-row"
                    aria-expanded={faqOpenKey === "data-rules"}
                    aria-controls="faq-panel-data-rules"
                    onClick={() =>
                      setFaqOpenKey(faqOpenKey === "data-rules" ? null : "data-rules")
                    }
                  >
                    <span className="faq-row__left">
                      <span className="faq-row__icon" aria-hidden="true">
                        <ClipboardList size={18} className="faq-row__icon-svg" />
                      </span>
                      <span className="faq-row__label">Data Rules</span>
                    </span>
                    <ChevronDown
                      className={`faq-row__chev ${faqOpenKey === "data-rules" ? "is-open" : ""}`}
                      aria-hidden="true"
                    />
                  </button>
                  <div
                    id="faq-panel-data-rules"
                    className={`faq-content ${faqOpenKey === "data-rules" ? "is-open" : ""}`}
                    aria-hidden={faqOpenKey !== "data-rules"}
                  >
                    <div className="faq-panel-body">Placeholder</div>
                  </div>
                </div>

                <div className="faq-item">
                  <button
                    type="button"
                    className="faq-row"
                    aria-expanded={faqOpenKey === "troubleshooting"}
                    aria-controls="faq-panel-troubleshooting"
                    onClick={() =>
                      setFaqOpenKey(
                        faqOpenKey === "troubleshooting" ? null : "troubleshooting"
                      )
                    }
                  >
                    <span className="faq-row__left">
                      <span className="faq-row__icon" aria-hidden="true">
                        <Wrench size={18} className="faq-row__icon-svg" />
                      </span>
                      <span className="faq-row__label">Troubleshooting</span>
                    </span>
                    <ChevronDown
                      className={`faq-row__chev ${
                        faqOpenKey === "troubleshooting" ? "is-open" : ""
                      }`}
                      aria-hidden="true"
                    />
                  </button>
                  <div
                    id="faq-panel-troubleshooting"
                    className={`faq-content ${faqOpenKey === "troubleshooting" ? "is-open" : ""}`}
                    aria-hidden={faqOpenKey !== "troubleshooting"}
                  >
                    <div className="faq-panel-body">Placeholder</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Findings: the badge was outside the relative card wrapper so it could anchor to the page; podium-item was not consistently relative; width clamps were tight and placeholders squeezed layout.
function Podium({ top3, view }) {
  const podiumItems = normalizePodiumItems(top3);
  const width = useWindowWidth();
  if (!podiumItems.length) return null;

  return (
    <div className="podium">
      {podiumItems.map((item, index) => {
        const rank = item.rank ?? index + 1;
        const payins = item.payins ?? item.totalPayins ?? 0;
        // Move compact sales threshold to 1100px.
        const salesValue =
          width <= 600
            ? formatCurrencyPHPCompact(item.sales, "600")
            : width <= 1100
            ? formatCurrencyPHPCompact(item.sales, "700")
            : formatCurrencyPHP(item.sales);

        // CSS didn’t apply because podium-card class wasn’t rendered.
        const cardClass = mergeClassNames(
          "podium-card",
          rank === 1 && "podium-card--winner",
          rank === 2 && "podium-card--silver",
          rank === 3 && "podium-card--orange"
        );
        const rankNumberClass = mergeClassNames(
          "podium-rank-number",
          rank === 1 && "podium-rank-number--winner",
          rank === 2 && "podium-rank-number--silver",
          rank === 3 && "podium-rank-number--orange"
        );

        return (
          <div
            key={item.key || item.id}
            className={mergeClassNames("podium-item", `podium-item--rank-${rank}`)}
          >
            <div className={rankNumberClass} aria-hidden="true">
              {rank}
            </div>
            <div className="podium-avatar-chip" aria-hidden="true">
              <div className="podium-avatar-chip__inner">
                {item.avatarUrl ? (
                  <img src={item.avatarUrl} alt={item.name} />
                ) : (
                  <div className="podium-initials">{getInitials(item.name)}</div>
                )}
              </div>
            </div>
            <motion.div
              className={cardClass}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: index * 0.1 }}
            >
              <div className="podium-name">{item.name}</div>
              <div className="podium-points">{Number(item.points || 0).toFixed(1)}</div>
              <div className="podium-points-label">points</div>
              <div className="podium-stats-row">
                <div className="podium-stat">
                  <div className="podium-stat__value">{item.leads ?? 0}</div>
                  <div className="podium-stat__label">leads</div>
                </div>
                <div className="podium-stat">
                  <div className="podium-stat__value">{payins}</div>
                  <div className="podium-stat__label">payins</div>
                </div>
                <div className="podium-stat">
                  <div className="podium-stat__value">{salesValue}</div>
                  <div className="podium-stat__label">sales</div>
                </div>
              </div>
            </motion.div>
          </div>
        );
      })}
    </div>
  );
}

function LeaderboardRows({ rows, view, page, pageCount, onPageChange, total }) {
  const listRef = useRef(null);
  const width = useWindowWidth();

  const labelHeader =
    view === "leaders"
      ? "Leader Name"
      : view === "depots"
      ? "Depot"
      : view === "platoon"
      ? "Leader Name"
      : view === "companies"
      ? "Company"
      : "Commander";

  const showPlatoon = view === "leaders";
  const PAGE_SIZE = 10;
  const hasRows = rows.length > 0;
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(total, (page - 1) * PAGE_SIZE + rows.length);
  const useCompactSales = width <= 400;

  const pageNumbers = () => {
    if (pageCount <= 7) {
      return Array.from({ length: pageCount }, (_, index) => index + 1);
    }

    const pages = [1];
    const start = Math.max(2, page - 1);
    const end = Math.min(pageCount - 1, page + 1);

    if (start > 2) {
      pages.push("ellipsis-start");
    }

    for (let current = start; current <= end; current += 1) {
      pages.push(current);
    }

    if (end < pageCount - 1) {
      pages.push("ellipsis-end");
    }

    pages.push(pageCount);
    return pages;
  };

  const handlePageChange = (nextPage) => {
    onPageChange(nextPage);
    if (listRef.current) {
      listRef.current.scrollTo({ top: 0, behavior: "smooth" });
    } else if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  if (!hasRows) return null;

  return (
    <div className="rank-list">
      <div className="rank-list__items" ref={listRef}>
        <div className="rank-header">
          <div className="rank-header__rank">Rank</div>
          <div className="rank-header__name">{labelHeader}</div>
          <div className="rank-header__metrics">
            <span className="rank-label">
              <span className="rank-label__full">Leads</span>
              <span className="rank-label__short">LDS</span>
            </span>
            <span className="rank-label">
              <span className="rank-label__full">Payins</span>
              <span className="rank-label__short">PI</span>
            </span>
            <span className="rank-label">
              <span className="rank-label__full">Sales</span>
              <span className="rank-label__short">SALES</span>
            </span>
          </div>
          <div className="rank-header__points">
            <span className="rank-label">
              <span className="rank-label__full">Points</span>
              <span className="rank-label__short">PTS</span>
            </span>
          </div>
        </div>
        {rows.map((r, index) => {
          const computedRank = 4 + (page - 1) * PAGE_SIZE + index;
          const rankValue = r?.rank ?? computedRank;
          return (
            <div className="rank-card" key={`${view}-${rankValue}-${r.key}`}>
              <div className="rank-card__rank">#{rankValue}</div>
              <div className="row-name">
                <div className="row-avatar">
                  {r.avatarUrl ? (
                    <img src={r.avatarUrl} alt={r.name} />
                  ) : (
                    <span className="row-initials">{getInitials(r.name)}</span>
                  )}
                </div>
                <div className="row-labels">
                  <div className="row-title">{r.name}</div>
                  {showPlatoon && r.platoon && <div className="row-sub">{r.platoon}</div>}
                </div>
              </div>
              <div className="rank-card__metrics-wrap">
                <div className="rank-card__metrics">
                  <div className="leader-row-stat">
                    <span className="leader-row-stat__value">{r.leads}</span>
                  </div>
                  <div className="leader-row-stat">
                    <span className="leader-row-stat__value">{r.payins}</span>
                  </div>
                  <div className="leader-row-stat">
                    <span className="leader-row-stat__value">
                      {useCompactSales
                        ? formatCurrencyPHPCompact(r.sales, "600")
                        : formatCurrencyPHP(r.sales)}
                    </span>
                  </div>
                </div>
              </div>
              <div className="rank-card__points">
                <div className="leader-row-stat leader-row-stat--points">
                  <div className="leader-row-stat__value">
                    {Number(r.points ?? 0).toFixed(1)}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="pagination">
        <div className="pagination__row">
          <div className="pagination__meta">
            Showing {rangeStart} - {rangeEnd} of {total}
          </div>
          {pageCount > 1 && (
            <div className="pagination__controls">
              <button
                className="pagination__btn pagination__btn--nav"
                type="button"
                onClick={() => handlePageChange(Math.max(1, page - 1))}
                disabled={page === 1}
              >
                Prev
              </button>
              <div className="pagination__pages">
                {pageNumbers().map((value) => {
                  if (typeof value !== "number") {
                    return (
                      <span className="pagination__ellipsis" key={value}>
                        ...
                      </span>
                    );
                  }
                  return (
                    <button
                      key={value}
                      type="button"
                      className={mergeClassNames(
                        "pagination__btn",
                        value === page && "pagination__btn--active"
                      )}
                      onClick={() => handlePageChange(value)}
                    >
                      {value}
                    </button>
                  );
                })}
              </div>
              <button
                className="pagination__btn pagination__btn--nav"
                type="button"
                onClick={() => handlePageChange(Math.min(pageCount, page + 1))}
                disabled={page === pageCount}
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
