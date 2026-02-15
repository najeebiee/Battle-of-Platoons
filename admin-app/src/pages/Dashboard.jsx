import React, { useEffect, useMemo, useState } from "react";
import AppPagination from "../components/AppPagination";
import ExportButton from "../components/ExportButton";
import "../styles/pages/dashboard.css";
import "../styles/pages/updates.css";
import { getDashboardRankings } from "../services/dashboardRankings.service";
import { exportToXlsx } from "../services/export.service";
import { getRawDataHistory } from "../services/rawData.service";
import { computeTotalScore } from "../services/scoringEngine";

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

function formatPoints(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0.0";
  return num.toFixed(1);
}

function isBlankValue(value) {
  return value === null || value === undefined || String(value).trim() === "";
}

function matchesDepotKey(value, selectedKey) {
  if (selectedKey === "unassigned") return isBlankValue(value);
  return String(value ?? "") === selectedKey;
}

function getScopedMetrics(row, { mode, selectedId }) {
  if (mode !== "depots") {
    return {
      leads: Number(row?.leads ?? 0),
      payins: Number(row?.payins ?? 0),
      sales: Number(row?.sales ?? 0),
    };
  }

  const selectedKey = String(selectedId ?? "");
  const matchesLeadsDepot = matchesDepotKey(row?.leads_depot_id, selectedKey);
  const matchesSalesDepot = matchesDepotKey(row?.sales_depot_id, selectedKey);

  return {
    leads: matchesLeadsDepot ? Number(row?.leads ?? 0) : 0,
    payins: matchesSalesDepot ? Number(row?.payins ?? 0) : 0,
    sales: matchesSalesDepot ? Number(row?.sales ?? 0) : 0,
  };
}

function rowMatchesSelection(row, { mode, leaderRole, selectedId }) {
  const selectedKey = String(selectedId ?? "");
  if (!selectedKey) return false;

  if (mode === "leaders") {
    if (leaderRole === "platoon") {
      if (selectedKey === "no-upline") return isBlankValue(row?.uplineId);
      return String(row?.uplineId ?? "") === selectedKey;
    }
    return String(row?.agent_id ?? "") === selectedKey;
  }

  if (mode === "depots") {
    return matchesDepotKey(row?.leads_depot_id, selectedKey) || matchesDepotKey(row?.sales_depot_id, selectedKey);
  }

  if (mode === "commanders") {
    return String(row?.companyId ?? "") === selectedKey;
  }

  if (mode === "companies") {
    return String(row?.platoonId ?? "") === selectedKey;
  }

  return false;
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
              <div className="podium-points">{formatPoints(item?.points)}</div>
              <div className="podium-points-label">points</div>
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
  const [data, setData] = useState({ kpis: {}, rows: [], formula: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [selectedRow, setSelectedRow] = useState(null);
  const [leaderRole, setLeaderRole] = useState("platoon");
  const [historyRows, setHistoryRows] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const [listPage, setListPage] = useState(1);
  const LIST_ROWS_PER_PAGE = 10;
  const HISTORY_ROWS_PER_PAGE = 10;

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
      setData(result ?? { kpis: {}, rows: [], formula: null });
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
      const rankDiff = Number(a?.rank || 0) - Number(b?.rank || 0);
      if (rankDiff !== 0) return rankDiff;
      return (
        Number(b?.points || 0) - Number(a?.points || 0) ||
        Number(b?.sales || 0) - Number(a?.sales || 0) ||
        Number(b?.leads || 0) - Number(a?.leads || 0) ||
        Number(b?.payins || 0) - Number(a?.payins || 0)
      );
    });
  }, [data]);

  const topThree = sortedRows.slice(0, 3);
  const listRows = sortedRows.slice(3);
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

  useEffect(() => {
    if (!selectedRow?.id) return;
    const match = sortedRows.find((row) => String(row?.id ?? "") === String(selectedRow.id));
    if (!match) {
      setSelectedRow(null);
      return;
    }
    setSelectedRow(match);
  }, [sortedRows, selectedRow?.id]);

  useEffect(() => {
    setHistoryPage(1);
  }, [selectedRow?.id, mode, leaderRole, dateFrom, dateTo]);

  useEffect(() => {
    const selectedId = selectedRow?.id;
    if (!selectedId) {
      setHistoryRows([]);
      setHistoryError("");
      setHistoryLoading(false);
      return;
    }

    const isCancelled = { current: false };
    const loadHistory = async () => {
      setHistoryLoading(true);
      setHistoryError("");
      try {
        const historyResult = await getRawDataHistory({
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          // Server-side leader filter is only safe for individual leader modes.
          agentId: mode === "leaders" && leaderRole !== "platoon" ? selectedId : undefined,
          includeVoided: true,
          limit: 2000,
        });

        if (isCancelled.current) return;

        const filtered = (historyResult ?? []).filter((row) =>
          rowMatchesSelection(row, { mode, leaderRole, selectedId })
        );

        const scoringConfig = data?.formula?.data?.config ?? null;
        const battleType = data?.formula?.battleType ?? "platoons";
        const withPoints = filtered.map((row) => {
          const scoped = getScopedMetrics(row, { mode, selectedId });
          return {
            ...row,
            leads: scoped.leads,
            payins: scoped.payins,
            sales: scoped.sales,
            points: computeTotalScore(battleType, scoped, scoringConfig),
          };
        });

        withPoints.sort((a, b) => {
          const aDate = new Date(`${a?.date_real ?? ""}T00:00:00`).getTime() || 0;
          const bDate = new Date(`${b?.date_real ?? ""}T00:00:00`).getTime() || 0;
          if (aDate !== bDate) return bDate - aDate;
          return String(b?.id ?? "").localeCompare(String(a?.id ?? ""));
        });

        setHistoryRows(withPoints);
      } catch (err) {
        if (isCancelled.current) return;
        setHistoryRows([]);
        setHistoryError(err?.message || "Failed to load selected participant history.");
      } finally {
        if (!isCancelled.current) setHistoryLoading(false);
      }
    };

    loadHistory();
    return () => {
      isCancelled.current = true;
    };
  }, [selectedRow?.id, mode, leaderRole, dateFrom, dateTo, data?.formula?.battleType, data?.formula?.data]);

  const historyPageCount = Math.max(1, Math.ceil(historyRows.length / HISTORY_ROWS_PER_PAGE));
  useEffect(() => {
    if (historyPage > historyPageCount) {
      setHistoryPage(historyPageCount);
    }
  }, [historyPage, historyPageCount]);

  const pagedHistoryRows = useMemo(() => {
    const start = (historyPage - 1) * HISTORY_ROWS_PER_PAGE;
    return historyRows.slice(start, start + HISTORY_ROWS_PER_PAGE);
  }, [historyRows, historyPage, HISTORY_ROWS_PER_PAGE]);

  const listPageCount = Math.max(1, Math.ceil(listRows.length / LIST_ROWS_PER_PAGE));
  useEffect(() => {
    if (listPage > listPageCount) {
      setListPage(listPageCount);
    }
  }, [listPage, listPageCount]);

  useEffect(() => {
    setListPage(1);
  }, [mode, leaderRole, dateFrom, dateTo]);

  const pagedListRows = useMemo(() => {
    const start = (listPage - 1) * LIST_ROWS_PER_PAGE;
    return listRows.slice(start, start + LIST_ROWS_PER_PAGE);
  }, [listRows, listPage, LIST_ROWS_PER_PAGE]);

  const leaderboardEntityLabel =
    mode === "leaders"
      ? "Leader"
      : mode === "depots"
      ? "Depot"
      : mode === "commanders"
      ? "Commander"
      : "Company";

  const listRangeTitle = listRows.length ? `Ranks 4 - ${sortedRows.length}` : "Ranks 4+";

  const selectedEntityLabel =
    mode === "leaders"
      ? "Leader"
      : mode === "depots"
      ? "Depot"
      : mode === "commanders"
      ? "Commander"
      : "Company";

  const exportLeaderboardXlsx = () => {
    if (!sortedRows.length) return;
    const exportRows = sortedRows.map((row) => ({
      Rank: Number(row?.rank ?? 0),
      [leaderboardEntityLabel]: row?.name || "Unknown",
      Leads: Number(row?.leads ?? 0),
      Payins: Number(row?.payins ?? 0),
      Sales: Number(row?.sales ?? 0),
      Points: Number(row?.points ?? 0),
    }));
    const scope = mode === "leaders" ? `${mode}-${leaderRole}` : mode;
    const dateFromPart = dateFrom || "any";
    const dateToPart = dateTo || "any";
    const filename = `dashboard-leaderboard-${scope}-${dateFromPart}-to-${dateToPart}-${new Date().toISOString().slice(0, 10)}.xlsx`;
    exportToXlsx({ rows: exportRows, filename, sheetName: "Leaderboard" });
  };

  const exportHistoryXlsx = () => {
    if (!selectedRow || !historyRows.length) return;
    const exportRows = historyRows.map((row) => ({
      Date: row.date_real || "",
      Leader: row.leaderName || "(Restricted)",
      "Leads Depot": row.leadsDepotName || "-",
      Leads: Number(row.leads ?? 0),
      "Sales Depot": row.salesDepotName || "-",
      Payins: Number(row.payins ?? 0),
      Sales: Number(row.sales ?? 0),
      Points: Number(row.points ?? 0),
      Status: row.voided ? "Voided" : "Active",
    }));
    const safeName = String(selectedRow?.name || "participant")
      .trim()
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase();
    const filename = `dashboard-history-${safeName || "participant"}-${new Date().toISOString().slice(0, 10)}.xlsx`;
    exportToXlsx({ rows: exportRows, filename, sheetName: "History" });
  };

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
            <div className="dashboard-panel__head">
              <div className="dashboard-panel__title">{listRangeTitle}</div>
              <ExportButton
                onClick={exportLeaderboardXlsx}
                loading={false}
                disabled={loading || !sortedRows.length}
                label="Export leaderboard"
              />
            </div>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>
                      {leaderboardEntityLabel}
                    </th>
                    <th>Leads</th>
                    <th>Payins</th>
                    <th>Sales</th>
                    <th>Points</th>
                  </tr>
                </thead>
                <tbody>
                  {listRows.length === 0 && !loading ? (
                    <tr>
                      <td colSpan={6} className="muted">
                        No ranks available below podium for the selected range.
                      </td>
                    </tr>
                  ) : (
                    pagedListRows.map((row, index) => (
                      <tr
                        key={`${row?.id || row?.name}-${index}`}
                        className={selectedRow?.id === row?.id ? "is-selected" : ""}
                        onClick={() => handleSelectRow(row)}
                      >
                        <td>#{row?.rank ?? index + 1}</td>
                        <td>{row?.name || "Unknown"}</td>
                        <td>{formatNumber(row?.leads)}</td>
                        <td>{formatNumber(row?.payins)}</td>
                        <td>{formatCurrency(row?.sales)}</td>
                        <td>{formatPoints(row?.points)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <AppPagination
              count={listPageCount}
              page={listPage}
              onChange={setListPage}
              totalItems={listRows.length}
              pageSize={LIST_ROWS_PER_PAGE}
            />
          </div>
        </div>

        {selectedRow && (
          <>
            <div className="card dashboard-panel dashboard-history">
              <div className="dashboard-history__summary">
                <div className="dashboard-history__identity">
                  <div className="dashboard-detail__title">
                    Selected {selectedEntityLabel}
                  </div>
                  <div className="dashboard-detail__name">{selectedRow?.name || "Unknown"}</div>
                </div>
                <div className="dashboard-history__range">
                  <span className="dashboard-detail__label">Date range</span>
                  <span className="dashboard-detail__value">
                    {dateFrom || "Any"} to {dateTo || "Any"}
                  </span>
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
                  <div>
                    <div className="dashboard-detail__label">Points</div>
                    <div className="dashboard-detail__value">{formatPoints(selectedRow?.points)}</div>
                  </div>
                </div>
              </div>

              <div className="dashboard-history__meta">
                <div className="dashboard-panel__title">Selected Participant History</div>
                <ExportButton
                  onClick={exportHistoryXlsx}
                  loading={false}
                  disabled={historyLoading || !historyRows.length}
                  label="Export selected history"
                />
              </div>

              {historyError ? <div className="dashboard-error">{historyError}</div> : null}

              <div className="table-scroll updates-table-wrap">
                <table className="updates-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Leader</th>
                      <th>Leads Depot</th>
                      <th className="num">Leads</th>
                      <th>Sales Depot</th>
                      <th className="num">Payins</th>
                      <th className="num">Sales</th>
                      <th className="num">Points</th>
                      <th className="center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedHistoryRows.map((row) => (
                      <tr key={row.id}>
                        <td>{row.date_real}</td>
                        <td>{row.leaderName || "(Restricted)"}</td>
                        <td>{row.leadsDepotName || "-"}</td>
                        <td className="num">{formatNumber(row.leads)}</td>
                        <td>{row.salesDepotName || "-"}</td>
                        <td className="num">{formatNumber(row.payins)}</td>
                        <td className="num">{formatCurrency(row.sales)}</td>
                        <td className="num">{formatPoints(row.points)}</td>
                        <td className="center">
                          <span className={`status-pill ${row.voided ? "invalid" : "muted"}`}>
                            {row.voided ? "Voided" : "Active"}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {historyLoading ? (
                      <tr>
                        <td colSpan={9} className="muted" style={{ textAlign: "center", padding: 16 }}>
                          Loading history...
                        </td>
                      </tr>
                    ) : null}
                    {!historyLoading && !historyRows.length ? (
                      <tr>
                        <td colSpan={9} className="muted" style={{ textAlign: "center", padding: 16 }}>
                          No history for the selected participant and date range.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>

              <AppPagination
                count={historyPageCount}
                page={historyPage}
                onChange={setHistoryPage}
                totalItems={historyRows.length}
                pageSize={HISTORY_ROWS_PER_PAGE}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

