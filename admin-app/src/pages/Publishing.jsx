import React, { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { AuditReasonModal } from "../components/AuditReasonModal";
import { listAgents } from "../services/agents.service";
import { AuditAction, applyRawDataAuditAction, listPublishingRows, setPublished } from "../services/rawData.service";
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

const SCHEMA_MIGRATION_HINT = "Run SQL migration and reload schema.";
const ADMIN_ROLES = new Set(["admin", "super_admin"]);

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
  const [batchLoading, setBatchLoading] = useState(false);

  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);

  const [auditModalOpen, setAuditModalOpen] = useState(false);
  const [auditAction, setAuditAction] = useState(null);
  const [auditRowIds, setAuditRowIds] = useState([]);
  const [auditReason, setAuditReason] = useState("");
  const [auditSubmitting, setAuditSubmitting] = useState(false);
  const [auditError, setAuditError] = useState("");

  const role = profile?.role ?? "";
  const isSuperAdmin = role === "super_admin";
  const canViewAudit = ADMIN_ROLES.has(role);
  const canVoid = ADMIN_ROLES.has(role);

  const [selectedIds, setSelectedIds] = useState(new Set());

  function normalizeSchemaErrorMessage(err, fallback) {
    const msg = err?.message || fallback || "";
    const lowered = msg.toLowerCase();
    if (lowered.includes("schema cache") || lowered.includes("approve_reason") || lowered.includes("publish_reason")) {
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
    listPublishingRows(appliedFilters)
      .then((dataRows) => {
        if (!mounted) return;
        setRows(dataRows ?? []);
      })
      .catch(err => {
        if (!mounted) return;
        setError(normalizeSchemaErrorMessage(err, "Failed to load publishing data"));
        setRows([]);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [appliedFilters]);

  useEffect(() => {
    setSelectedIds(prev => {
      if (!prev.size) return prev;
      const next = new Set();
      for (const row of rows) {
        if (row.voided) continue;
        if (prev.has(row.id)) next.add(row.id);
      }
      return next;
    });
  }, [rows]);

  const counters = useMemo(() => {
    const total = rows.length;
    const published = rows.filter(row => row.published && !row.voided).length;
    const voided = rows.filter(row => row.voided).length;
    const unpublished = rows.filter(row => !row.published && !row.voided).length;
    return { total, published, unpublished, voided };
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

  const selectableRows = useMemo(() => rows.filter(row => !row.voided), [rows]);
  const selectableRowIds = useMemo(() => new Set(selectableRows.map(row => row.id)), [selectableRows]);

  function handleSelectAll(checked) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) {
        for (const row of selectableRows) {
          next.add(row.id);
        }
      } else {
        for (const row of selectableRows) {
          next.delete(row.id);
        }
      }
      return next;
    });
  }

  function handleSelectRow(rowId, checked) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) {
        next.add(rowId);
      } else {
        next.delete(rowId);
      }
      return next;
    });
  }

  async function handleBatchPublish(nextPublished) {
    if (!isSuperAdmin || batchLoading) return;
    const ids = Array.from(selectedIds).filter(id => selectableRowIds.has(id));
    if (!ids.length) return;
    setBatchLoading(true);
    setError("");

    try {
      await Promise.all(ids.map(id => setPublished(id, nextPublished)));
      setRows(prev =>
        prev.map(row => (ids.includes(row.id) ? { ...row, published: nextPublished } : row))
      );
      setSelectedIds(new Set());
      setAppliedFilters(prev => ({ ...prev }));
    } catch (err) {
      console.error(err);
      setError(normalizeSchemaErrorMessage(err, "Failed to update publish status"));
    } finally {
      setBatchLoading(false);
    }
  }

  const auditConfig = useMemo(() => {
    if (!auditAction) return null;
    const isBulk = auditRowIds.length > 1;
    if (auditAction === AuditAction.VOID) {
      return {
        title: "Void Record",
        description:
          "Provide a reason for voiding this record. This action will be logged for audit purposes.",
        confirmLabel: "Confirm Void",
      };
    }
    if (auditAction === AuditAction.UNVOID) {
      return {
        title: "Unvoid Record",
        description:
          "Provide a reason for unvoiding this record. This action will be logged for audit purposes.",
        confirmLabel: "Confirm Unvoid",
      };
    }
    if (auditAction === AuditAction.UNPUBLISH) {
      return {
        title: isBulk ? "Unpublish Selected Records" : "Unpublish Record",
        description:
          "Provide a reason for unpublishing this record. Unpublished records will not appear on the public leaderboard.",
        confirmLabel: "Confirm Unpublish",
      };
    }
    return null;
  }, [auditAction, auditRowIds.length]);

  function openAuditModal(action, rowIds) {
    setAuditAction(action);
    setAuditRowIds(rowIds);
    setAuditReason("");
    setAuditError("");
    setAuditModalOpen(true);
  }

  function closeAuditModal() {
    setAuditModalOpen(false);
    setAuditAction(null);
    setAuditRowIds([]);
    setAuditReason("");
    setAuditSubmitting(false);
    setAuditError("");
  }

  async function handleConfirmAuditAction() {
    if (!auditAction || !auditRowIds.length) return;
    const trimmedReason = auditReason.trim();
    if (!trimmedReason) {
      setAuditError("Reason is required.");
      return;
    }

    setAuditSubmitting(true);
    setAuditError("");

    try {
      const updatedRows = await applyRawDataAuditAction({
        action: auditAction,
        reason: trimmedReason,
        rowIds: auditRowIds,
      });
      const updatedById = new Map((updatedRows ?? []).map(row => [row.id, row]));
      const nowIso = new Date().toISOString();
      setRows(prev =>
        prev.map(item => {
          if (!auditRowIds.includes(item.id)) return item;
          const updated = updatedById.get(item.id);
          if (updated) {
            return { ...item, ...updated };
          }
          if (auditAction === AuditAction.VOID) {
            return { ...item, voided: true, void_reason: trimmedReason, voided_at: nowIso };
          }
          if (auditAction === AuditAction.UNVOID) {
            return { ...item, voided: false, void_reason: null, voided_at: null, voided_by: null };
          }
          if (auditAction === AuditAction.UNPUBLISH) {
            return { ...item, published: false };
          }
          return item;
        })
      );
      setSelectedIds(new Set());
      setAppliedFilters(prev => ({ ...prev }));
      closeAuditModal();
    } catch (e) {
      console.error(e);
      const message = normalizeSchemaErrorMessage(e, "Failed to update rows");
      setAuditError(message);
    } finally {
      setAuditSubmitting(false);
    }
  }

  if (!profileLoading && !canViewAudit) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="card">
      <div className="card-title">Publishing</div>
      <div className="muted" style={{ marginBottom: 12 }}>
        Only rows published by a Super Admin appear on the public leaderboard.
      </div>

      {!profileLoading && !canViewAudit ? (
        <div className="error-box" role="alert">
          Only Super Admins can publish or unpublish rows. You can still view the current publish state.
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
            <option value="published">Published</option>
            <option value="unpublished">Unpublished</option>
            <option value="voided">Voided</option>
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
          <div className="summary-label">Published</div>
          <div className="summary-value valid">{counters.published}</div>
        </div>
        <div className="summary-pill">
          <div className="summary-label">Unpublished</div>
          <div className="summary-value">{counters.unpublished}</div>
        </div>
        <div className="summary-pill">
          <div className="summary-label">Voided</div>
          <div className="summary-value">{counters.voided}</div>
        </div>
      </div>

      {error ? (
        <div className="error-box" role="alert" style={{ marginTop: 12 }}>
          {error}
        </div>
      ) : null}

      {loading ? <div className="muted" style={{ marginTop: 12 }}>Loading publishing data…</div> : null}

      {isSuperAdmin ? (
        <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            className="button primary"
            onClick={() => handleBatchPublish(true)}
            disabled={batchLoading || !selectedIds.size}
          >
            Publish Selected ({selectedIds.size})
          </button>
          <button
            type="button"
            className="button secondary"
            onClick={() =>
              openAuditModal(
                AuditAction.UNPUBLISH,
                Array.from(selectedIds).filter(id => selectableRowIds.has(id))
              )
            }
            disabled={batchLoading || !selectedIds.size}
          >
            Unpublish Selected ({selectedIds.size})
          </button>
        </div>
      ) : null}

      <div className="table-scroll" style={{ marginTop: 12 }}>
        <table className="data-table">
          <thead>
            <tr>
              {isSuperAdmin ? (
                <th style={{ width: 36 }}>
                  <input
                    type="checkbox"
                    checked={selectableRows.length > 0 && selectedIds.size === selectableRows.length}
                    onChange={e => handleSelectAll(e.target.checked)}
                    disabled={!selectableRows.length || batchLoading}
                  />
                </th>
              ) : null}
              <th>#</th>
              <th>Date</th>
              <th>Leader</th>
              <th>Leads Depot</th>
              <th>Sales Depot</th>
              <th>Leads</th>
              <th>Payins</th>
              <th>Sales</th>
              <th>Status</th>
              <th>Void Reason</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.id}>
                {isSuperAdmin ? (
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(row.id)}
                      onChange={e => handleSelectRow(row.id, e.target.checked)}
                      disabled={row.voided || batchLoading}
                    />
                  </td>
                ) : null}
                <td>
                  <div className="muted" style={{ fontSize: 12 }}>{index + 1}</div>
                </td>
                <td>{row.date_real}</td>
                <td>{row.agent_id}</td>
                <td>{row.leads_depot_id}</td>
                <td>{row.sales_depot_id}</td>
                <td>{row.leads}</td>
                <td>{row.payins}</td>
                <td>{row.sales}</td>

                <td>
                  {row.voided ? (
                    <span style={{
                      display: "inline-block",
                      padding: "2px 8px",
                      background: "#ffe8e8",
                      color: "#b00020",
                      borderRadius: 12,
                      fontSize: 12,
                      fontWeight: 600,
                    }}>
                      Voided
                    </span>
                  ) : (
                    <span style={{
                      display: "inline-block",
                      padding: "2px 8px",
                      background: row.published ? "#e6f5e6" : "#f5f5f5",
                      color: row.published ? "#1b6b1b" : "#666",
                      borderRadius: 12,
                      fontSize: 12,
                      fontWeight: 600,
                    }}>
                      {row.published ? "Published" : "Unpublished"}
                    </span>
                  )}
                </td>

                <td>
                  {row.voided && row.void_reason ? (
                    <div className="muted" style={{ fontSize: 12, maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis" }} title={row.void_reason}>
                      {row.void_reason}
                    </div>
                  ) : (
                    "—"
                  )}
                </td>

                <td>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {!row.voided && canVoid ? (
                      <button
                        type="button"
                        className="button secondary"
                        onClick={() => openAuditModal(AuditAction.VOID, [row.id])}
                        disabled={auditSubmitting}
                      >
                        Void
                      </button>
                    ) : null}
                    {!row.voided && isSuperAdmin && row.published ? (
                      <button
                        type="button"
                        className="button secondary"
                        onClick={() => openAuditModal(AuditAction.UNPUBLISH, [row.id])}
                        disabled={auditSubmitting}
                      >
                        Unpublish
                      </button>
                    ) : null}
                    {row.voided && isSuperAdmin ? (
                      <button
                        type="button"
                        className="button secondary"
                        onClick={() => openAuditModal(AuditAction.UNVOID, [row.id])}
                        disabled={auditSubmitting}
                      >
                        Unvoid
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
            {!rows.length && !loading ? (
              <tr>
                <td colSpan={isSuperAdmin ? 12 : 11} className="muted" style={{ textAlign: "center" }}>
                  No rows found for the selected filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {auditModalOpen && auditConfig ? (
        <AuditReasonModal
          isOpen={auditModalOpen}
          title={auditConfig.title}
          description={auditConfig.description}
          reason={auditReason}
          onReasonChange={setAuditReason}
          confirmLabel={auditSubmitting ? "Saving..." : auditConfig.confirmLabel}
          onCancel={closeAuditModal}
          onConfirm={handleConfirmAuditAction}
          error={auditError}
          submitting={auditSubmitting}
        />
      ) : null}
    </div>
  );
}
