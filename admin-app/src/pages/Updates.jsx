import React, { useEffect, useMemo, useState } from "react";
import "../styles/pages/updates.css";
import { ModalForm } from "../components/ModalForm";
import AppPagination from "../components/AppPagination";
import ExportButton from "../components/ExportButton";
import { exportToXlsx } from "../services/export.service";
import { listAgents } from "../services/agents.service";
import { listDepots } from "../services/depots.service";
import { canEditRow, getRawDataHistory, updateRow } from "../services/rawData.service";
import { getMyProfile } from "../services/profile.service";

// ----------------------
// Formatting helpers
// ----------------------
function formatNumber(value) {
  if (value === null || value === undefined || value === "") return "N/A";
  const num = Number(value);
  if (Number.isNaN(num)) return "N/A";
  return num.toLocaleString();
}

function formatCurrency(value) {
  if (value === null || value === undefined || value === "") return "N/A";
  const num = Number(value);
  if (Number.isNaN(num)) return "N/A";
  return num.toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

// ----------------------
// Date parsing (timezone-safe)
// Supports: YYYY-MM-DD, MM/DD/YYYY, M/D/YYYY
// Returns: YYYY-MM-DD or ""
// ----------------------
function normalizeToYmd(input) {
  if (!input) return "";
  const s = String(input).trim();

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // MM/DD/YYYY or M/D/YYYY
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const mm = String(m[1]).padStart(2, "0");
    const dd = String(m[2]).padStart(2, "0");
    const yyyy = String(m[3]);
    return `${yyyy}-${mm}-${dd}`;
  }

  return "";
}

function toTsYmd(ymd) {
  const norm = normalizeToYmd(ymd);
  if (!norm) return null;
  const ts = new Date(`${norm}T00:00:00`).getTime();
  return Number.isNaN(ts) ? null : ts;
}

const initialFilters = {
  dateFrom: "",
  dateTo: "",
  leaderId: "",
  leadsDepotId: "",
  salesDepotId: "",
};

const ADMIN_ROLES = new Set(["admin", "super_admin"]);

function EditIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M16.862 3.487a1.5 1.5 0 0 1 2.12 0l1.531 1.531a1.5 1.5 0 0 1 0 2.12l-9.94 9.94a1 1 0 0 1-.474.26l-4.12.94a.75.75 0 0 1-.9-.9l.94-4.12a1 1 0 0 1 .26-.474l9.94-9.94Zm1.06 2.12L8.47 15.06l-.51 2.24 2.24-.51 9.45-9.45-1.73-1.73ZM4 20.25c0-.414.336-.75.75-.75h14.5a.75.75 0 0 1 0 1.5H4.75a.75.75 0 0 1-.75-.75Z"
      />
    </svg>
  );
}

export default function Updates() {
  const [agents, setAgents] = useState([]);
  const [depots, setDepots] = useState([]);
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const rowsPerPage = 10;

  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState("");
  const [actionLoadingId, setActionLoadingId] = useState("");

  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  // Two-state filtering: input vs applied
  const [filtersInput, setFiltersInput] = useState(initialFilters);
  const [filtersApplied, setFiltersApplied] = useState(initialFilters);

  // Editing
  const [editingRow, setEditingRow] = useState(null);
  const [editValues, setEditValues] = useState({
    leads: "",
    payins: "",
    sales: "",
  });

  // Auth / session
  const [profile, setProfile] = useState(null);
  const currentRole = profile?.role || "";

  const agentMap = useMemo(() => {
    const map = {};
    for (const a of agents) map[a.id] = a;
    return map;
  }, [agents]);
  const depotMap = useMemo(() => {
    const map = {};
    for (const depot of depots) map[depot.id] = depot;
    return map;
  }, [depots]);

  // Load agents once
  useEffect(() => {
    (async () => {
      try {
        const data = await listAgents();
        setAgents(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const data = await listDepots();
        setDepots(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  useEffect(() => {
    let mounted = true;
    getMyProfile()
      .then(data => {
        if (!mounted) return;
        setProfile(data);
      })
      .catch(e => {
        if (!mounted) return;
        setError(e?.message || "Failed to load profile");
      })
    return () => {
      mounted = false;
    };
  }, []);

  // Initial fetch (no filters)
  useEffect(() => {
    void applyFilters(initialFilters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ----------------------
  // Apply/Clear filters
  // ----------------------
  async function applyFilters(customFilters = filtersInput) {
    const normalized = { ...initialFilters, ...(customFilters || {}) };
    normalized.dateFrom = normalizeToYmd(normalized.dateFrom);
    normalized.dateTo = normalizeToYmd(normalized.dateTo);

    setFiltersApplied(normalized);
    setLoading(true);
    setError("");
    setStatus("");

    try {
      // IMPORTANT: fetch without relying on server-side string date filtering
      // We will always filter client-side correctly.
      const data = await getRawDataHistory({
        dateFrom: normalized.dateFrom,
        dateTo: normalized.dateTo,
        agentId: normalized.leaderId,
        leadsDepotId: normalized.leadsDepotId,
        salesDepotId: normalized.salesDepotId,
        limit: 500,
        includeVoided: false,
      });
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setError(e?.message || "Failed to load updates");
    } finally {
      setLoading(false);
    }
  }

  async function clearFilters() {
    setFiltersInput(initialFilters);
    setFiltersApplied(initialFilters);
    cancelEdit();
    await applyFilters(initialFilters);
  }

  // ----------------------
  // Filtered rows shown in table
  // ----------------------
  const visibleRows = useMemo(() => {
    const fromTs = toTsYmd(filtersApplied.dateFrom);
    const toTs = toTsYmd(filtersApplied.dateTo);
    const selectedLeaderId = filtersApplied.leaderId;
    const filteredLeadsDepotId = filtersApplied.leadsDepotId;
    const filteredSalesDepotId = filtersApplied.salesDepotId;

    const filtered = rows.filter(r => {
      const rowTs = toTsYmd(r.date_real); // row date_real should be YYYY-MM-DD
      if ((fromTs !== null || toTs !== null) && rowTs === null) return false;
      if (fromTs !== null && rowTs < fromTs) return false;
      if (toTs !== null && rowTs > toTs) return false;
      if (filteredLeadsDepotId && String(r.leads_depot_id || "") !== String(filteredLeadsDepotId)) return false;
      if (filteredSalesDepotId && String(r.sales_depot_id || "") !== String(filteredSalesDepotId)) return false;

      if (selectedLeaderId && String(r.agent_id || "") !== String(selectedLeaderId)) return false;

      return true;
    });

    // Default sort: date desc
    filtered.sort((a, b) => {
      const ad = toTsYmd(a.date_real) ?? 0;
      const bd = toTsYmd(b.date_real) ?? 0;
      if (ad === bd) return String(b.id || "").localeCompare(String(a.id || ""));
      return bd - ad;
    });

    return filtered;
  }, [filtersApplied, rows]);

  useEffect(() => {
    setPage(1);
  }, [visibleRows.length]);

  const pageCount = Math.max(1, Math.ceil(visibleRows.length / rowsPerPage));

  useEffect(() => {
    if (page > pageCount) {
      setPage(pageCount);
    }
  }, [page, pageCount]);

  const pagedRows = useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    return visibleRows.slice(start, start + rowsPerPage);
  }, [page, rowsPerPage, visibleRows]);

  function exportXlsx() {
    const exportRows = visibleRows.map(row => ({
      Date: row.date_real,
      Leader: row.leaderName || "(Restricted)",
      "Leads Depot": row.leadsDepotName || "-",
      Leads: row.leads ?? "-",
      "Sales Depot": row.salesDepotName || "-",
      Payins: row.payins ?? "-",
      Sales: row.sales ?? "-",
      Published: row.published ? "Published" : "Unpublished",
      Status: row.voided ? "Voided" : "Active",
    }));
    const filename = `updates-history-${new Date().toISOString().slice(0, 10)}.xlsx`;
    exportToXlsx({ rows: exportRows, filename, sheetName: "Updates" });
  }

  // ----------------------
  // Editing
  // ----------------------
  function startEdit(row) {
    if (row.voided) return;
    const agent = agentMap[row.agent_id];
    if (!canEditRow(row, profile, agent) || !ADMIN_ROLES.has(currentRole)) {
      setError("You do not have permission to edit this row.");
      return;
    }
    setEditingRow(row);
    setEditValues({
      leads: row.leads ?? "",
      payins: row.payins ?? "",
      sales: row.sales ?? "",
    });
    setError("");
    setStatus("");
  }

  function cancelEdit() {
    setEditingRow(null);
    setEditValues({ leads: "", payins: "", sales: "" });
  }

  function onEditChange(field, value) {
    setEditValues(prev => ({ ...prev, [field]: value }));
  }

  async function saveEdit(rowId) {
    const leadsNum = Number(editValues.leads);
    const payinsNum = Number(editValues.payins);
    const salesNum = Number(editValues.sales);

    if ([leadsNum, payinsNum, salesNum].some(n => Number.isNaN(n))) {
      setError("Please enter valid numbers for leads, payins, and sales.");
      return;
    }

    const targetRow = rows.find(r => r.id === rowId);
    const agent = agentMap[targetRow?.agent_id];
    if (!targetRow || !canEditRow(targetRow, profile, agent) || !ADMIN_ROLES.has(currentRole)) {
      setError("You do not have permission to edit this row.");
      return;
    }

    setSavingId(rowId);
    setError("");
    setStatus("");

    try {
      const updated = await updateRow(rowId, {
        leads: leadsNum,
        payins: payinsNum,
        sales: salesNum,
      });

      setRows(prev => prev.map(r => (r.id === rowId ? updated : r)));
      setStatus("Row updated.");
      cancelEdit();
    } catch (e) {
      console.error(e);
      setError(e?.message || "Failed to update row");
    } finally {
      setSavingId("");
    }
  }

  // Render helpers for tab identity column
  // ----------------------
  function renderIdentityCell(row) {
    const a = agentMap[row.agent_id];

    return (
      <div>
        <div>{row.leaderName || a?.name || "N/A"}</div>
        <div className="muted" style={{ fontSize: 12 }}>
          {row.agent_id}
        </div>
      </div>
    );
  }

  function renderStatus(row) {
    if (row.voided) {
      return (
        <span
          style={{
            display: "inline-block",
            padding: "2px 8px",
            background: "#ffe8e8",
            color: "#b00020",
            borderRadius: 12,
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          Voided
        </span>
      );
    }

    return (
      <span
        style={{
          display: "inline-block",
          padding: "2px 8px",
          background: "#e6f5e6",
          color: "#1b6b1b",
          borderRadius: 12,
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        Active
      </span>
    );
  }

  const tableColumnCount = 10;

  return (
    <div className="card updates-page">
      <div className="card-title">Updates History</div>
      <div className="muted">Review and edit uploaded daily performance data.</div>

      {/* Filters */}
      <div className="updates-filters">
        <div className="updates-filter-row">
          <div>
            <label className="form-label">Date From</label>
            <input
              type="date"
              className="input"
              value={filtersInput.dateFrom}
              onChange={e => setFiltersInput(p => ({ ...p, dateFrom: e.target.value }))}
            />
          </div>

          <div>
            <label className="form-label">Date To</label>
            <input
              type="date"
              className="input"
              value={filtersInput.dateTo}
              onChange={e => setFiltersInput(p => ({ ...p, dateTo: e.target.value }))}
            />
          </div>
        </div>

        <div className="updates-filter-row">
          <div>
            <label className="form-label">Leader</label>
            <select
              className="input"
              value={filtersInput.leaderId}
              onChange={e => setFiltersInput(p => ({ ...p, leaderId: e.target.value }))}
            >
              <option value="">All leaders</option>
              {agents.map(agent => (
                <option key={agent.id} value={agent.id}>
                  {agent.name} ({agent.id})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label">Leads Depot</label>
            <select
              className="input"
              value={filtersInput.leadsDepotId}
              onChange={e => setFiltersInput(p => ({ ...p, leadsDepotId: e.target.value }))}
            >
              <option value="">All depots</option>
              {depots.map(d => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label">Sales Depot</label>
            <select
              className="input"
              value={filtersInput.salesDepotId}
              onChange={e => setFiltersInput(p => ({ ...p, salesDepotId: e.target.value }))}
            >
              <option value="">All depots</option>
              {depots.map(d => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div className="updates-filter-actions">
            {/* IMPORTANT: do NOT pass applyFilters directly (it would receive click event) */}
            <button
              type="button"
              className="button primary"
              onClick={() => applyFilters(filtersInput)}
              disabled={loading}
            >
              Apply Filters
            </button>

            <button type="button" className="button secondary" onClick={clearFilters} disabled={loading}>
              Clear
            </button>
            <ExportButton
              onClick={exportXlsx}
              loading={false}
              disabled={loading || !visibleRows.length}
              label="Export XLSX"
            />
          </div>
        </div>
      </div>

      {/* Status/Error */}
      {(error || status) && (
        <div style={{ marginTop: 12 }}>
          {error ? (
            <div className="error-box" role="alert">
              {error}
            </div>
          ) : null}
          {status ? <div className="hint">{status}</div> : null}
        </div>
      )}

      {loading ? (
        <div className="muted" style={{ marginTop: 12 }}>
          Loading...
        </div>
      ) : null}

      {/* Table */}
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
              <th className="center">Published</th>
              <th className="center">Status</th>
              <th className="center">Actions</th>
            </tr>
          </thead>

          <tbody>
            {pagedRows.map(row => (
              <tr key={row.id}>
                <td>{row.date_real}</td>
                <td>
                  <div>{row.leaderName || "(Restricted)"}</div>
                </td>
                <td>{row.leadsDepotName || "—"}</td>
                <td className="num">{row.leads ?? "—"}</td>
                <td>{row.salesDepotName || "—"}</td>
                <td className="num">{row.payins ?? "—"}</td>
                <td className="num">{row.sales ?? "—"}</td>
                <td className="center">
                  <span className={`status-pill ${row.published ? "valid" : "muted"}`}>
                    {row.published ? "Published" : "Unpublished"}
                  </span>
                </td>
                <td className="center">
                  <span className={`status-pill ${row.voided ? "invalid" : "muted"}`}>
                    {row.voided ? "Voided" : "Active"}
                  </span>
                </td>
                <td className="center">
                  {canEditRow(row, profile, agentMap[row.agent_id]) && ADMIN_ROLES.has(currentRole) ? (
                    <button
                      type="button"
                      className="btn-link icon-btn"
                      onClick={() => startEdit(row)}
                      aria-label={`Edit ${row.leaderName || "row"}`}
                    >
                      <EditIcon />
                    </button>
                  ) : (
                    <span className="muted">-</span>
                  )}
                </td>
              </tr>
            ))}

            {!visibleRows.length && !loading ? (
              <tr>
                <td colSpan={tableColumnCount} className="muted" style={{ textAlign: "center", padding: 16 }}>
                  No data to display.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <AppPagination
        count={pageCount}
        page={page}
        onChange={setPage}
        totalItems={visibleRows.length}
        pageSize={rowsPerPage}
      />

      <ModalForm
        isOpen={Boolean(editingRow)}
        title="Edit Row"
        onClose={cancelEdit}
        onOverlayClose={cancelEdit}
        onSubmit={() => editingRow && saveEdit(editingRow.id)}
        footer={(
          <>
            <button type="button" className="button secondary" onClick={cancelEdit} disabled={savingId === editingRow?.id}>
              Cancel
            </button>
            <button type="submit" className="button primary" disabled={savingId === editingRow?.id}>
              {savingId === editingRow?.id ? "Saving..." : "Save"}
            </button>
          </>
        )}
      >
        <div className="form-grid">
          <div className="hint" style={{ gridColumn: "1 / -1" }}>
            Date and depots are locked because they are part of the row ID. Changing them would create a new row.
          </div>
          <label className="form-field">
            <span>Leads</span>
            <input
              type="number"
              className="input"
              value={editValues.leads}
              onChange={e => onEditChange("leads", e.target.value)}
            />
          </label>
          <label className="form-field">
            <span>Payins</span>
            <input
              type="number"
              className="input"
              value={editValues.payins}
              onChange={e => onEditChange("payins", e.target.value)}
            />
          </label>
          <label className="form-field">
            <span>Sales</span>
            <input
              type="number"
              className="input"
              value={editValues.sales}
              onChange={e => onEditChange("sales", e.target.value)}
            />
          </label>
        </div>
      </ModalForm>

    </div>
  );
}
