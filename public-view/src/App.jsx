// src/App.jsx
import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getLeaderboard } from "./services/leaderboard.service";
import "./styles.css";

const VIEW_TABS = [
  { key: "depots", label: "Depots" },
  { key: "leaders", label: "Leaders" },
  { key: "companies", label: "Commanders" },
];

const LEADER_ROLE_TABS = [
  { key: "all", label: "All" },
  { key: "platoon", label: "Platoon" },
  { key: "squad", label: "Squad" },
];

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

function buildWeekTabsForCurrentMonth(baseDate = new Date()) {
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth(); // 0 = Jan
  const monthEndDay = new Date(year, month + 1, 0).getDate();
  const todayDay = baseDate.getDate();

  // current week number 1–4, based on day of month
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

function App() {
  const initialWeeks = buildWeekTabsForCurrentMonth();
  const [weekTabs] = useState(initialWeeks.tabs);
  const [activeWeek, setActiveWeek] = useState(initialWeeks.currentKey);
  const activeWeekTab = weekTabs.find((w) => w.key === activeWeek);
  const weekRangeLabel = formatWeekRange(activeWeekTab?.displayRange);
  const [activeView, setActiveView] = useState("leaders");
  const [leaderRoleFilter, setLeaderRoleFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);

  useEffect(() => {
    let isCancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const week = weekTabs.find((w) => w.key === activeWeek);
        const range = week?.range;
        const result = await getLeaderboard({
          startDate: toYMD(range.start),
          endDate: toYMD(range.end),
          groupBy: activeView,
          roleFilter: leaderRoleFilter === "all" ? null : leaderRoleFilter,
        });

        if (!isCancelled) setData(result);
      } catch (e) {
        console.error(e);
        if (!isCancelled) setError("Unable to load leaderboard data.");
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

  const metrics = data?.metrics || { entitiesCount: 0, totalLeads: 0, totalSales: 0 };
  const rows = data?.rows || [];
  const top3 = rows.slice(0, 3);
  const rest = rows.slice(3);
  const entitiesLabel = activeView === "companies" ? "Commanders" : activeView === "depots" ? "Depots" : "Leaders";

  const title =
    activeView === "leaders"
      ? "Platoon Leader Rankings"
      : activeView === "depots"
      ? "Depot Rankings"
      : "Commander Rankings";

  return (
    <div className="page">
      <div className="page-inner">
        {/* Top header */}
        <header className="top-header">
          <div className="brand">
            <div className="brand-logo" />
            <div className="brand-text">Grinders Guild</div>
          </div>
          <div className="page-title">Battle of Platoons</div>
          <div className="page-date">{today}</div>
        </header>

        {/* Week selector + metrics */}
        <section className="week-metrics">
          <div className="week-box">
            <div className="week-label">View Previous Updates :</div>
            <div className="week-range">{weekRangeLabel}</div>
            <div className="week-tabs">
              {weekTabs.map((w) => (
                <button
                  key={w.key}
                  className={
                    "week-tab" + (w.key === activeWeek ? " week-tab--active" : "")
                  }
                  disabled={!w.enabled}
                  onClick={() => w.enabled && setActiveWeek(w.key)}
                >
                  {w.label}
                </button>
              ))}
            </div>
          </div>

          <div className="metric-cards">
            <MetricCard label={entitiesLabel} value={metrics.entitiesCount} />
            <MetricCard label="Leads" value={metrics.totalLeads} />
            <MetricCard label="Sales" value={formatCurrencyPHP(metrics.totalSales)} />
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
          <div className="status-text">Loading live rankings…</div>
        )}
        {error && <div className="status-text status-text--error">{error}</div>}

        <div className="status-text" style={{ fontSize: 13, marginBottom: 12 }}>
          Only publishable results are shown (Matched or Super Admin Approved).
        </div>

        {!loading && !error && (
          <>
            {rows.length === 0 ? (
              <div className="empty-state">
                No data yet for this week.
              </div>
            ) : (
              <>
                <Podium top3={top3} view={activeView} />
                <LeaderboardTable rows={rows} view={activeView} />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function MetricCard({ label, value }) {
  return (
    <motion.div
      className="metric-card"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
    </motion.div>
  );
}

function Podium({ top3, view }) {
  if (!top3.length) return null;

  // arrange as [2nd, 1st, 3rd]
  const arranged = [top3[1], top3[0], top3[2]];

  return (
    <div className="podium">
      {arranged.map((item, index) => {
        if (!item) return <div key={index} className="podium-card-placeholder" />;
        const rank =
          index === 1
            ? 1
            : index === 0
            ? (top3[1]?.rank ?? 2)
            : (top3[2]?.rank ?? 3);

        const accentClass =
          rank === 1 ? "podium-card--gold" : rank === 3 ? "podium-card--orange" : "";

        return (
          <motion.div
            key={item.key || item.id}
            className={`podium-card ${accentClass}`}
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: index * 0.1 }}
          >
            <div className="podium-rank">{rank}</div>
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
        );
      })}
    </div>
  );
}

function LeaderboardTable({ rows, view }) {
  if (!rows.length) return null;

  const labelHeader =
    view === "leaders"
      ? "Leader Name"
      : view === "depots"
      ? "Depot"
      : "Commander";

  return (
    <div className="table-wrapper">
      <table className="leader-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>{labelHeader}</th>
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
