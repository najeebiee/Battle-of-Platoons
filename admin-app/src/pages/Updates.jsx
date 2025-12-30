import React, { useEffect, useMemo, useState } from "react";
import { listAgents } from "../services/agents.service";
import {
  canEditRow,
  listRawData,
  unvoidRawDataWithAudit,
  updateRawDataWithAudit,
  voidRawDataWithAudit,
} from "../services/rawData.service";
import { getMyProfile } from "../services/profile.service";
import { supabase } from "../services/supabase";

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

// ----------------------
// Tabs config
// ----------------------
const TABS = [
  { key: "leaders", label: "Leaders" },
  { key: "depots", label: "Depots" },
  { key: "companies", label: "Commanders" },
  { key: "platoons", label: "Teams" },
];

const initialFilters = {
  dateFrom: "",
  dateTo: "",
  leaders: "",
  depots: "",
  companies: "",
  platoons: "",
};

function canVoidRow(row, profile, agent) {
  return canEditRow(row, profile, agent);
}

function allowedSourceLabel(role) {
  if (role === "company_admin") return "company";
  if (role === "depot_admin") return "depot";
  return "both";
}

const PERMISSION_TOOLTIP = role => {
  const label = allowedSourceLabel(role);
  if (label === "both") return "You can edit and void both sources.";
  return `You can only edit ${label} rows.`;
};

export default function Updates() {
  const [activeTab, setActiveTab] = useState("leaders");

  const [agents, setAgents] = useState([]);
  const [rows, setRows] = useState([]);

  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  // Two-state filtering: input vs applied
  const [filtersInput, setFiltersInput] = useState(initialFilters);
  const [filtersApplied, setFiltersApplied] = useState(initialFilters);
  const [showVoided, setShowVoided] = useState(false);

  // Editing (Leaders only)
  const [editingId, setEditingId] = useState("");
  const [editValues, setEditValues] = useState({ leads: "", payins: "", sales: "" });
  const [editReason, setEditReason] = useState("");

  // Auth / session
  const [sessionUser, setSessionUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const currentRole = profile?.role || "";

  // Void/unvoid confirmation modal
  const [confirmAction, setConfirmAction] = useState({ type: "", row: null, reason: "" });

  const agentMap = useMemo(() => {
    const map = {};
    for (const a of agents) map[a.id] = a;
    return map;
  }, [agents]);

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

  // Fetch session user once
  useEffect(() => {
    (async () => {
      try {
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        setSessionUser(data?.session?.user ?? null);
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  useEffect(() => {
    let mounted = true;
    setProfileLoading(true);
    getMyProfile()
      .then(data => {
        if (!mounted) return;
        setProfile(data);
      })
      .catch(e => {
        if (!mounted) return;
        setError(e?.message || "Failed to load profile");
      })
      .finally(() => {
        if (mounted) setProfileLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  // Initial fetch (no filters)
  useEffect(() => {
    void applyFilters(initialFilters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If user changes tab while editing, cancel edit
  useEffect(() => {
    if (activeTab !== "leaders" && editingId) cancelEdit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // ----------------------
  // Apply/Clear filters
  // ----------------------
  async function applyFilters(customFilters = filtersInput, includeVoidedOverride) {
    const normalized = { ...initialFilters, ...(customFilters || {}) };
    normalized.dateFrom = normalizeToYmd(normalized.dateFrom);
    normalized.dateTo = normalizeToYmd(normalized.dateTo);

    const includeVoided = includeVoidedOverride ?? showVoided;

    setFiltersApplied(normalized);
    setLoading(true);
    setError("");
    setStatus("");

    try {
      // IMPORTANT: fetch without relying on server-side string date filtering
      // We will always filter client-side correctly.
      const data = await listRawData({ limit: 500, includeVoided });
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

  function toggleShowVoided() {
    const next = !showVoided;
    setShowVoided(next);
    void applyFilters(filtersInput, next);
  }

  // ----------------------
  // Options for dropdown (per tab)
  // ----------------------
  const filterOptions = useMemo(() => {
    const map = new Map();

    for (const r of rows) {
      const a = agentMap[r.agent_id];
      let value = "";
      let label = "";

      if (activeTab === "leaders") {
        value = r.agent_id || "";
        label = a?.name ? `${a.name} (${r.agent_id})` : r.agent_id || "Unknown leader";
      } else if (activeTab === "depots") {
        value = a?.depotId || "";
        label = r.depotName || a?.depot?.name || a?.depotId || "Unknown depot";
      } else if (activeTab === "companies") {
        value = a?.companyId || "";
        label = r.companyName || a?.company?.name || a?.companyId || "Unknown commander";
      } else if (activeTab === "platoons") {
        value = a?.platoonId || "";
        label = r.platoonName || a?.platoon?.name || a?.platoonId || "Unknown team";
      }

      if (!value) continue;
      if (!map.has(value)) map.set(value, label);
    }

    return Array.from(map.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((x, y) => x.label.localeCompare(y.label));
  }, [activeTab, agentMap, rows]);

  // ----------------------
  // Filtered rows shown in table
  // ----------------------
  const visibleRows = useMemo(() => {
    const fromTs = toTsYmd(filtersApplied.dateFrom);
    const toTs = toTsYmd(filtersApplied.dateTo);
    const selected = filtersApplied[activeTab];

    const filtered = rows.filter(r => {
      const rowTs = toTsYmd(r.date_real); // row date_real should be YYYY-MM-DD
      if ((fromTs !== null || toTs !== null) && rowTs === null) return false;
      if (fromTs !== null && rowTs < fromTs) return false;
      if (toTs !== null && rowTs > toTs) return false;

      if (!selected) return true;

      const a = agentMap[r.agent_id];
      if (activeTab === "leaders") return (r.agent_id || "") === selected;
      if (activeTab === "depots") return (a?.depotId || "") === selected;
      if (activeTab === "companies") return (a?.companyId || "") === selected;
      if (activeTab === "platoons") return (a?.platoonId || "") === selected;

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
  }, [activeTab, agentMap, filtersApplied, rows]);

  // ----------------------
  // Editing (Leaders only)
  // ----------------------
  function startEdit(row) {
    if (activeTab !== "leaders" || row.voided) return;
    const currentRole = profile?.role;
    const agent = agentMap[row.agent_id];
    if (!canEditRow(row, profile, agent)) {
      setError(PERMISSION_TOOLTIP(currentRole));
      return;
    }
    setEditingId(row.id);
    setEditValues({
      leads: row.leads ?? "",
      payins: row.payins ?? "",
      sales: row.sales ?? "",
    });
    setEditReason("");
    setError("");
    setStatus("");
  }

  function cancelEdit() {
    setEditingId("");
    setEditValues({ leads: "", payins: "", sales: "" });
    setEditReason("");
  }

  function onEditChange(field, value) {
    setEditValues(prev => ({ ...prev, [field]: value }));
  }

  async function saveEdit(rowId) {
    const leadsNum = Number(editValues.leads);
    const payinsNum = Number(editValues.payins);
    const salesNum = Number(editValues.sales);
    const reason = editReason.trim();

    if ([leadsNum, payinsNum, salesNum].some(n => Number.isNaN(n))) {
      setError("Please enter valid numbers for leads, payins, and sales.");
      return;
    }
    if (reason.length < 5) {
      setError("Reason must be at least 5 characters.");
      return;
    }
    if (!sessionUser) {
      setError("User session not found. Please sign in again.");
      return;
    }

    const targetRow = rows.find(r => r.id === rowId);
    const agent = agentMap[targetRow?.agent_id];
    if (!targetRow || !canEditRow(targetRow, profile, agent)) {
      setError(PERMISSION_TOOLTIP(currentRole));
      return;
    }

    setSavingId(rowId);
    setError("");
    setStatus("");

    try {
      const updated = await updateRawDataWithAudit(
        rowId,
        {
          leads: leadsNum,
          payins: payinsNum,
          sales: salesNum,
        },
        reason,
        sessionUser
      );

      setRows(prev => prev.map(r => (r.id === rowId ? updated : r)));
      setStatus("Row updated and logged.");
      cancelEdit();
    } catch (e) {
      console.error(e);
      setError(e?.message || "Failed to update row");
    } finally {
      setSavingId("");
    }
  }

  // ----------------------
  // Void / Unvoid
  // ----------------------
  function openConfirm(type, row) {
    const agent = agentMap[row.agent_id];
    if (!canVoidRow(row, profile, agent)) {
      setError(PERMISSION_TOOLTIP(currentRole));
      return;
    }
    setConfirmAction({ type, row, reason: "" });
    setError("");
    setStatus("");
  }

  function closeConfirm() {
    setConfirmAction({ type: "", row: null, reason: "" });
  }

  const confirmReasonValid = confirmAction.reason.trim().length >= 5;

  async function submitConfirmAction() {
    if (!confirmAction.type || !confirmAction.row) return;
    if (!confirmReasonValid) return;
    if (!sessionUser) {
      setError("User session not found. Please sign in again.");
      return;
    }

    const reason = confirmAction.reason.trim();
    const rowId = confirmAction.row.id;
    const targetRow = rows.find(r => r.id === rowId) || confirmAction.row;
    const agent = agentMap[targetRow?.agent_id];
    if (!canVoidRow(targetRow, profile, agent)) {
      setError(PERMISSION_TOOLTIP(currentRole));
      return;
    }

    setActionLoading(true);
    setError("");
    setStatus("");

    try {
      if (confirmAction.type === "void") {
        const updated = await voidRawDataWithAudit(rowId, reason, sessionUser);
        if (editingId === rowId) cancelEdit();
        setRows(prev => {
          if (!showVoided) return prev.filter(r => r.id !== rowId);
          return prev.map(r => (r.id === rowId ? updated : r));
        });
        setStatus("Row voided and logged.");
      } else if (confirmAction.type === "unvoid") {
        const updated = await unvoidRawDataWithAudit(rowId, reason, sessionUser);
        setRows(prev => prev.map(r => (r.id === rowId ? updated : r)));
        setStatus("Row unvoided and logged.");
      }
      closeConfirm();
    } catch (e) {
      console.error(e);
      setError(e?.message || "Action failed");
    } finally {
      setActionLoading(false);
    }
  }

  // ----------------------
  // Render helpers for tab identity column
  // ----------------------
  function renderIdentityCell(row) {
    const a = agentMap[row.agent_id];

    if (activeTab === "leaders") {
      return (
        <div>
          <div>{row.leaderName || a?.name || "N/A"}</div>
          <div className="muted" style={{ fontSize: 12 }}>
            {row.agent_id}
          </div>
        </div>
      );
    }

    if (activeTab === "depots") return row.depotName || a?.depot?.name || a?.depotId || "N/A";
    if (activeTab === "companies") return row.companyName || a?.company?.name || a?.companyId || "N/A";
    if (activeTab === "platoons") return row.platoonName || a?.platoon?.name || a?.platoonId || "N/A";

    return "N/A";
  }

  const identityHeader =
    activeTab === "leaders"
      ? "Leader"
      : activeTab === "depots"
      ? "Depot"
      : activeTab === "companies"
      ? "Commander"
      : "Team";

  function renderSourcePill(row) {
    const isCompany = row.source === "company";
    const background = isCompany ? "#e6f1ff" : "#fff4e6";
    const color = isCompany ? "#0b4a91" : "#a05a00";
    const label = isCompany ? "Company" : "Depot";
    return (
      <span
        style={{
          display: "inline-block",
          padding: "2px 8px",
          borderRadius: 10,
          fontSize: 12,
          fontWeight: 600,
          background,
          color,
        }}
      >
        {label}
      </span>
    );
  }

  const filterLabel =
    activeTab === "leaders"
      ? "Leader"
      : activeTab === "depots"
      ? "Depot"
      : activeTab === "companies"
      ? "Commander"
      : "Team";

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

  return (
    <div className="card">
      <div className="card-title">Updates History</div>
      <div className="muted">Review, edit, or void uploaded daily performance data.</div>

      {/* Tabs */}
      <div className="tabs" style={{ marginTop: 12 }}>
        {TABS.map(t => (
          <button
            key={t.key}
            type="button"
            className={`tab-button${activeTab === t.key ? " active" : ""}`}
            onClick={() => setActiveTab(t.key)}
            disabled={loading}
          >
            {t.label}
          </button>
        ))}
      </div>

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
          <label className="input-label">{filterLabel}</label>
          <select
            className="input"
            value={filtersInput[activeTab]}
            onChange={e => setFiltersInput(p => ({ ...p, [activeTab]: e.target.value }))}
          >
            <option value="">All {TABS.find(x => x.key === activeTab)?.label.toLowerCase()}</option>
            {filterOptions.map(o => (
              <option key={o.value} value={o.value}>
                {o.label}
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

          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14 }}>
            <input type="checkbox" checked={showVoided} onChange={toggleShowVoided} disabled={loading} />
            Show voided
          </label>
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
              <th>#</th>
              <th>Date</th>
              <th>{identityHeader}</th>
              <th>Source</th>
              <th>Leads</th>
              <th>Payins</th>
              <th>Sales</th>
              <th>Computed ID</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {visibleRows.map((row, index) => {
              const isEditing = activeTab === "leaders" && row.id === editingId;
              const agent = agentMap[row.agent_id];
              const canModify = canEditRow(row, profile, agent);
              const canModifyVoid = canVoidRow(row, profile, agent);
              const permissionBlocked = profileLoading || !canModify;
              const permissionBlockedVoid = profileLoading || !canModifyVoid;
              const permissionTitle = permissionBlocked ? PERMISSION_TOOLTIP(currentRole) : undefined;
              const permissionTitleVoid = permissionBlockedVoid ? PERMISSION_TOOLTIP(currentRole) : undefined;
              const isEditDisabled = savingId === row.id || row.voided || permissionBlocked;
              const isVoidDisabled = actionLoading || permissionBlockedVoid;
              const isUnvoidDisabled = actionLoading || permissionBlockedVoid;

              return (
                <tr key={row.id}>
                  <td>
                    <div className="muted" style={{ fontSize: 12 }}>{index + 1}</div>
                  </td>
                  <td>{row.date_real}</td>
                  <td>{renderIdentityCell(row)}</td>
                  <td>{renderSourcePill(row)}</td>

                  <td>
                    {isEditing ? (
                      <input
                        type="number"
                        className="input"
                        style={{ maxWidth: 120 }}
                        value={editValues.leads}
                        onChange={e => onEditChange("leads", e.target.value)}
                      />
                    ) : (
                      formatNumber(row.leads)
                    )}
                  </td>

                  <td>
                    {isEditing ? (
                      <input
                        type="number"
                        className="input"
                        style={{ maxWidth: 120 }}
                        value={editValues.payins}
                        onChange={e => onEditChange("payins", e.target.value)}
                      />
                    ) : (
                      formatNumber(row.payins)
                    )}
                  </td>

                  <td>
                    {isEditing ? (
                      <input
                        type="number"
                        className="input"
                        style={{ maxWidth: 140 }}
                        value={editValues.sales}
                        onChange={e => onEditChange("sales", e.target.value)}
                      />
                    ) : (
                      formatCurrency(row.sales)
                    )}
                  </td>

                  <td>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {row.id}
                    </div>
                  </td>

                  <td>{renderStatus(row)}</td>

                  <td>
                    {isEditing ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 320 }}>
                        <textarea
                          className="input"
                          rows={2}
                          placeholder="Reason for edit (required)"
                          value={editReason}
                          onChange={e => setEditReason(e.target.value)}
                        />
                        <div className="muted" style={{ fontSize: 12 }}>
                          Minimum 5 characters.
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            type="button"
                            className="button primary"
                            onClick={() => saveEdit(row.id)}
                            disabled={savingId === row.id || editReason.trim().length < 5}
                          >
                            {savingId === row.id ? "Saving..." : "Save"}
                          </button>
                          <button
                            type="button"
                            className="button secondary"
                            onClick={cancelEdit}
                            disabled={savingId === row.id}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {activeTab === "leaders" ? (
                          <button
                            type="button"
                            className="button secondary"
                            onClick={() => startEdit(row)}
                            disabled={isEditDisabled}
                            title={
                              !canModify
                                ? permissionTitle
                                : row.voided
                                ? "Cannot edit a voided row"
                                : undefined
                            }
                            style={isEditDisabled ? { opacity: 0.6, cursor: "not-allowed" } : undefined}
                          >
                            Edit
                          </button>
                        ) : (
                          <button type="button" className="button secondary" disabled title="Editable only on Leaders tab">
                            Edit
                          </button>
                        )}

                        {!row.voided ? (
                          <button
                            type="button"
                            className="button secondary"
                            onClick={() => openConfirm("void", row)}
                            disabled={isVoidDisabled}
                            style={{
                              background: "#ffe8e8",
                              color: "#b00020",
                              ...(isVoidDisabled ? { opacity: 0.6, cursor: "not-allowed" } : {}),
                            }}
                            title={permissionTitleVoid}
                          >
                            Void
                          </button>
                        ) : null}

                        {row.voided && showVoided ? (
                          <button
                            type="button"
                            className="button secondary"
                            onClick={() => openConfirm("unvoid", row)}
                            disabled={isUnvoidDisabled}
                            style={{
                              background: "#e6f5e6",
                              color: "#1b6b1b",
                              ...(isUnvoidDisabled ? { opacity: 0.6, cursor: "not-allowed" } : {}),
                            }}
                            title={permissionTitleVoid}
                          >
                            Unvoid
                          </button>
                        ) : null}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}

            {!visibleRows.length && !loading ? (
              <tr>
                <td colSpan={10} className="muted" style={{ textAlign: "center", padding: 16 }}>
                  No data to display.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {/* Confirm modal */}
      {confirmAction.type && confirmAction.row ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 30,
            padding: 12,
          }}
        >
          <div
            style={{
              background: "#fff",
              padding: 20,
              borderRadius: 8,
              width: "min(520px, 100%)",
              boxShadow: "0 8px 30px rgba(0,0,0,0.15)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>
                {confirmAction.type === "void" ? "Void entry" : "Unvoid entry"}
              </div>
              <button type="button" className="button secondary" onClick={closeConfirm} disabled={actionLoading}>
                Close
              </button>
            </div>

            <div className="muted" style={{ marginTop: 6 }}>
              {confirmAction.type === "void"
                ? "Voiding will hide this row from leaderboards and history unless shown explicitly."
                : "Unvoid to restore this row to active lists."}
            </div>

            <div style={{ marginTop: 12 }}>
              <textarea
                className="input"
                rows={3}
                placeholder={
                  confirmAction.type === "void"
                    ? "Reason for void (required)"
                    : "Reason for unvoid (required)"
                }
                value={confirmAction.reason}
                onChange={e => setConfirmAction(prev => ({ ...prev, reason: e.target.value }))}
              />
              <div className="muted" style={{ fontSize: 12 }}>
                Minimum 5 characters.
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
              <button
                type="button"
                className="button primary"
                onClick={submitConfirmAction}
                disabled={!confirmReasonValid || actionLoading}
              >
                {actionLoading
                  ? "Working..."
                  : confirmAction.type === "void"
                  ? "Void"
                  : "Unvoid"}
              </button>
              <button type="button" className="button secondary" onClick={closeConfirm} disabled={actionLoading}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
