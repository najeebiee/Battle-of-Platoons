// src/App.jsx
import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getLeaderboard } from "./services/leaderboardService";
import "./styles.css";

const VIEW_TABS = [
  { key: "depots", label: "Depots" },
  { key: "leaders", label: "Leaders" },
  { key: "companies", label: "Companies" },
];

function formatCurrency(n) {
  if (!n) return "$0";
  return "$" + n.toLocaleString();
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

function App() {
  const initialWeeks = buildWeekTabsForCurrentMonth();
  const [weekTabs] = useState(initialWeeks.tabs);
  const [activeWeek, setActiveWeek] = useState(initialWeeks.currentKey);
  const activeWeekTab = weekTabs.find((w) => w.key === activeWeek);
  const weekRangeLabel = formatWeekRange(activeWeekTab?.displayRange);
  const [activeView, setActiveView] = useState("leaders");
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
        const result = await getLeaderboard(week?.range || null, activeView);
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
  }, [activeWeek, activeView]);

  const today = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "2-digit",
    year: "numeric",
  });

  const metrics = data?.metrics || { entitiesCount: 0, totalLeads: 0, totalSales: 0 };
  const rows = data?.rows || [];
  const top3 = rows.slice(0, 3);
  const rest = rows.slice(3);

  const title =
    activeView === "leaders"
      ? "Platoon Leader Rankings"
      : activeView === "depots"
      ? "Depot Rankings"
      : "Company Rankings";

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
            <MetricCard label="Leaders" value={metrics.entitiesCount} />
            <MetricCard label="Leads" value={metrics.totalLeads} />
            <MetricCard label="Sales" value={formatCurrency(metrics.totalSales)} />
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
          <h2 className="section-title">{title}</h2>
        </section>

        {/* Loading / error */}
        {loading && (
          <div className="status-text">Loading live rankings…</div>
        )}
        {error && <div className="status-text status-text--error">{error}</div>}

        {!loading && !error && (
          <>
            {/* Podium */}
            <Podium top3={top3} view={activeView} />

            {/* Table */}
            <LeaderboardTable rows={rows} view={activeView} />
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
            {view === "leaders" && (
              <div className="podium-avatar-wrapper">
                <div className="podium-avatar">
                  {item.avatarUrl ? (
                    <img src={item.avatarUrl} alt={item.name} />
                  ) : (
                    <span className="podium-avatar-placeholder" />
                  )}
                </div>
              </div>
            )}
            <div className="podium-name">{item.name}</div>
            {view === "leaders" && item.platoon && (
              <div className="podium-subtext">{item.platoon}</div>
            )}
            <div className="podium-stats">
              <div>{item.points.toFixed(1)} pts</div>
              <div>{item.leads} leads</div>
              <div>{formatCurrency(item.sales)} sales</div>
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
      : "Company";

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
                {view === "leaders" && (
                  <span className="cell-avatar">
                    {r.avatarUrl ? (
                      <img src={r.avatarUrl} alt={r.name} />
                    ) : (
                      <span className="cell-avatar-placeholder" />
                    )}
                  </span>
                )}
                <span>{r.name}</span>
              </td>
              <td>{r.leads}</td>
              <td>{r.payins}</td>
              <td>{formatCurrency(r.sales)}</td>
              <td className="cell-right">{r.points.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default App;
