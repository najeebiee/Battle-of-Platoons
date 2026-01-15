import React, { useEffect, useMemo, useState } from "react";
import { listAgents } from "../services/agents.service";
import { listCompareRows } from "../services/compare.service";
import { approvePair, unapprovePair } from "../services/rawData.service";
import { getMyProfile } from "../services/profile.service";

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

const SCHEMA_MIGRATION_HINT = "Run SQL migration and reload schema.";

function formatDepotMismatchFlags(delta) {
  if (!delta) return "—";
  const flags = [
    delta.leadsDepotMismatch ? "LD!" : null,
    delta.salesDepotMismatch ? "SD!" : null,
  ].filter(Boolean);
  return flags.length ? flags.join(" ") : "—";
}

export default function Publishing() {
  const defaults = useMemo(() => getDefaultDateRange(), []);
  const [filters, setFilters] = useState({
    dateFrom: defaults.dateFrom,
    dateTo: defaults.dateTo,
    agentId: "",
    status: "",
  });
  const [appliedFilters, setAppliedFilters] = useState({
    dateFrom: defaults.dateFrom,
    dateTo: defaults.dateTo,
    agentId: "",
    status: "",
  });
  const [rows, setRows] = useState([]);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [agentsLoading, setAgentsLoading] = useState(true);
  const [error, setError] = useState("");

  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);

  const [actionDialog, setActionDialog] = useState({ mode: "", row: null, reason: "" });
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState("");

  const isSuperAdmin = profile?.role === "super_admin";

  function normalizeSchemaErrorMessage(err, fallback) {
    const msg = err?.message || fallback || "";
    const lowered = msg.toLowerCase();
    if (lowered.includes("schema cache") || lowered.includes("approve_reason")) {
      return SCHEMA_MIGRATION_HINT;
    }
    return msg || fallback || "Unexpected error";
  }

  useEffect(() => {
    let mounted = true;
    listAgents()
      .then(data => {
        if (!mounted) return;
        setAgents(data ?? []);
      })
      .catch(err => {
        if (!mounted) return;
        setError(normalizeSchemaErrorMessage(err, "Failed to load agents"));
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
    getMyProfile()
      .then(data => {
        if (!mounted) return;
        setProfile(data);
      })
      .catch(err => {
        if (!mounted) return;
        setError(normalizeSchemaErrorMessage(err, "Failed to load profile"));
      })
      .finally(() => {
        if (mounted) setProfileLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError("");
    listCompareRows(appliedFilters)
      .then(({ rows: dataRows }) => {
        if (!mounted) return;
        setRows(dataRows ?? []);
      })
      .catch(err => {
        if (!mounted) return;
        setError(normalizeSchemaErrorMessage(err, "Failed to load comparison data"));
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
    const publishable = rows.filter(row => row.publishable).length;
    const approved = rows.filter(row => row.approved).length;
    const matched = rows.filter(row => row.status === "matched").length;
    return { total, publishable, approved, matched };
  }, [rows]);

  function handleApplyFilters() {
    setError("");
    setLoading(true);
    setAppliedFilters({ ...filters });
  }

  function handleClearFilters() {
    setFilters({ dateFrom: defaults.dateFrom, dateTo: defaults.dateTo, agentId: "", status: "" });
    setAppliedFilters({ dateFrom: defaults.dateFrom, dateTo: defaults.dateTo, agentId: "", status: "" });
  }

  function openAction(mode, row) {
    if (mode === "approve" && !row?.company) return;
    setActionDialog({ mode, row, reason: "" });
    setActionError("");
  }

  function closeAction() {
    setActionDialog({ mode: "", row: null, reason: "" });
    setActionLoading(false);
    setActionError("");
  }

  const actionReasonValid = actionDialog.reason.trim().length >= 5;

  async function submitAction() {
    if (!actionDialog.row || !actionDialog.mode) return;
    if (!actionReasonValid) return;

    setActionLoading(true);
    setActionError("");

    const payload = {
      date_real: actionDialog.row.date_real,
      agent_id: actionDialog.row.agent_id,
      reason: actionDialog.reason.trim(),
    };

    try {
      if (actionDialog.mode === "approve") {
        await approvePair(payload);
      } else {
        await unapprovePair(payload);
      }
      closeAction();
      setAppliedFilters(prev => ({ ...prev }));
    } catch (e) {
      console.error(e);
      setActionError(normalizeSchemaErrorMessage(e, "Failed to update approval"));
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div className="card">
      <div className="card-title">Publishing</div>
      <div className="muted" style={{ marginBottom: 12 }}>
        Only matched pairs or company rows approved by a Super Admin will be shown on the public leaderboard. Missing Company rows cannot be published.
      </div>

      {!profileLoading && !isSuperAdmin ? (
        <div className="error-box" role="alert">
          Only Super Admins can approve or unapprove rows. You can still view the current publish state.
        </div>
      ) : null}

      <div
        className="filters-row"
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}
      >
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
          <div className="summary-label">Publishable</div>
          <div className="summary-value valid">{counters.publishable}</div>
        </div>
        <div className="summary-pill">
          <div className="summary-label">Approved</div>
          <div className="summary-value">{counters.approved}</div>
        </div>
        <div className="summary-pill">
          <div className="summary-label">Matched</div>
          <div className="summary-value">{counters.matched}</div>
        </div>
      </div>

      {error ? (
        <div className="error-box" role="alert" style={{ marginTop: 12 }}>
          {error}
        </div>
      ) : null}

      {loading ? <div className="muted" style={{ marginTop: 12 }}>Loading publishing data…</div> : null}

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
              <th>Depot Mismatch</th>
              <th>Status</th>
              <th>Publishable</th>
              <th>Approved</th>
              <th>Actions</th>
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
                <td>{formatDepotMismatchFlags(row.delta)}</td>
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
                    <span className="status-pill muted">Not Approved</span>
                  )}
                </td>
                <td>
                  {isSuperAdmin ? (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {!row.approved ? (
                        <button
                          type="button"
                          className="button primary"
                          onClick={() => openAction("approve", row)}
                          disabled={!row.company}
                          title={row.company ? "" : "Cannot approve because Company row is missing. Company must upload or create a mirrored Company entry (future feature)."}
                        >
                          Approve
                        </button>
                      ) : null}
                      {row.approved ? (
                        <button type="button" className="button secondary" onClick={() => openAction("unapprove", row)}>
                          Unapprove
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    <span className="muted" style={{ fontSize: 12 }}>View only</span>
                  )}
                </td>
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

      {actionDialog.mode && actionDialog.row ? (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>
                {actionDialog.mode === "approve" ? "Approve pair" : "Unapprove pair"}
              </div>
              <button type="button" className="button secondary" onClick={closeAction} disabled={actionLoading}>
                Close
              </button>
            </div>

            <div className="muted" style={{ marginTop: 6 }}>
              {actionDialog.mode === "approve"
                ? "Mark the company row for this leader/day as approved. Depot rows are unaffected."
                : "Remove approval on the company row so the pair will only publish if matched."}
            </div>

            <div style={{ marginTop: 12 }}>
              <textarea
                className="input"
                rows={3}
                placeholder="Approval reason (required)"
                value={actionDialog.reason}
                onChange={e => setActionDialog(prev => ({ ...prev, reason: e.target.value }))}
              />
              <div className="muted" style={{ fontSize: 12 }}>
                Minimum 5 characters.
              </div>
            </div>

            {actionError ? (
              <div className="error-box" role="alert" style={{ marginTop: 10 }}>
                {actionError}
              </div>
            ) : null}

            <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
              <button
                type="button"
                className="button primary"
                onClick={submitAction}
                disabled={!actionReasonValid || actionLoading}
              >
                {actionLoading ? "Working…" : actionDialog.mode === "approve" ? "Approve" : "Unapprove"}
              </button>
              <button type="button" className="button secondary" onClick={closeAction} disabled={actionLoading}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
