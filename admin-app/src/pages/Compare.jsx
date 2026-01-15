import React, { useEffect, useMemo, useState } from "react";
import { listAgents } from "../services/agents.service";
import { listCompareRows } from "../services/compare.service";

function formatDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDefaultDateRange() {
  const today = new Date();
  const from = new Date();
  from.setDate(today.getDate() - 6);
  return {
    dateFrom: formatDateInput(from),
    dateTo: formatDateInput(today),
  };
}

const STATUS_LABELS = {
  matched: "Matched",
  mismatch: "Mismatch",
  missing_company: "Missing Company",
  missing_depot: "Missing Depot",
};

const STATUS_CLASS = {
  matched: "valid",
  mismatch: "duplicate",
  missing_company: "invalid",
  missing_depot: "invalid",
};

function formatDelta(delta) {
  if (!delta) return "—";
  const renderValue = value => {
    if (value > 0) return `+${value}`;
    if (value < 0) return `${value}`;
    return "0";
  };

  const flags = [
    delta.leadsDepotMismatch ? "LD!" : null,
    delta.salesDepotMismatch ? "SD!" : null,
  ].filter(Boolean);
  const flagText = flags.length ? ` ${flags.join(" ")}` : "";
  return `L:${renderValue(delta.leadsDiff)} P:${renderValue(delta.payinsDiff)} S:${renderValue(delta.salesDiff)}${flagText}`;
}

export default function Compare() {
  const defaultDates = useMemo(() => getDefaultDateRange(), []);
  const [filters, setFilters] = useState({
    dateFrom: defaultDates.dateFrom,
    dateTo: defaultDates.dateTo,
    agentId: "",
    status: "",
  });
  const [appliedFilters, setAppliedFilters] = useState({
    dateFrom: defaultDates.dateFrom,
    dateTo: defaultDates.dateTo,
    agentId: "",
    status: "",
  });
  const [rows, setRows] = useState([]);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [agentsLoading, setAgentsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    listAgents()
      .then(data => {
        if (!mounted) return;
        setAgents(data);
      })
      .catch(err => {
        if (!mounted) return;
        setError(err.message || "Failed to load agents");
      })
      .finally(() => {
        if (mounted) setAgentsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    listCompareRows(appliedFilters)
      .then(({ rows: dataRows }) => {
        if (!mounted) return;
        setRows(dataRows ?? []);
      })
      .catch(err => {
        if (!mounted) return;
        setError(err.message || "Failed to load comparison data");
        setRows([]);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [appliedFilters]);

  const counters = useMemo(() => {
    const total = rows.length;
    const matched = rows.filter(row => row.status === "matched").length;
    const mismatch = rows.filter(row => row.status === "mismatch").length;
    const missing = rows.filter(row => row.status === "missing_company" || row.status === "missing_depot").length;
    const publishable = rows.filter(row => row.publishable).length;
    return { total, matched, mismatch, missing, publishable };
  }, [rows]);

  function handleApplyFilters() {
    setError("");
    setLoading(true);
    setAppliedFilters({ ...filters });
  }

  function handleClearFilters() {
    setError("");
    setLoading(true);
    setFilters({ dateFrom: defaultDates.dateFrom, dateTo: defaultDates.dateTo, agentId: "", status: "" });
    setAppliedFilters({ dateFrom: defaultDates.dateFrom, dateTo: defaultDates.dateTo, agentId: "", status: "" });
  }

  return (
    <div className="card">
      <div className="card-title">Compare Data</div>
      <div className="muted" style={{ marginBottom: 12 }}>
        Company vs Depot entries per leader/day. Resolve mismatches by re-uploading the correct source.
      </div>

      <div className="filters-row" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
        <div>
          <label htmlFor="date-from" className="form-label">Date From</label>
          <input
            id="date-from"
            type="date"
            value={filters.dateFrom}
            onChange={e => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
          />
        </div>
        <div>
          <label htmlFor="date-to" className="form-label">Date To</label>
          <input
            id="date-to"
            type="date"
            value={filters.dateTo}
            onChange={e => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
          />
        </div>
        <div>
          <label htmlFor="leader-filter" className="form-label">Leader</label>
          <select
            id="leader-filter"
            value={filters.agentId}
            onChange={e => setFilters(prev => ({ ...prev, agentId: e.target.value }))}
            disabled={agentsLoading}
          >
            <option value="">All Leaders</option>
            {agents.map(agent => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="status-filter" className="form-label">Status</label>
          <select
            id="status-filter"
            value={filters.status}
            onChange={e => setFilters(prev => ({ ...prev, status: e.target.value }))}
          >
            <option value="">All</option>
            <option value="matched">Matched</option>
            <option value="mismatch">Mismatch</option>
            <option value="missing_company">Missing Company</option>
            <option value="missing_depot">Missing Depot</option>
          </select>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <button type="button" className="button primary" onClick={handleApplyFilters} disabled={loading}>
            Apply Filters
          </button>
          <button type="button" className="button secondary" onClick={handleClearFilters} disabled={loading}>
            Clear
          </button>
        </div>
      </div>

      <div className="summary-grid" style={{ marginTop: 12 }}>
        <div className="summary-pill">
          <div className="summary-label">Total</div>
          <div className="summary-value">{counters.total}</div>
        </div>
        <div className="summary-pill">
          <div className="summary-label">Matched</div>
          <div className="summary-value valid">{counters.matched}</div>
        </div>
        <div className="summary-pill">
          <div className="summary-label">Publishable</div>
          <div className="summary-value">{counters.publishable}</div>
        </div>
        <div className="summary-pill">
          <div className="summary-label">Mismatch</div>
          <div className="summary-value duplicate">{counters.mismatch}</div>
        </div>
        <div className="summary-pill">
          <div className="summary-label">Missing</div>
          <div className="summary-value invalid">{counters.missing}</div>
        </div>
      </div>

      {error ? (
        <div className="error-box" role="alert" style={{ marginTop: 12 }}>
          {error}
        </div>
      ) : null}

      {loading ? <div className="muted" style={{ marginTop: 12 }}>Loading comparisons…</div> : null}

      <div className="table-scroll" style={{ marginTop: 12 }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Leader</th>
              <th>Company Leads Depot</th>
              <th>Company Sales Depot</th>
              <th>Company Leads</th>
              <th>Company Payins</th>
              <th>Company Sales</th>
              <th>Depot Leads Depot</th>
              <th>Depot Sales Depot</th>
              <th>Depot Leads</th>
              <th>Depot Payins</th>
              <th>Depot Sales</th>
              <th>Status</th>
              <th>Publishable</th>
              <th>Approved</th>
              <th>Delta</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.key}>
                <td>{row.date_real}</td>
                <td>
                  <div>{row.leader_name}</div>
                  {row.restricted ? (
                    <div className="muted" style={{ fontSize: 12 }}>{row.restricted_agent_id}</div>
                  ) : null}
                </td>
                <td>{row.company ? row.company.leadsDepotName || "—" : "—"}</td>
                <td>{row.company ? row.company.salesDepotName || "—" : "—"}</td>
                <td>{row.company ? row.company.leads : "—"}</td>
                <td>{row.company ? row.company.payins : "—"}</td>
                <td>{row.company ? row.company.sales : "—"}</td>
                <td>{row.depot ? row.depot.leadsDepotName || "—" : "—"}</td>
                <td>{row.depot ? row.depot.salesDepotName || "—" : "—"}</td>
                <td>{row.depot ? row.depot.leads : "—"}</td>
                <td>{row.depot ? row.depot.payins : "—"}</td>
                <td>{row.depot ? row.depot.sales : "—"}</td>
                <td>
                  <span className={`status-pill ${STATUS_CLASS[row.status] || ""}`}>
                    {STATUS_LABELS[row.status] || row.status}
                  </span>
                </td>
                <td>
                  <span className={`status-pill ${row.publishable ? "valid" : "invalid"}`}>
                    {row.publishable ? "Yes" : "No"}
                  </span>
                </td>
                <td>
                  {row.approved ? (
                    <span className="status-pill duplicate">Approved</span>
                  ) : (
                    <span className="status-pill muted">No</span>
                  )}
                </td>
                <td>{formatDelta(row.delta)}</td>
              </tr>
            ))}
            {!rows.length && !loading ? (
              <tr>
                <td colSpan={16} className="muted" style={{ textAlign: "center" }}>
                  No rows found for the selected filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
