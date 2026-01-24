import React, { useEffect, useMemo, useState } from "react";
import { ModalForm } from "../components/ModalForm";
import { listAgents } from "../services/agents.service";
import { listDepots } from "../services/depots.service";
import { canEditRow, listRawData, updateRow } from "../services/rawData.service";
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

export default function Updates() {
  const [agents, setAgents] = useState([]);
  const [depots, setDepots] = useState([]);
  const [rows, setRows] = useState([]);

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
    leads_depot_id: "",
    sales_depot_id: "",
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
      const data = await listRawData({ limit: 500, includeVoided: false });
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
      leads_depot_id: row.leads_depot_id ?? "",
      sales_depot_id: row.sales_depot_id ?? "",
    });
    setError("");
    setStatus("");
  }

  function cancelEdit() {
    setEditingRow(null);
    setEditValues({ leads: "", payins: "", sales: "", leads_depot_id: "", sales_depot_id: "" });
  }

  function onEditChange(field, value) {
    setEditValues(prev => ({ ...prev, [field]: value }));
  }

  async function saveEdit(rowId) {
    const leadsNum = Number(editValues.leads);
    const payinsNum = Number(editValues.payins);
    const salesNum = Number(editValues.sales);
    const leadsDepotId = editValues.leads_depot_id;
    const salesDepotId = editValues.sales_depot_id;

    if ([leadsNum, payinsNum, salesNum].some(n => Number.isNaN(n))) {
      setError("Please enter valid numbers for leads, payins, and sales.");
      return;
    }
    if (!leadsDepotId || !salesDepotId) {
      setError("Leads depot and sales depot are required.");
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
        leads_depot_id: leadsDepotId,
        sales_depot_id: salesDepotId,
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

  const tableColumnCount = 8;

  return (
    <div className="card">
      <div className="card-title">Updates History</div>
      <div className="muted">Review and edit uploaded daily performance data.</div>

      {/* Filters */}
      <div
        style={{
          marginTop: 14,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
          gap: 12,
          alignItems: "end",
        }}
      >
        <div>
          <label className="input-label">Date From</label>
          <input
            type="date"
            className="input"
            value={filtersInput.dateFrom}
            onChange={e => setFiltersInput(p => ({ ...p, dateFrom: e.target.value }))}
          />
        </div>

        <div>
          <label className="input-label">Date To</label>
          <input
            type="date"
            className="input"
            value={filtersInput.dateTo}
            onChange={e => setFiltersInput(p => ({ ...p, dateTo: e.target.value }))}
          />
        </div>

        <div>
          <label className="input-label">Leader</label>
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
          <label className="input-label">Leads Depot</label>
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
          <label className="input-label">Sales Depot</label>
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

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
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
      <div className="table-scroll" style={{ marginTop: 14 }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Leader</th>
              <th>Leads Depot</th>
              <th>Leads</th>
              <th>Sales Depot</th>
              <th>Payins</th>
              <th>Sales</th>
              <th>Published</th>
              <th>Status</th>
            </tr>
          </thead>

          <tbody>
            {rows.map(row => (
              <tr key={row.id}>
                <td>{row.date_real}</td>
                <td>
                  <div>{row.leaderName || "(Restricted)"}</div>
                </td>
                <td>{row.leadsDepotName || "—"}</td>
                <td>{row.leads ?? "—"}</td>
                <td>{row.salesDepotName || "—"}</td>
                <td>{row.payins ?? "—"}</td>
                <td>{row.sales ?? "—"}</td>
                <td>
                  <span className={`status-pill ${row.published ? "valid" : "muted"}`}>
                    {row.published ? "Published" : "Unpublished"}
                  </span>
                </td>
                <td>
                  <span className={`status-pill ${row.voided ? "invalid" : "muted"}`}>
                    {row.voided ? "Voided" : "Active"}
                  </span>
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
          <label className="form-field">
            <span>Leads Depot</span>
            <select
              className="input"
              value={editValues.leads_depot_id}
              onChange={e => onEditChange("leads_depot_id", e.target.value)}
            >
              <option value="">Select depot</option>
              {depots.map(d => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span>Sales Depot</span>
            <select
              className="input"
              value={editValues.sales_depot_id}
              onChange={e => onEditChange("sales_depot_id", e.target.value)}
            >
              <option value="">Select depot</option>
              {depots.map(d => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </ModalForm>

    </div>
  );
}
