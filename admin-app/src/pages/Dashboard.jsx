import React, { useEffect, useMemo, useState } from "react";
import "../styles/pages/dashboard.css";
import { getDashboardRankings } from "../services/dashboardRankings.service";

function UsersIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M7.5 12.5a4 4 0 1 1 3.63-2.33 5.5 5.5 0 0 1 3.62 4.33.75.75 0 0 1-1.5.16 4 4 0 0 0-7.9-.83.75.75 0 1 1-1.48-.24A5.5 5.5 0 0 1 7.5 12.5Zm9.75-.5a3 3 0 1 1 2.73-1.75 4.5 4.5 0 0 1 2.27 3.12.75.75 0 1 1-1.5.14 3 3 0 0 0-5.92-.5.75.75 0 0 1-1.46-.32A4.5 4.5 0 0 1 17.25 12Z"
      />
    </svg>
  );
}

function DepotIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M3.5 9.25a.75.75 0 0 1 .34-.63l8-5a.75.75 0 0 1 .8 0l8 5a.75.75 0 0 1-.4 1.38H19.5V19a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 4.5 19v-9h-.76a.75.75 0 0 1-.74-.75Zm2.5.75V19h2.75v-4.5h2.5V19H13v-4.5h2.5V19h2.5V10H6Z"
      />
    </svg>
  );
}

function CompanyIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M4.75 4.5A1.25 1.25 0 0 0 3.5 5.75v12.5A1.25 1.25 0 0 0 4.75 19.5h14.5a1.25 1.25 0 0 0 1.25-1.25V8.5a.75.75 0 0 0-.22-.53l-3.75-3.75a.75.75 0 0 0-.53-.22H4.75ZM5 6h9.5v3.5A1.5 1.5 0 0 0 16 11h3.5v7H5V6Zm11 .06L18.94 9H16V6.06Z"
      />
    </svg>
  );
}

function LeadsIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17Zm0 1.5a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm0 2.5a.75.75 0 0 1 .75.75v2.75h2.75a.75.75 0 1 1 0 1.5h-3.5a.75.75 0 0 1-.75-.75V8.25A.75.75 0 0 1 12 7.5Z"
      />
    </svg>
  );
}

function SalesIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M5 18.25a.75.75 0 0 1 .75-.75H19a.75.75 0 0 1 0 1.5H5.75A.75.75 0 0 1 5 18.25Zm1.75-4.5a.75.75 0 0 1 1.06 0l2.44 2.44 5.94-5.94a.75.75 0 1 1 1.06 1.06l-6.47 6.47a.75.75 0 0 1-1.06 0l-2.97-2.97a.75.75 0 0 1 0-1.06Z"
      />
    </svg>
  );
}

function RefreshIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M12 4a8 8 0 1 0 7.9 9.5.75.75 0 1 1 1.48.25A9.5 9.5 0 1 1 19 7.03l.62-.62a.75.75 0 0 1 1.28.53v4a.75.75 0 0 1-.75.75h-4a.75.75 0 0 1-.53-1.28l.77-.77A7.98 7.98 0 0 0 12 4Z"
      />
    </svg>
  );
}

function formatYmd(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfQuarter(date) {
  const quarter = Math.floor(date.getMonth() / 3);
  return new Date(date.getFullYear(), quarter * 3, 1);
}

function getDefaultStartDate(baseDate = new Date()) {
  const year = baseDate.getFullYear();
  const jan5 = new Date(year, 0, 5);
  return jan5 > baseDate ? new Date(year - 1, 0, 5) : jan5;
}
function formatRelativeTime(date) {
  if (!date) return "Updated —";
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.max(0, Math.floor(diffMs / 1000));
  if (diffSec < 30) return "Updated just now";
  if (diffSec < 60) return "Updated 1m ago";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `Updated ${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `Updated ${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `Updated ${diffDays}d ago`;
}

function formatNumber(value) {
  if (value === null || value === undefined || value === "") return "—";
  const num = Number(value);
  if (Number.isNaN(num)) return "—";
  return num.toLocaleString();
}

function formatCurrency(value) {
  if (value === null || value === undefined || value === "") return "—";
  const num = Number(value);
  if (Number.isNaN(num)) return "—";
  return num.toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function getInitials(name = "") {
  const cleaned = String(name || "").trim();
  if (!cleaned) return "—";
  const parts = cleaned.split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const second = parts.length > 1 ? parts[1]?.[0] ?? "" : "";
  return (first + second).toUpperCase();
}

function mergeClassNames(...classes) {
  return classes.filter(Boolean).join(" ");
}

function normalizePodiumItems(topItems = []) {
  const cleaned = (topItems || []).filter(Boolean);
  const byRank = new Map();
  cleaned.forEach((item) => {
    if (item?.rank == null) return;
    byRank.set(Number(item.rank), item);
  });

  if (byRank.size) {
    const rank2 = byRank.get(2);
    const rank1 = byRank.get(1);
    const rank3 = byRank.get(3);
    const ordered = [rank2, rank1, rank3].filter(Boolean);
    if (ordered.length) return ordered;
  }

  const sorted = [...cleaned].sort((a, b) => {
    if (a?.rank != null && b?.rank != null) return a.rank - b.rank;
    return (b?.sales ?? 0) - (a?.sales ?? 0);
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

function Podium({ top3, onSelect, selectedId }) {
  const podiumItems = normalizePodiumItems(top3);
  if (!podiumItems.length) return null;

  return (
    <div className="podium">
      {podiumItems.map((item, index) => {
        const rank = item.rank ?? index + 1;
        const cardClass = mergeClassNames(
          "podium-card",
          rank === 1 && "podium-card--winner",
          rank === 2 && "podium-card--silver",
          rank === 3 && "podium-card--orange",
          selectedId === item?.id && "is-selected"
        );
        const rankNumberClass = mergeClassNames(
          "podium-rank-number",
          rank === 1 && "podium-rank-number--winner",
          rank === 2 && "podium-rank-number--silver",
          rank === 3 && "podium-rank-number--orange"
        );
        const showPoints = Number.isFinite(item?.points) && item.points !== 0;

        return (
          <button
            key={item.key || item.id || `${rank}-${index}`}
            type="button"
            className={mergeClassNames("podium-item", `podium-item--rank-${rank}`)}
            onClick={() => onSelect?.(item)}
          >
            <div className={rankNumberClass} aria-hidden="true">
              {rank}
            </div>
            <div className="podium-avatar-chip" aria-hidden="true">
              <div className="podium-avatar-chip__inner">
                {item.photoUrl ? (
                  <img src={item.photoUrl} alt={item.name} />
                ) : (
                  <div className="podium-initials">{getInitials(item.name)}</div>
                )}
              </div>
            </div>
            <div className={cardClass}>
              <div className="podium-name">{item.name}</div>
              {showPoints && (
                <>
                  <div className="podium-points">{Number(item.points || 0).toFixed(1)}</div>
                  <div className="podium-points-label">points</div>
                </>
              )}
              <div className="podium-stats-row">
                <div className="podium-stat">
                  <div className="podium-stat__value">{formatNumber(item.leads ?? 0)}</div>
                  <div className="podium-stat__label">leads</div>
                </div>
                <div className="podium-stat">
                  <div className="podium-stat__value">{formatNumber(item.payins ?? 0)}</div>
                  <div className="podium-stat__label">payins</div>
                </div>
                <div className="podium-stat">
                  <div className="podium-stat__value">{formatCurrency(item.sales ?? 0)}</div>
                  <div className="podium-stat__label">sales</div>
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export default function Dashboard() {
  const [mode, setMode] = useState("leaders");
  const [dateFrom, setDateFrom] = useState(() => formatYmd(getDefaultStartDate()));
  const [dateTo, setDateTo] = useState(() => formatYmd(new Date()));
  const [data, setData] = useState({ kpis: {}, rows: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [selectedRow, setSelectedRow] = useState(null);
  const [leaderRole, setLeaderRole] = useState("platoon");

  const loadDashboard = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await getDashboardRankings({
        mode,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        roleFilter: mode === "leaders" ? leaderRole : null,
      });
      setData(result ?? { kpis: {}, rows: [] });
      setLastUpdatedAt(new Date());
    } catch (err) {
      setError(err?.message || "Failed to load dashboard.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, [mode, dateFrom, dateTo, leaderRole]);

  const sortedRows = useMemo(() => {
    const rows = Array.isArray(data?.rows) ? data.rows : [];
    return [...rows].sort((a, b) => {
      const salesDiff = Number(b?.sales || 0) - Number(a?.sales || 0);
      if (salesDiff !== 0) return salesDiff;
      return Number(b?.leads || 0) - Number(a?.leads || 0);
    });
  }, [data]);

  const topThree = sortedRows.slice(0, 3).map((row, index) => ({
    ...row,
    rank: index + 1,
  }));
  const topTen = sortedRows.slice(3, 13);
  const hasRows = sortedRows.length > 0;

  const kpis = [
    { key: "totalSales", label: "Total Sales", icon: SalesIcon, format: formatCurrency },
    { key: "totalLeads", label: "Total Leads", icon: LeadsIcon, format: formatNumber },
    { key: "leadersCount", label: "Leaders", icon: UsersIcon, format: formatNumber },
    { key: "depotsCount", label: "Depots", icon: DepotIcon, format: formatNumber },
    { key: "companiesCount", label: "Companies", icon: CompanyIcon, format: formatNumber },
  ];

  const presets = useMemo(() => {
    const today = new Date();
    const todayYmd = formatYmd(today);
    return [
      { key: "today", label: "Today", from: todayYmd, to: todayYmd },
      { key: "last7", label: "Last 7 Days", from: formatYmd(addDays(today, -6)), to: todayYmd },
      { key: "month", label: "This Month", from: formatYmd(startOfMonth(today)), to: todayYmd },
      { key: "quarter", label: "This Quarter", from: formatYmd(startOfQuarter(today)), to: todayYmd },
    ];
  }, []);

  const applyPreset = (preset) => {
    setDateFrom(preset.from);
    setDateTo(preset.to);
  };

  const selectedPresetKey = useMemo(() => {
    const match = presets.find((preset) => preset.from === dateFrom && preset.to === dateTo);
    return match ? match.key : "";
  }, [presets, dateFrom, dateTo]);

  const handleSelectRow = (row) => {
    setSelectedRow(row);
  };

  return (
    <div className="dashboard-page">
      <div className="card dashboard-shell">
        <div className="dashboard-header">
          <div>
            <div className="card-title">Dashboard</div>
            <div className="muted">Quick snapshot of the current competition and leaderboards.</div>
          </div>
        </div>

        <div className="dashboard-topbar">
          <div className="dashboard-topbar-metrics">
            {kpis.map(({ key, label, icon: Icon, format }, index) => (
              <React.Fragment key={key}>
                {index > 0 && <div className="dashboard-topbar-divider" aria-hidden="true" />}
                <div className="dashboard-topbar-segment dashboard-topbar-segment--metric">
                  <div className="dashboard-metric-header">
                    <div className="dashboard-metric-label">{label}</div>
                    <div className="dashboard-metric-icon" aria-hidden="true">
                      <Icon size={18} />
                    </div>
                  </div>
                  <div className="dashboard-metric-value">{format?.(data?.kpis?.[key])}</div>
                </div>
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="dashboard-filter-bar">
          <div className="dashboard-filter-group">
            <div className="dashboard-filter-label">Date Range</div>
            <div className="dashboard-topbar-range">
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              <span className="dashboard-topbar-range__divider">to</span>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
            <div className="dashboard-topbar-chips">
              {presets.map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  className={`dashboard-chip${selectedPresetKey === preset.key ? " dashboard-chip--active" : ""}`}
                  onClick={() => applyPreset(preset)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
          <div className="dashboard-filter-meta">
            <select
              className="dashboard-topbar-select"
              value={selectedPresetKey}
              onChange={(e) => {
                const preset = presets.find((item) => item.key === e.target.value);
                if (preset) applyPreset(preset);
              }}
              aria-label="Quick date range presets"
            >
              <option value="">Custom range</option>
              {presets.map((preset) => (
                <option key={preset.key} value={preset.key}>
                  {preset.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="button secondary dashboard-refresh"
              onClick={loadDashboard}
              disabled={loading}
            >
              <RefreshIcon size={12} />
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>

        {error && <div className="dashboard-error">{error}</div>}

        <section className="view-toggle-section">
          <div className="view-toggle" role="tablist" aria-label="Ranking scope">
            {["depots", "leaders", "commanders", "companies"].map((key) => (
              <button
                key={key}
                type="button"
                className={`view-pill${mode === key ? " view-pill--active" : ""}`}
                onClick={() => setMode(key)}
              >
                {key === "leaders"
                  ? "Leaders"
                  : key === "depots"
                  ? "Depots"
                  : key === "commanders"
                  ? "Commanders"
                  : "Companies"}
              </button>
            ))}
          </div>
          {mode === "leaders" && (
            <div className="view-toggle leader-role-toggle" role="tablist" aria-label="Leader role">
              {["platoon", "squad", "team"].map((key) => (
                <button
                  key={key}
                  type="button"
                  className={`view-pill${leaderRole === key ? " view-pill--active" : ""}`}
                  onClick={() => setLeaderRole(key)}
                >
                  {key === "platoon" ? "Platoon" : key === "squad" ? "Squad" : "Team"}
                </button>
              ))}
            </div>
          )}
        </section>

        {!loading && !hasRows && (
          <div className="dashboard-empty">
            <div className="dashboard-empty__title">No data for this period</div>
            <div className="dashboard-empty__text">Try selecting a wider date range or a quick preset.</div>
            <button type="button" className="button primary" onClick={() => applyPreset(presets[1])}>
              Use Last 7 Days
            </button>
          </div>
        )}

        <div className="dashboard-grid">
          <div className="card dashboard-panel dashboard-panel--podium">
            <div className="dashboard-panel__title">Top 3</div>
            <Podium
              top3={topThree}
              onSelect={handleSelectRow}
              selectedId={selectedRow?.id}
            />
          </div>

          <div className="card dashboard-panel">
            <div className="dashboard-panel__title">Top 4 - 13</div>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>
                      {mode === "leaders"
                        ? "Leader"
                        : mode === "depots"
                        ? "Depot"
                        : mode === "commanders"
                        ? "Commander"
                        : "Company"}
                    </th>
                    <th>Leads</th>
                    <th>Payins</th>
                    <th>Sales</th>
                  </tr>
                </thead>
                <tbody>
                  {topTen.length === 0 && !loading ? (
                    <tr>
                      <td colSpan={5} className="muted">
                        No data available for the selected range.
                      </td>
                    </tr>
                  ) : (
                    topTen.map((row, index) => (
                      <tr
                        key={`${row?.id || row?.name}-${index}`}
                        className={selectedRow?.id === row?.id ? "is-selected" : ""}
                        onClick={() => handleSelectRow(row)}
                      >
                        <td>#{index + 4}</td>
                        <td>{row?.name || "Unknown"}</td>
                        <td>{formatNumber(row?.leads)}</td>
                        <td>{formatNumber(row?.payins)}</td>
                        <td>{formatCurrency(row?.sales)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {selectedRow && (
          <div className="dashboard-detail">
            <div>
            <div className="dashboard-detail__title">
              Selected{" "}
              {mode === "leaders"
                ? "Leader"
                : mode === "depots"
                ? "Depot"
                : mode === "commanders"
                ? "Commander"
                : "Company"}
            </div>
              <div className="dashboard-detail__name">{selectedRow?.name || "Unknown"}</div>
            </div>
            <div className="dashboard-detail__metrics">
              <div>
                <div className="dashboard-detail__label">Leads</div>
                <div className="dashboard-detail__value">{formatNumber(selectedRow?.leads)}</div>
              </div>
              <div>
                <div className="dashboard-detail__label">Payins</div>
                <div className="dashboard-detail__value">{formatNumber(selectedRow?.payins)}</div>
              </div>
              <div>
                <div className="dashboard-detail__label">Sales</div>
                <div className="dashboard-detail__value">{formatCurrency(selectedRow?.sales)}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

