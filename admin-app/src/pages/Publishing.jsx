import React, { useEffect, useMemo, useState } from "react";
import "../styles/pages/publishing.css";
import { Navigate } from "react-router-dom";
import { ModalForm } from "../components/ModalForm";
import { FloatingSelectField } from "../components/FloatingSelectField";
import AppPagination from "../components/AppPagination";
import ExportButton from "../components/ExportButton";
import { exportToXlsx } from "../services/export.service";
import { listAgents } from "../services/agents.service";
import {
  AuditAction,
  applyRawDataAuditAction,
  listPublishingRows,
  setPublished,
  unpublishRowsWithAudit,
} from "../services/rawData.service";
import { getMyProfile } from "../services/profile.service";
import { ensureSession } from "../services/supabase";

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

function TrashIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M9 3.75A.75.75 0 0 1 9.75 3h4.5a.75.75 0 0 1 .75.75V5H19a.75.75 0 0 1 0 1.5h-1.06l-1.02 12.24A2.25 2.25 0 0 1 14.68 21H9.32a2.25 2.25 0 0 1-2.24-2.26L6.06 6.5H5a.75.75 0 0 1 0-1.5h4V3.75ZM10.5 5h3V4.5h-3V5Zm-1.9 1.5.98 11.86a.75.75 0 0 0 .74.74h5.36a.75.75 0 0 0 .74-.74l.98-11.86H8.6Zm2.15 2.5c.41 0 .75.34.75.75v6a.75.75 0 0 1-1.5 0v-6c0-.41.34-.75.75-.75Zm3 0c.41 0 .75.34.75.75v6a.75.75 0 0 1-1.5 0v-6c0-.41.34-.75.75-.75Z"
      />
    </svg>
  );
}

function UnvoidIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M7.5 4.5A2.5 2.5 0 0 0 5 7v10a2.5 2.5 0 0 0 2.5 2.5h9A2.5 2.5 0 0 0 19 17V8.5a.75.75 0 0 0-.22-.53l-3.75-3.75A.75.75 0 0 0 14.5 4.5h-7ZM7 7a.75.75 0 0 1 .75-.75h5.75V9a1 1 0 0 0 1 1H17v7a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1V7Zm7.5-.94L16.94 8.5H14.5V6.06ZM8.5 12a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 0 1.5h-4.5A.75.75 0 0 1 8.5 12Z"
      />
    </svg>
  );
}

export default function Publishing() {
  const defaults = useMemo(() => getDefaultDateRange(), []);
  const [filters, setFilters] = useState({
    dateFrom: defaults.dateFrom,
    dateTo: defaults.dateTo,
    agentId: "",
    status: "",
  });
  const [filterSearch, setFilterSearch] = useState({ agentId: "", status: "" });
  const [appliedFilters, setAppliedFilters] = useState({
    dateFrom: defaults.dateFrom,
    dateTo: defaults.dateTo,
    agentId: "",
    status: "",
  });
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const rowsPerPage = 10;
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
  const [auditProgress, setAuditProgress] = useState(null);

  const role = profile?.role ?? "";
  const isSuperAdmin = role === "super_admin";
  const isUser = role === "user";
  const canViewAudit = ADMIN_ROLES.has(role);
  const canVoid = ADMIN_ROLES.has(role);
  const canViewPage = canViewAudit || isUser;

  const [selectedIds, setSelectedIds] = useState(new Set());

  async function ensureActiveSession() {
    const result = await ensureSession(120);
    if (!result.ok) {
      setError("Session expired. Please sign in again.");
      return false;
    }
    return true;
  }

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

  useEffect(() => {
    setPage(1);
  }, [rows.length]);

  const pageCount = Math.max(1, Math.ceil(rows.length / rowsPerPage));

  useEffect(() => {
    if (page > pageCount) {
      setPage(pageCount);
    }
  }, [page, pageCount]);

  const pagedRows = useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    return rows.slice(start, start + rowsPerPage);
  }, [page, rows, rowsPerPage]);

  const baseIndex = (page - 1) * rowsPerPage;

  function exportXlsx() {
    const exportRows = rows.map((row, index) => ({
      "#": index + 1,
      Date: row.date_real,
      Leader: row.agent_id,
      "Leads Depot": row.leads_depot_id,
      "Sales Depot": row.sales_depot_id,
      Leads: row.leads,
      Payins: row.payins,
      Sales: row.sales,
      Status: row.voided ? "Voided" : row.published ? "Published" : "Unpublished",
      "Void Reason": row.void_reason || "-",
    }));
    const filename = `publishing-${new Date().toISOString().slice(0, 10)}.xlsx`;
    exportToXlsx({ rows: exportRows, filename, sheetName: "Publishing" });
  }

  const counters = useMemo(() => {
    const total = rows.length;
    const published = rows.filter(row => row.published && !row.voided).length;
    const voided = rows.filter(row => row.voided).length;
    const unpublished = rows.filter(row => !row.published && !row.voided).length;
    return { total, published, unpublished, voided };
  }, [rows]);

  const selectedFilterLeaderName = useMemo(() => {
    if (!filters.agentId) return "";
    const found = agents.find(agent => String(agent.id) === String(filters.agentId));
    return found?.name || "";
  }, [agents, filters.agentId]);

  const selectedFilterStatusName = useMemo(() => {
    if (!filters.status) return "";
    if (filters.status === "published") return "Published";
    if (filters.status === "unpublished") return "Unpublished";
    if (filters.status === "voided") return "Voided";
    return "";
  }, [filters.status]);

  const leaderFilterOptions = useMemo(() => {
    const q = filterSearch.agentId.trim().toLowerCase();
    const base = agents.map(agent => ({ id: agent.id, name: agent.name || agent.id }));
    if (!q) return base;
    return base.filter(option =>
      option.name.toLowerCase().includes(q) || option.id.toLowerCase().includes(q)
    );
  }, [agents, filterSearch.agentId]);

  const statusFilterOptions = useMemo(() => {
    const base = [
      { id: "published", name: "Published" },
      { id: "unpublished", name: "Unpublished" },
      { id: "voided", name: "Voided" },
    ];
    const q = filterSearch.status.trim().toLowerCase();
    if (!q) return base;
    return base.filter(option => option.name.toLowerCase().includes(q) || option.id.toLowerCase().includes(q));
  }, [filterSearch.status]);

  function handleApplyFilters() {
    setError("");
    setLoading(true);
    const nextFilters = { ...filters };
    if (isUser) nextFilters.agentId = profile?.agent_id ?? "";
    setAppliedFilters(nextFilters);
  }

  function handleClearFilters() {
    const reset = {
      dateFrom: defaults.dateFrom,
      dateTo: defaults.dateTo,
      agentId: isUser ? profile?.agent_id ?? "" : "",
      status: "",
    };
    setFilters(reset);
    setAppliedFilters(reset);
    setFilterSearch({ agentId: "", status: "" });
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
    if (!(await ensureActiveSession())) return;
    setBatchLoading(true);
    setError("");

    try {
      for (const id of ids) {
        await setPublished(id, nextPublished);
      }
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
    setAuditProgress(null);
    setAuditModalOpen(true);
  }

  function closeAuditModal() {
    setAuditModalOpen(false);
    setAuditAction(null);
    setAuditRowIds([]);
    setAuditReason("");
    setAuditSubmitting(false);
    setAuditError("");
    setAuditProgress(null);
  }

  async function handleConfirmAuditAction() {
    if (!auditAction || !auditRowIds.length) return;
    if (!(await ensureActiveSession())) return;
    const trimmedReason = auditReason.trim();
    if (!trimmedReason) {
      setAuditError("Reason is required.");
      return;
    }

    setAuditSubmitting(true);
    setAuditError("");
    setAuditProgress(null);

    try {
      let updatedRows = [];
      if (auditAction === AuditAction.UNPUBLISH) {
        const total = auditRowIds.length;
        setAuditProgress({ current: 0, total });
        updatedRows = await unpublishRowsWithAudit({
          rowIds: auditRowIds,
          reason: trimmedReason,
          onProgress: ({ current, total: totalCount }) =>
            setAuditProgress({ current, total: totalCount }),
        });
      } else {
        updatedRows = await applyRawDataAuditAction({
          action: auditAction,
          reason: trimmedReason,
          rowIds: auditRowIds,
        });
      }
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
      setAuditProgress(null);
    }
  }

  useEffect(() => {
    if (!profile?.role) return;
    if (!isUser) return;
    setFilters(prev => ({ ...prev, agentId: profile?.agent_id ?? "" }));
    setAppliedFilters(prev => ({ ...prev, agentId: profile?.agent_id ?? "" }));
  }, [isUser, profile?.agent_id, profile?.role]);

  if (!profileLoading && !canViewPage) {
    return <Navigate to="/dashboard" replace />;
  }

  const trimmedReason = auditReason.trim();

  return (
    <div className="card publishing-page">
      <div className="card-title">{isUser ? "My Publishing" : "Publishing"}</div>
      <div className="muted" style={{ marginBottom: 12 }}>
        Only rows published by a Super Admin appear on the public leaderboard.
      </div>

      {!profileLoading && !canViewAudit ? (
        <div className="error-box" role="alert">
          You can view publish status, but publish/unpublish actions are restricted to admins.
        </div>
      ) : null}

      <div className="publishing-filters">
        <div className="publishing-filter-row">
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
        </div>
        <div className="publishing-filter-row">
          {!isUser ? (
            <div>
              <FloatingSelectField
                label="Leader"
                placeholder="All Leaders"
                searchPlaceholder="Search leader"
                valueText={selectedFilterLeaderName}
                searchValue={filterSearch.agentId}
                onSearchChange={value => setFilterSearch(prev => ({ ...prev, agentId: value }))}
                options={leaderFilterOptions}
                selectedId={filters.agentId}
                disabled={agentsLoading}
                onSelect={option => {
                  setFilters(prev => ({ ...prev, agentId: option.id }));
                  setFilterSearch(prev => ({ ...prev, agentId: option.name }));
                }}
                emptyText="No leaders found."
              />
            </div>
          ) : (
            <div>
              <label className="form-label">Leader</label>
              <input type="text" value={selectedFilterLeaderName || profile?.agent_id || ""} readOnly />
            </div>
          )}
          <div>
            <FloatingSelectField
              label="Status"
              placeholder="All"
              searchPlaceholder="Search status"
              valueText={selectedFilterStatusName}
              searchValue={filterSearch.status}
              onSearchChange={value => setFilterSearch(prev => ({ ...prev, status: value }))}
              options={statusFilterOptions}
              selectedId={filters.status}
              onSelect={option => {
                setFilters(prev => ({ ...prev, status: option.id }));
                setFilterSearch(prev => ({ ...prev, status: option.name }));
              }}
              emptyText="No status found."
              showId={false}
            />
          </div>
          <div className="publishing-filter-actions">
            <button type="button" className="button primary" onClick={handleApplyFilters} disabled={loading}>
              Apply Filters
            </button>
            <button type="button" className="button secondary" onClick={handleClearFilters} disabled={loading}>
              Clear Filters
            </button>
            <ExportButton
              onClick={exportXlsx}
              loading={false}
              disabled={loading || !rows.length}
              label="Export XLSX"
            />
          </div>
        </div>
      </div>

      <div className="summary-grid publishing-summary">
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
        <div className="publishing-actions">
          <div className="publishing-actions__meta">
            Selected: <span>{selectedIds.size}</span>
          </div>
          <div className="publishing-actions__buttons">
            <button
              type="button"
              className="button primary"
              onClick={() => handleBatchPublish(true)}
              disabled={batchLoading || !selectedIds.size}
            >
              Publish Selected
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
              Unpublish Selected
            </button>
          </div>
        </div>
      ) : null}

      <div className="table-scroll publishing-table-wrap">
        <table className="publishing-table">
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
              <th className="num">Leads</th>
              <th className="num">Payins</th>
              <th className="num">Sales</th>
              <th>Status</th>
              <th>Void Reason</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pagedRows.map((row, index) => (
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
                  <div className="muted" style={{ fontSize: 12 }}>{baseIndex + index + 1}</div>
                </td>
                <td>{row.date_real}</td>
                <td>{row.agent_id}</td>
                <td>{row.leads_depot_id}</td>
                <td>{row.sales_depot_id}</td>
                <td className="num">{row.leads}</td>
                <td className="num">{row.payins}</td>
                <td className="num">{row.sales}</td>

                <td>
                  {row.voided ? (
                    <span className="status-pill invalid">Voided</span>
                  ) : (
                    <span className={`status-pill ${row.published ? "valid" : "muted"}`}>
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
                        className="btn-link icon-btn"
                        onClick={() => openAuditModal(AuditAction.VOID, [row.id])}
                        disabled={auditSubmitting}
                        aria-label="Void"
                      >
                        <TrashIcon />
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

      <AppPagination
        count={pageCount}
        page={page}
        onChange={setPage}
        totalItems={rows.length}
        pageSize={rowsPerPage}
      />

      {auditModalOpen && auditConfig ? (
        <ModalForm
          isOpen={auditModalOpen}
          onOverlayClose={closeAuditModal}
          onClose={closeAuditModal}
          onSubmit={event => {
            event.preventDefault();
            if (auditSubmitting || !trimmedReason) return;
            handleConfirmAuditAction();
          }}
          title={auditConfig.title}
          footer={(
            <>
              <button type="button" className="button secondary" onClick={closeAuditModal} disabled={auditSubmitting}>
                Cancel
              </button>
              <button type="submit" className="button primary" disabled={auditSubmitting || !trimmedReason}>
                {auditSubmitting ? "Saving..." : auditConfig.confirmLabel}
              </button>
            </>
          )}
        >
          <div className="audit-modal__head">
            <div className={`audit-modal__icon ${auditAction === AuditAction.VOID ? "is-danger" : "is-info"}`}>
              {auditAction === AuditAction.VOID ? <TrashIcon /> : <UnvoidIcon />}
            </div>
            <div>
              <div className="audit-modal__title">{auditConfig.title}</div>
              <div className="audit-modal__subtitle">{auditConfig.description}</div>
            </div>
          </div>
          {auditSubmitting && auditAction === AuditAction.UNPUBLISH && auditProgress?.total ? (
            <div className="muted" style={{ marginBottom: 12 }}>
              {`Unpublishing ${auditProgress.current}/${auditProgress.total}...`}
            </div>
          ) : null}
          <div className="audit-modal__field">
            <label className="form-label" htmlFor="audit-reason">
              Reason <span className="req">*</span>
            </label>
            <textarea
              className="input"
              rows={3}
              id="audit-reason"
              value={auditReason}
              onChange={e => setAuditReason(e.target.value)}
              placeholder="Add a clear reason for the audit log."
              required
            />
          </div>
          {auditError ? (
            <div className="error" style={{ marginTop: 12 }}>
              {auditError}
            </div>
          ) : null}
        </ModalForm>
      ) : null}
    </div>
  );
}
