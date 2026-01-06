// src/App.jsx
import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { getLeaderboard, probeRawDataVisibility } from "./services/leaderboard.service";
import { supabaseConfigured, supabaseConfigError, getSupabaseProjectRef } from "./services/supabase";
import "./styles.css";

// Findings: layout wrappers were flattened, so the shared metric bar and podium positioning lost their shared blue container and relative rank anchors.

const VIEW_TABS = [
  { key: "depots", label: "Depots" },
  { key: "leaders", label: "Leaders" },
  { key: "commanders", label: "Commanders" },
  { key: "companies", label: "Companies" },
];

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

function buildWeekTabsForCurrentMonth(baseDate = new Date()) {
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth(); // 0 = Jan
  const monthEndDay = new Date(year, month + 1, 0).getDate();
  const todayDay = baseDate.getDate();

  // current week number 1â€“4, based on day of month
  const currentWeekNumber = Math.min(4, Math.ceil(todayDay / 7));

  const tabs = [];

  for (let weekIndex = 1; weekIndex <= 4; weekIndex++) {
    // ----- DISPLAY RANGE (7-day block) -----
    const displayStartDay = (weekIndex - 1) * 7 + 1;
    if (displayStartDay > monthEndDay) break; // no more weeks in this month

    const displayEndDay = Math.min(displayStartDay + 6, monthEndDay);

    const displayStart = new Date(year, month, displayStartDay, 0, 0, 0, 0);
    const displayEnd = new Date(
      year,
      month,
      displayEndDay,
      23,
      59,
      59,
      999
    );

    // ----- QUERY RANGE (cumulative) -----
    const cumulativeEndDay = Math.min(weekIndex * 7, monthEndDay);
    const queryStart = new Date(year, month, 1, 0, 0, 0, 0);
    const queryEnd = new Date(
      year,
      month,
      cumulativeEndDay,
      23,
      59,
      59,
      999
    );

    const isCurrent = weekIndex === currentWeekNumber;
    const enabled = weekIndex <= currentWeekNumber;

    tabs.push({
      key: `week${weekIndex}`,
      label: isCurrent ? `Week ${weekIndex} - Current` : `Week ${weekIndex}`,
      range: { start: queryStart, end: queryEnd }, // used for Firestore query
      displayRange: { start: displayStart, end: displayEnd }, // used for text
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
  const month = displayRange.start.toLocaleDateString("en-US", {
    month: "short",
  });
  const startDay = displayRange.start.getDate().toString().padStart(2, "0");
  const endDay = displayRange.end.getDate().toString().padStart(2, "0");
  const year = displayRange.end.getFullYear();
  return `${month} ${startDay} - ${month} ${endDay}, ${year}`;
}

function getInitials(name = "") {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
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
  if (viewKey === "companies") return "companies";
  if (viewKey === "commanders") return "companies";
  if (viewKey === "platoon") return "platoons";
  if (viewKey === "leaders" && roleFilter === "platoon") return "platoons";
  if (viewKey === "leaders" && roleFilter === "squad") return "squads";
  if (viewKey === "leaders" && roleFilter === "team") return "teams";
  return viewKey || "leaders";
}

function getGroupByForView(viewKey, roleFilter) {
  if (viewKey === "commanders") return "companies";
  if (viewKey === "leaders" && roleFilter === "platoon") return "platoon";
  return viewKey;
}

function App() {
  const initialWeeks = buildWeekTabsForCurrentMonth();
  const [weekTabs] = useState(initialWeeks.tabs);
  const [activeWeek, setActiveWeek] = useState(initialWeeks.currentKey);
  const activeWeekTab = weekTabs.find((w) => w.key === activeWeek);
  const weekRangeLabel = formatWeekRange(activeWeekTab?.displayRange);
  const [activeView, setActiveView] = useState("depots");
  const [leaderRoleFilter, setLeaderRoleFilter] = useState(LEADER_ROLE_TABS[0].key);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [probe, setProbe] = useState({ status: "idle", count: null, error: null });
  const projectRef = getSupabaseProjectRef();

  useEffect(() => {
    if (!supabaseConfigured) {
      setError(
        "Supabase env vars missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment (e.g., Vercel project settings or local .env)."
      );
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
        const battleTypeKey = getBattleTypeForView(groupByView, leaderRoleFilter);
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

  useEffect(() => {
    if (!supabaseConfigured) {
      setProbe({ status: "idle", count: null, error: null });
      return;
    }

    let cancelled = false;
    setProbe({ status: "loading", count: null, error: null });

    probeRawDataVisibility()
      .then((res) => {
        if (cancelled) return;
        setProbe({
          status: "done",
          count: res?.count ?? null,
          error: res?.error || null,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setProbe({ status: "done", count: null, error: err });
      });

    return () => {
      cancelled = true;
    };
  }, [supabaseConfigured]);

  const today = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "2-digit",
    year: "numeric",
  });

  const leadersPlatoonView = activeView === "leaders" && leaderRoleFilter === "platoon";
  const displayView = leadersPlatoonView ? "platoon" : activeView;
  const metrics = data?.metrics || { entitiesCount: 0, totalLeads: 0, totalSales: 0 };
  const rows = data?.rows || [];
  const debug = data?.debug || {};
  const publishableRowsCount = debug.publishableRowsCount ?? 0;
  const filteredByRangeCount = debug.filteredByRangeCount ?? 0;
  const companyRowsFetched = debug.companyRowsFetched ?? 0;
  const depotRowsFetched = debug.depotRowsFetched ?? 0;
  const activeFormula = data?.formula?.data || null;
  const selectedWeekKey = data?.formula?.weekKey || null;
  const formulaMetrics = normalizeFormulaMetrics(activeFormula);
  const formulaVersion = activeFormula?.version ?? activeFormula?.revision ?? "—";
  const formulaTitle = `${activeFormula?.label ?? "Not published"} (v${formulaVersion})`;
  const top3 = rows.slice(0, 3);
  const entitiesLabel =
    displayView === "commanders"
      ? "Commanders"
      : displayView === "companies"
      ? "Companies"
      : displayView === "depots"
      ? "Depots"
      : displayView === "platoon"
      ? "Uplines"
      : "Leaders";

  const title =
    displayView === "platoon"
      ? "Upline Rankings"
      : displayView === "leaders"
      ? "Platoon Leader Rankings"
      : displayView === "depots"
      ? "Depot Rankings"
      : displayView === "companies"
      ? "Company Rankings"
      : "Commander Rankings";

  const statusBlocks = [];

  useEffect(() => {
    if (!activeFormula || !selectedWeekKey) return;
    if (!isWeekKeyInRange(selectedWeekKey, activeFormula.effective_start_week_key, activeFormula.effective_end_week_key)) {
      console.warn("Active formula week mismatch", { selectedWeekKey, activeFormula });
    }
  }, [activeFormula, selectedWeekKey]);

  if (!supabaseConfigured) {
    statusBlocks.push(
      <div key="config-error" className="status-text status-text--error" style={{ marginBottom: 12 }}>
        <strong>CONFIG ERROR:</strong> {supabaseConfigError || "Supabase env vars missing."} Set{" "}
        <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in your deployment (e.g., Vercel project
        settings) or local <code>.env</code>. Older builds may have worked with baked keys, but this build requires the
        env vars.
      </div>
    );
  } else if (probe.status === "done" && !probe.error && probe.count === 0) {
    statusBlocks.push(
      <div key="probe-empty" className="status-text" style={{ marginBottom: 12 }}>
        <strong>DATA NOT PUBLISHABLE / RLS FILTERED:</strong> Connected to Supabase, but <code>raw_data</code> returned
        0 rows for anon access.
        <ul style={{ marginTop: 6, paddingLeft: 18, fontSize: 13 }}>
          <li>RLS publishable filter might hide all rows (approved=true OR matched depot/company totals).</li>
          <li>No approved/matched company rows exist for this project yet.</li>
          <li>Project ref mismatchâ€”verify you are using the correct Supabase env vars (see debug banner).</li>
        </ul>
        <div style={{ fontSize: 13, marginTop: 4 }}>
          Next actions: approve one company row and re-test; verify <code>raw_data</code> RLS for source='company' &amp;
          voided=false &amp; approved=true/matched; confirm env vars point to the intended project.
        </div>
      </div>
    );
  } else if (probe.status === "done" && probe.error) {
    const probeMsg = import.meta.env.DEV
      ? `${probe.error?.message ?? "Unknown error"}${probe.error?.code ? ` (code: ${probe.error.code})` : ""}`
      : "The public role could not read raw_data.";
    statusBlocks.push(
      <div key="probe-error" className="status-text status-text--error" style={{ marginBottom: 12 }}>
        <strong>Connected, but raw_data probe failed:</strong> {probeMsg}
      </div>
    );
  } else if (probe.status === "done" && (probe.count ?? 0) > 0 && !loading && rows.length === 0) {
    statusBlocks.push(
      <div key="no-publishable" className="status-text" style={{ marginBottom: 12 }}>
        <strong>raw_data is visible, but no publishable results for this week range.</strong>{" "}
        <span style={{ fontSize: 13 }}>
          (company rows fetched: {companyRowsFetched}, depot pairs: {depotRowsFetched}, publishable matches:{" "}
          {publishableRowsCount}, after date filter: {filteredByRangeCount})
        </span>
      </div>
    );
  }

  return (
    <div className="page">
      {import.meta.env.DEV && (
        <div
          style={{
            position: "fixed",
            top: 8,
            right: 8,
            padding: "6px 10px",
            background: "#111827",
            color: "#e5e7eb",
            borderRadius: 999,
            fontSize: 12,
            boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
            display: "flex",
            gap: 12,
            zIndex: 9999,
          }}
        >
          <span>Project: {projectRef}</span>
          <span>raw_data visible: {probe.status === "done" ? probe.count ?? "error" : "?"}</span>
          <span>Leaderboard rows: {rows.length}</span>
          <span>Error: {error || "none"}</span>
        </div>
      )}
      <div className="page-inner">
        {/* Top header */}
        <header className="top-header">
          <div className="brand">
            <img src="/gg-logo.png" alt="Grinders Guild logo" className="brand-logo" />
            <div className="brand-text">Grinders Guild</div>
          </div>
          <div className="page-title">Battle of Platoons</div>
          <div className="page-date">{today}</div>
        </header>

        {statusBlocks}

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
              <div className="metric-label">Sales</div>
              <div className="metric-value">{formatCurrencyPHP(metrics.totalSales)}</div>
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
          <div className="formula-summary">
            <div className="formula-title">
              Formula: {formulaTitle}
            </div>
            <div className="formula-details">
              {activeFormula ? (
                formulaMetrics.length ? (
                  formulaMetrics.map((m) => (
                    <span key={m.key || m.divisor} className="formula-pill">
                      {m.key || "Metric"}: ÷{m.divisor} • Max {m.maxPoints}
                    </span>
                  ))
                ) : (
                  <span className="formula-warning">Formula metrics are not configured.</span>
                )
              ) : (
                <span className="formula-warning">No published formula for this week.</span>
              )}
            </div>
          </div>
      </section>

        {/* Loading / error */}
        {loading && (
          <div className="status-text">Loading live rankingsâ€¦</div>
        )}
        {error && <div className="status-text status-text--error">{error}</div>}

        {!loading && !error && (
          <>
            {rows.length === 0 ? (
              <div className="empty-state">
                No publishable data for this period.
              </div>
            ) : (
              <>
                <Podium top3={top3} view={displayView} roleFilter={leaderRoleFilter} />
                <LeaderboardTable rows={rows} view={displayView} roleFilter={leaderRoleFilter} />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Findings: the badge was outside the relative card wrapper so it could anchor to the page; podium-item was not consistently relative; width clamps were tight and placeholders squeezed layout.
function Podium({ top3, view }) {
  const podiumItems = normalizePodiumItems(top3);
  if (!podiumItems.length) return null;

  return (
    <div className="podium">
      {podiumItems.map((item, index) => {
        const rank = item.rank ?? index + 1;

          const accentClasses = mergeClassNames(
            "podium-card",
            rank === 1 ? "podium-card--winner" : "",
            rank === 1 ? "podium-card--gold" : "",
            rank === 3 ? "podium-card--orange" : ""
          );

          return (
            <div
              key={item.key || item.id}
              className={mergeClassNames("podium-item", `podium-item--rank-${rank}`)}
            >
            <motion.div
              className={accentClasses}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: index * 0.1 }}
            >
              <div className="podium-rank-badge">{rank}</div>
              <div className="podium-avatar-wrapper">
                <div className="podium-avatar">
                  {item.avatarUrl ? (
                    <img src={item.avatarUrl} alt={item.name} />
                  ) : (
                    <div className="podium-initials">{getInitials(item.name)}</div>
                  )}
                </div>
              </div>
              <div className="podium-name">{item.name}</div>
              {view === "leaders" && item.platoon && (
                <div className="podium-subtext">{item.platoon}</div>
              )}
              <div className="podium-stats">
                <div>{item.points.toFixed(1)} pts</div>
                <div>{item.leads} leads</div>
                <div>{formatCurrencyPHP(item.sales)} sales</div>
              </div>
            </motion.div>
          </div>
        );
      })}
    </div>
  );
}

function LeaderboardTable({ rows, view, roleFilter }) {
  if (!rows.length) return null;

  const labelHeader =
    view === "leaders"
      ? "Leader Name"
      : view === "depots"
      ? "Depot"
      : view === "platoon"
      ? "Upline"
      : view === "companies"
      ? "Company"
      : "Commander";

  const showUpline = false;

  return (
    <div className="table-wrapper">
      <table className="leader-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>{labelHeader}</th>
            {showUpline && <th>Upline</th>}
            <th>Leads</th>
            <th>Payins</th>
            <th>Sales</th>
            <th className="th-right">Points</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${view}-${r.rank}-${r.key}`}>
              <td className="cell-rank">{r.rank}</td>
              <td className="cell-name">
                <div className="row-name">
                  <div className="row-avatar">
                    {r.avatarUrl ? (
                      <img src={r.avatarUrl} alt={r.name} />
                    ) : (
                      <span className="row-initials">
                        {getInitials(r.name)}
                      </span>
                    )}
                  </div>

                  <div className="row-labels">
                    <div className="row-title">{r.name}</div>

                    {/* show platoon only for leaders */}
                    {view === "leaders" && r.platoon && (
                      <div className="row-sub">{r.platoon}</div>
                    )}
                  </div>
                </div>
              </td>
              {showUpline && <td>{r.uplineName || "—"}</td>}
              <td>{r.leads}</td>
              <td>{r.payins}</td>
              <td>{formatCurrencyPHP(r.sales)}</td>
              <td className="cell-right">{r.points.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default App;






