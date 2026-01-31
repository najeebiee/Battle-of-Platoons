import React, { useEffect, useMemo, useState } from "react";
import "../styles/pages/audit-log.css";
import { Navigate } from "react-router-dom";
import AppPagination from "../components/AppPagination";
import ExportButton from "../components/ExportButton";
import { ModalForm } from "../components/ModalForm";
import { exportToXlsx } from "../services/export.service";
import {
  getProfilesByIds,
  listFinalizedWeeks,
  listRawDataAudit,
  listScoringFormulaAudit,
} from "../services/auditLog.service";
import { getMyProfile } from "../services/profile.service";
const PAGE_SIZE = 10;
const BASE_ACTIONS = [
  "edit",
  "void",
  "unvoid",
  "approve",
  "unapprove",
  "publish",
  "unpublish",
  "create",
  "update",
  "delete",
  "finalize",
  "reopen",
  "VOID",
  "UNVOID",
  "PUBLISH",
  "UNPUBLISH",
];

function EyeIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M12 5c5.05 0 8.7 4.45 9.65 5.78a1.6 1.6 0 0 1 0 1.86C20.7 13.97 17.05 18.4 12 18.4S3.3 13.97 2.35 12.64a1.6 1.6 0 0 1 0-1.86C3.3 9.45 6.95 5 12 5Zm0 1.6c-3.92 0-7.07 3.35-7.93 4.6.86 1.25 4 4.6 7.93 4.6s7.07-3.35 7.93-4.6c-.86-1.25-4-4.6-7.93-4.6Zm0 2.2a3.6 3.6 0 1 1 0 7.2 3.6 3.6 0 0 1 0-7.2Zm0 1.6a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z"
      />
    </svg>
  );
}

function toIsoRange(dateFrom, dateTo) {
  const fromTs = dateFrom ? new Date(`${dateFrom}T00:00:00Z`).toISOString() : null;
  const toTs = dateTo ? new Date(`${dateTo}T23:59:59.999Z`).toISOString() : null;
  return { fromTs, toTs };
}

function safeJsonParse(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch (e) {
    return value;
  }
}

function formatDate(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function truncate(text = "", max = 60) {
  if (!text) return "";
  const trimmed = text.toString();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}…`;
}

function isUuid(value) {
  if (!value) return false;
  const text = value.toString();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text);
}

function shortUuid(value) {
  if (!value) return "";
  return value.toString().slice(0, 8);
}

function getProfileActorId(row) {
  const raw = row?.actor_id ?? "";
  const value = raw?.toString?.() ?? "";
  return isUuid(value) ? value : "";
}

function normalizeRawDataRow(row) {
  const before = safeJsonParse(row.before ?? row.before_json ?? row.before_data ?? row.before_snapshot);
  const after = safeJsonParse(row.after ?? row.after_json ?? row.after_data ?? row.after_snapshot);
  const leaderId = after?.agent_id ?? before?.agent_id ?? null;

  return {
    id: `raw_data_audit:${row.id ?? row.raw_data_id ?? row.created_at}`,
    created_at: row.created_at ?? row.timestamp ?? row.at ?? null,
    entity_type: "raw_data",
    entity_id: row.raw_data_id ?? row.id ?? null,
    action: row.action ?? row.event ?? "",
    reason: row.reason ?? row.notes ?? "",
    actor_id: row.actor_id ?? row.actor_uuid ?? row.user_id ?? row.actor ?? null,
    actor_email: row.actor_email ?? null,
    actor_name: row.actor_email ?? row.actor_name ?? row.actor ?? null,
    leader_id: leaderId,
    before,
    after,
    meta: row.meta ?? null,
    source_table: "raw_data_audit",
  };
}

function normalizeScoringFormulaRow(row) {
  const before = safeJsonParse(row.before ?? row.before_json ?? row.before_data ?? row.before_snapshot);
  const after = safeJsonParse(row.after ?? row.after_json ?? row.after_data ?? row.after_snapshot);
  const leaderId = after?.agent_id ?? before?.agent_id ?? null;

  return {
    id: `scoring_formula_audit:${row.id ?? row.formula_id ?? row.created_at ?? row.timestamp ?? row.at}`,
    created_at: row.created_at ?? row.timestamp ?? row.at ?? null,
    entity_type: "scoring_formula",
    entity_id: row.formula_id ?? row.id ?? null,
    action: row.action ?? row.event ?? "",
    reason: row.reason ?? row.notes ?? "",
    actor_id: row.actor_id ?? row.actor_uuid ?? row.user_id ?? row.actor ?? null,
    actor_email: row.actor_email ?? null,
    actor_name: row.actor_name ?? row.actor_email ?? row.actor ?? null,
    leader_id: leaderId,
    before,
    after,
    meta: row.meta ?? row.metadata ?? null,
    source_table: "scoring_formula_audit",
  };
}

function normalizeFinalizedWeek(row) {
  const rows = [];
  if (row.finalized_at) {
    rows.push({
      id: `finalized_weeks:finalize:${row.week_key ?? row.id ?? row.finalized_at}`,
      created_at: row.finalized_at,
      entity_type: "finalized_week",
      entity_id: row.week_key ?? row.id ?? null,
      action: "finalize",
      reason: row.finalize_reason ?? "",
      actor_id: row.finalized_by ?? null,
      actor_name: null,
      leader_id: null,
      before: null,
      after: row,
      meta: null,
      source_table: "finalized_weeks",
    });
  }
  if (row.reopened_at) {
    rows.push({
      id: `finalized_weeks:reopen:${row.week_key ?? row.id ?? row.reopened_at}`,
      created_at: row.reopened_at,
      entity_type: "finalized_week",
      entity_id: row.week_key ?? row.id ?? null,
      action: "reopen",
      reason: row.reopen_reason ?? "",
      actor_id: row.reopened_by ?? null,
      actor_name: null,
      leader_id: null,
      before: null,
      after: row,
      meta: null,
      source_table: "finalized_weeks",
    });
  }
  return rows;
}

function applyClientFilters(rows, filters, resolver = {}) {
  const action = filters.action?.trim();
  const entityType = filters.entityType?.trim();
  const actorValue = filters.actorId?.trim().toLowerCase();
  const leaderValue = filters.leaderId?.trim();
  const searchValue = filters.search?.trim().toLowerCase();
  const { fromTs, toTs } = toIsoRange(filters.dateFrom, filters.dateTo);
  const fromTime = fromTs ? new Date(fromTs).getTime() : null;
  const toTime = toTs ? new Date(toTs).getTime() : null;

  return rows.filter(row => {
    if (entityType && entityType !== "all" && row.entity_type !== entityType) return false;
    if (action && row.action !== action) return false;

    if (actorValue) {
      const actorId = resolver.getActorId ? resolver.getActorId(row) : row.actor_id?.toString() ?? "";
      const actorDisplay = resolver.getActorDisplay ? resolver.getActorDisplay(row) : row.actor_name?.toString() ?? "";
      if (!actorId.toLowerCase().includes(actorValue) && !actorDisplay.toLowerCase().includes(actorValue)) {
        return false;
      }
    }

    if (leaderValue) {
      const leaderId = row.leader_id?.toString() ?? "";
      if (!leaderId.includes(leaderValue)) return false;
    }

    if (fromTime || toTime) {
      const rowTime = row.created_at ? new Date(row.created_at).getTime() : null;
      if (!rowTime) return false;
      if (fromTime && rowTime < fromTime) return false;
      if (toTime && rowTime > toTime) return false;
    }

    if (searchValue) {
      const actorDisplay = resolver.getActorDisplay ? resolver.getActorDisplay(row) : row.actor_name;
      const actorId = resolver.getActorId ? resolver.getActorId(row) : row.actor_id;
      const haystack = [
        row.action,
        row.reason,
        actorId,
        actorDisplay,
        row.leader_id,
        row.entity_id,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(searchValue)) return false;
    }

    return true;
  });
}

export default function AuditLog() {
  const [profileLoading, setProfileLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [detailRow, setDetailRow] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState("");
  const [emailById, setEmailById] = useState({});
  const [emailMissingById, setEmailMissingById] = useState({});
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [filters, setFilters] = useState({
    dateFrom: "",
    dateTo: "",
    entityType: "all",
    action: "",
    actorId: "",
    leaderId: "",
    search: "",
  });
  const [appliedFilters, setAppliedFilters] = useState(filters);

  const isSuperAdmin = profile?.role === "super_admin";

  if (!profileLoading && !isSuperAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  const actorIdsToResolve = useMemo(() => {
    const ids = new Set();
    rows.forEach(row => {
      const actorId = getProfileActorId(row);
      if (!actorId) return;
      if (emailById[actorId] || emailMissingById[actorId]) return;
      ids.add(actorId);
    });
    return Array.from(ids);
  }, [rows, emailById, emailMissingById]);

  useEffect(() => {
    if (!isSuperAdmin || actorIdsToResolve.length === 0) return;
    let cancelled = false;
    const chunkSize = 200;

    async function resolveEmails() {
      for (let i = 0; i < actorIdsToResolve.length; i += chunkSize) {
        const chunk = actorIdsToResolve.slice(i, i + chunkSize);
        const profiles = await getProfilesByIds(chunk);
        if (cancelled) return;

        const foundIds = new Set();
        const nextEmailById = {};
        (profiles ?? []).forEach(profileRow => {
          if (!profileRow?.id) return;
          foundIds.add(profileRow.id);
          if (profileRow.email) nextEmailById[profileRow.id] = profileRow.email;
        });

        const nextMissing = {};
        chunk.forEach(id => {
          if (!foundIds.has(id)) nextMissing[id] = true;
        });

        if (Object.keys(nextEmailById).length) {
          setEmailById(prev => ({ ...prev, ...nextEmailById }));
        }
        if (Object.keys(nextMissing).length) {
          setEmailMissingById(prev => ({ ...prev, ...nextMissing }));
        }
      }
    }

    resolveEmails();
    return () => {
      cancelled = true;
    };
  }, [actorIdsToResolve, isSuperAdmin]);

  function getActorMeta(row) {
    const actorId = row.actor_id ? row.actor_id.toString() : "";
    const uuidActorId = isUuid(actorId) ? actorId : "";
    const resolvedEmail = uuidActorId ? emailById[uuidActorId] : "";
    const actorEmail = row.actor_email ? row.actor_email.toString() : "";
    const actorName = row.actor_name ? row.actor_name.toString() : "";
    const nonUuidActorLabel = actorName && !isUuid(actorName) ? actorName : "";
    const emailUnavailable = uuidActorId && emailMissingById[uuidActorId] && !resolvedEmail && !actorEmail;

    let display = "Unknown";
    if (resolvedEmail) display = resolvedEmail;
    else if (actorEmail) display = actorEmail;
    else if (emailUnavailable) display = "(email unavailable)";
    else if (nonUuidActorLabel) display = nonUuidActorLabel;

    return { display, actorId: actorId || "" };
  }

  const actorResolver = useMemo(() => ({
    getActorId: row => (row.actor_id ? row.actor_id.toString() : ""),
    getActorDisplay: row => getActorMeta(row).display,
  }), [emailById, emailMissingById]);

  useEffect(() => {
    let mounted = true;
    getMyProfile()
      .then(data => {
        if (!mounted) return;
        setProfile(data);
      })
      .catch(() => {
        if (!mounted) return;
        setProfile(null);
      })
      .finally(() => {
        if (mounted) setProfileLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  function getPageRange(currentPage) {
    const from = currentPage * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    return { from, to };
  }

  function isRangeError(err) {
    if (!err) return false;
    if (err.code?.toString?.() === "416") return true;
    const message = err.message?.toLowerCase?.() ?? "";
    return message.includes("range not satisfiable");
  }

  useEffect(() => {
    if (!isSuperAdmin) return;

    let active = true;
    async function loadAudit() {
      setLoading(true);
      setError("");
      const { fromTs, toTs } = toIsoRange(appliedFilters.dateFrom, appliedFilters.dateTo);
      const { from, to } = getPageRange(page);

      try {
        const shouldFetchRaw = appliedFilters.entityType === "all" || appliedFilters.entityType === "raw_data";
        const shouldFetchScoring =
          appliedFilters.entityType === "all" || appliedFilters.entityType === "scoring_formula";
        const shouldFetchFinalized =
          appliedFilters.entityType === "all" || appliedFilters.entityType === "finalized_week";

        const [rawResult, scoringResult, finalizedResult] = await Promise.all([
          shouldFetchRaw
            ? listRawDataAudit({
                fromTs,
                toTs,
                actorId: appliedFilters.actorId,
                action: appliedFilters.action,
                from,
                to,
              })
            : Promise.resolve({ data: [], count: 0, error: null }),
          shouldFetchScoring
            ? listScoringFormulaAudit({
                fromTs,
                toTs,
                actorId: appliedFilters.actorId,
                action: appliedFilters.action,
                from,
                to,
              })
            : Promise.resolve({ data: [], count: 0, error: null }),
          shouldFetchFinalized ? listFinalizedWeeks({ from, to }) : Promise.resolve({ data: [], count: 0, error: null }),
        ]);

        if (rawResult.error) throw rawResult.error;
        if (scoringResult.error) throw scoringResult.error;
        if (finalizedResult.error) throw finalizedResult.error;

        const normalized = [
          ...(rawResult.data || []).map(normalizeRawDataRow),
          ...(scoringResult.data || []).map(normalizeScoringFormulaRow),
          ...(finalizedResult.data || []).flatMap(normalizeFinalizedWeek),
        ];

        if (!active) return;
        setRows(normalized);
        const nextTotalCount = (rawResult.count ?? 0) + (scoringResult.count ?? 0) + (finalizedResult.count ?? 0);
        setTotalCount(nextTotalCount);
        if (normalized.length === 0 && page > 0) {
          setPage(0);
        }
      } catch (err) {
        if (!active) return;
        if (isRangeError(err) && page > 0) {
          setPage(0);
          return;
        }
        setError(err?.message || "Failed to load audit log");
        setRows([]);
        setTotalCount(0);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadAudit();

    return () => {
      active = false;
    };
  }, [appliedFilters, isSuperAdmin, page]);

  const visibleRows = useMemo(() => {
    return applyClientFilters(rows, appliedFilters, actorResolver).sort((a, b) => {
      const aTime = new Date(a.created_at || 0).getTime();
      const bTime = new Date(b.created_at || 0).getTime();
      return bTime - aTime;
    });
  }, [rows, appliedFilters, actorResolver]);

  const actionOptions = useMemo(() => {
    const actionSet = new Set(BASE_ACTIONS);
    rows.forEach(row => {
      if (row.action) actionSet.add(row.action);
    });
    return ["", ...Array.from(actionSet).sort()];
  }, [rows]);

  const totalPages = totalCount ? Math.ceil(totalCount / PAGE_SIZE) : 1;
  const hasPrev = page > 0;
  const { from } = getPageRange(page);
  const hasNext = (from + rows.length) < totalCount;

  function handleApply() {
    setPage(0);
    setAppliedFilters(filters);
  }

  function handleReset() {
    const cleared = {
      dateFrom: "",
      dateTo: "",
      entityType: "all",
      action: "",
      actorId: "",
      leaderId: "",
      search: "",
    };
    setFilters(cleared);
    setAppliedFilters(cleared);
    setPage(0);
  }

  function applyPreset(preset) {
    const now = new Date();
    if (preset === "today") {
      const today = formatDateInput(now);
      setFilters(prev => ({ ...prev, dateFrom: today, dateTo: today }));
      return;
    }
    if (preset === "last7") {
      const from = new Date(now);
      from.setDate(now.getDate() - 6);
      setFilters(prev => ({
        ...prev,
        dateFrom: formatDateInput(from),
        dateTo: formatDateInput(now),
      }));
      return;
    }
    if (preset === "month") {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      setFilters(prev => ({
        ...prev,
        dateFrom: formatDateInput(start),
        dateTo: formatDateInput(end),
      }));
    }
  }

  const filterChips = useMemo(() => {
    const chips = [];
    if (appliedFilters.dateFrom || appliedFilters.dateTo) {
      const from = appliedFilters.dateFrom || "Any";
      const to = appliedFilters.dateTo || "Any";
      chips.push({ key: "date", label: `Date: ${from} → ${to}` });
    }
    if (appliedFilters.entityType && appliedFilters.entityType !== "all") {
      chips.push({ key: "entityType", label: `Entity: ${appliedFilters.entityType}` });
    }
    if (appliedFilters.action) {
      chips.push({ key: "action", label: `Action: ${appliedFilters.action}` });
    }
    if (appliedFilters.actorId) {
      chips.push({ key: "actorId", label: `User: ${appliedFilters.actorId}` });
    }
    if (appliedFilters.leaderId) {
      chips.push({ key: "leaderId", label: `Leader ID: ${appliedFilters.leaderId}` });
    }
    if (appliedFilters.search) {
      chips.push({ key: "search", label: `Search: ${appliedFilters.search}` });
    }
    return chips;
  }, [appliedFilters]);

  function clearChip(key) {
    const next = { ...appliedFilters };
    if (key === "date") {
      next.dateFrom = "";
      next.dateTo = "";
    } else {
      next[key] = "";
    }
    setAppliedFilters(next);
    setFilters(prev => ({ ...prev, ...next }));
    setPage(0);
  }

  async function exportXlsx() {
    setExporting(true);
    setExportProgress("Preparing export…");
    const { fromTs, toTs } = toIsoRange(appliedFilters.dateFrom, appliedFilters.dateTo);
    const exportPageSize = 200;
    const getExportRange = (pageIndex) => {
      const from = pageIndex * exportPageSize;
      const to = from + exportPageSize - 1;
      return { from, to };
    };

    try {
      const allRows = [];

      async function fetchAllRaw() {
        let pageIndex = 0;
        while (true) {
          const { from, to } = getExportRange(pageIndex);
          setExportProgress(`Fetching raw data audit (offset ${from})…`);
          const result = await listRawDataAudit({
            fromTs,
            toTs,
            actorId: appliedFilters.actorId,
            action: appliedFilters.action,
            from,
            to,
          });
          if (result.error) throw result.error;
          const chunk = result.data || [];
          allRows.push(...chunk.map(normalizeRawDataRow));
          if (chunk.length < exportPageSize) break;
          pageIndex += 1;
        }
      }

      async function fetchAllScoring() {
        let pageIndex = 0;
        while (true) {
          const { from, to } = getExportRange(pageIndex);
          setExportProgress(`Fetching scoring formula audit (offset ${from})…`);
          const result = await listScoringFormulaAudit({
            fromTs,
            toTs,
            actorId: appliedFilters.actorId,
            action: appliedFilters.action,
            from,
            to,
          });
          if (result.error) throw result.error;
          const chunk = result.data || [];
          allRows.push(...chunk.map(normalizeScoringFormulaRow));
          if (chunk.length < exportPageSize) break;
          pageIndex += 1;
        }
      }

      async function fetchAllFinalized() {
        let pageIndex = 0;
        while (true) {
          const { from, to } = getExportRange(pageIndex);
          setExportProgress(`Fetching week finalizations (offset ${from})…`);
          const result = await listFinalizedWeeks({ from, to });
          if (result.error) throw result.error;
          const chunk = result.data || [];
          allRows.push(...chunk.flatMap(normalizeFinalizedWeek));
          if (chunk.length < exportPageSize) break;
          pageIndex += 1;
        }
      }

      if (appliedFilters.entityType === "all" || appliedFilters.entityType === "raw_data") {
        await fetchAllRaw();
      }
      if (appliedFilters.entityType === "all" || appliedFilters.entityType === "scoring_formula") {
        await fetchAllScoring();
      }
      if (appliedFilters.entityType === "all" || appliedFilters.entityType === "finalized_week") {
        await fetchAllFinalized();
      }

      const filtered = applyClientFilters(allRows, appliedFilters, actorResolver).sort((a, b) => {
        const aTime = new Date(a.created_at || 0).getTime();
        const bTime = new Date(b.created_at || 0).getTime();
        return bTime - aTime;
      });

      const exportRows = filtered.map(row => ({
        Created: formatDate(row.created_at),
        Entity: row.entity_type,
        Action: row.action || "-",
        Actor: getActorMeta(row).display,
        Leader: row.leader_id || "-",
        Reason: row.reason || "-",
        Source: row.source_table,
      }));
      const filename = `audit-log-${new Date().toISOString().slice(0, 10)}.xlsx`;
      exportToXlsx({ rows: exportRows, filename, sheetName: "Audit Log" });
      setExportProgress("Export complete.");
    } catch (err) {
      setError(err?.message || "Failed to export audit log");
      setExportProgress("");
    } finally {
      setExporting(false);
      setTimeout(() => setExportProgress(""), 1500);
    }
  }

  if (profileLoading) {
    return (
      <div className="card">
        <div className="card-title">Audit Log</div>
        <div className="muted">Loading profile…</div>
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="card">
        <div className="card-title">Audit Log</div>
        <div className="error-box">Not authorized. Super Admin access required.</div>
      </div>
    );
  }

  return (
    <div className="card audit-page">
      <div className="card-title">Audit Log</div>
      <div className="muted" style={{ marginBottom: 12 }}>
        Unified audit visibility across raw data edits, scoring formula changes, and week finalizations. Backend RLS
        remains authoritative.
      </div>

      <div className="filter-panel">
        <div className="filter-row">
          <div>
            <label className="form-label">From</label>
            <input
              type="date"
              className="input"
              value={filters.dateFrom}
              onChange={e => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
            />
          </div>
          <div>
            <label className="form-label">To</label>
            <input
              type="date"
              className="input"
              value={filters.dateTo}
              onChange={e => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
            />
          </div>
          <div>
            <label className="form-label">Entity</label>
            <select
              className="input"
              value={filters.entityType}
              onChange={e => setFilters(prev => ({ ...prev, entityType: e.target.value }))}
            >
              <option value="all">All</option>
              <option value="raw_data">Raw Data</option>
              <option value="scoring_formula">Scoring Formula</option>
              <option value="finalized_week">Finalized Week</option>
            </select>
          </div>
          <div>
            <label className="form-label">Action</label>
            <select
              className="input"
              value={filters.action}
              onChange={e => setFilters(prev => ({ ...prev, action: e.target.value }))}
            >
              {actionOptions.map(option => (
                <option key={option || "all"} value={option}>
                  {option || "All"}
                </option>
              ))}
            </select>
          </div>
        </div>
        {showAdvanced ? (
          <div className="filter-row">
            <div>
              <label className="form-label">User (email or UUID)</label>
              <input
                type="text"
                className="input"
                placeholder="Email or UUID"
                value={filters.actorId}
                onChange={e => setFilters(prev => ({ ...prev, actorId: e.target.value }))}
              />
            </div>
            <div>
              <label className="form-label">Leader ID</label>
              <input
                type="text"
                className="input"
                placeholder="agent_id"
                value={filters.leaderId}
                onChange={e => setFilters(prev => ({ ...prev, leaderId: e.target.value }))}
              />
            </div>
            <div>
              <label className="form-label">Search</label>
              <input
                type="text"
                className="input"
                placeholder="Reason, actor, leader"
                value={filters.search}
                onChange={e => setFilters(prev => ({ ...prev, search: e.target.value }))}
              />
            </div>
          </div>
        ) : null}
        <div className="filter-actions">
          <div className="filter-actions__main">
            <button type="button" className="button primary" onClick={handleApply} disabled={loading}>
              Apply
            </button>
            <button type="button" className="button secondary" onClick={handleReset} disabled={loading}>
              Reset
            </button>
            <button
              type="button"
              className="button ghost"
              onClick={() => setShowAdvanced(prev => !prev)}
            >
              {showAdvanced ? "Hide Advanced" : "Advanced Filters"}
            </button>
          </div>
          <ExportButton onClick={exportXlsx} loading={exporting} disabled={loading} label="Export XLSX" />
          {exportProgress ? <div className="muted" style={{ alignSelf: "center" }}>{exportProgress}</div> : null}
        </div>
      </div>

      {filterChips.length ? (
        <div className="filter-chips">
          {filterChips.map(chip => (
            <button
              type="button"
              key={chip.key}
              className="filter-chip"
              onClick={() => clearChip(chip.key)}
              title="Remove filter"
            >
              {chip.label} <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      ) : null}

      {error ? (
        <div className="error-box" role="alert" style={{ marginBottom: 12 }}>
          {error}
        </div>
      ) : null}

      {loading ? <div className="muted" style={{ marginBottom: 12 }}>Loading audit log…</div> : null}

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Created</th>
              <th>Entity</th>
              <th>Action</th>
              <th>Actor</th>
              <th>Leader</th>
              <th>Reason</th>
              <th>Source</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map(row => {
              const actorMeta = getActorMeta(row);
              return (
                <tr key={row.id}>
                  <td>{formatDate(row.created_at)}</td>
                  <td>{row.entity_type}</td>
                  <td>{row.action || "—"}</td>
                  <td title={actorMeta.actorId || undefined}>
                    <div>{actorMeta.display}</div>
                  </td>
                  <td>{row.leader_id || "—"}</td>
                  <td title={row.reason}>{truncate(row.reason)}</td>
                  <td>{row.source_table}</td>
                  <td>
                    <button
                      type="button"
                      className="btn-link icon-btn"
                      onClick={() => setDetailRow(row)}
                      aria-label="View details"
                    >
                      <EyeIcon />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <AppPagination
        count={totalPages}
        page={page + 1}
        onChange={value => setPage(value - 1)}
        totalItems={totalCount}
        pageSize={PAGE_SIZE}
      />

      {detailRow ? (
        <ModalForm
          isOpen={!!detailRow}
          title="Audit Entry"
          onClose={() => setDetailRow(null)}
          onOverlayClose={() => setDetailRow(null)}
          onSubmit={(e) => e.preventDefault()}
          footer={(
            <button type="button" className="button secondary" onClick={() => setDetailRow(null)}>
              Close
            </button>
          )}
        >
          <div className="audit-entry">
            <div className="audit-entry__pills">
              <span className="audit-pill audit-pill--primary">{detailRow.action || "-"}</span>
              <span className="audit-pill">{detailRow.entity_type}</span>
              <span className="audit-pill">{detailRow.source_table}</span>
              <span className="audit-pill audit-pill--muted">{formatDate(detailRow.created_at)}</span>
            </div>

            <div className="audit-entry__grid">
              <div>
                <div className="audit-entry__label">Actor</div>
                <div className="audit-entry__value">{getActorMeta(detailRow).display}</div>
              </div>
              <div>
                <div className="audit-entry__label">Actor ID</div>
                <div className="audit-entry__value">{detailRow.actor_id || "-"}</div>
              </div>
              <div>
                <div className="audit-entry__label">Entity ID</div>
                <div className="audit-entry__value">{detailRow.entity_id || "-"}</div>
              </div>
              <div>
                <div className="audit-entry__label">Leader ID</div>
                <div className="audit-entry__value">{detailRow.leader_id || "-"}</div>
              </div>
              <div className="audit-entry__wide">
                <div className="audit-entry__label">Reason</div>
                <div className="audit-entry__value">{detailRow.reason || "-"}</div>
              </div>
            </div>

            <div className="audit-entry__blocks">
              <details open>
                <summary>Before</summary>
                <pre className="audit-entry__code">
                  {detailRow.before ? JSON.stringify(detailRow.before, null, 2) : "-"}
                </pre>
              </details>
              <details open>
                <summary>After</summary>
                <pre className="audit-entry__code">
                  {detailRow.after ? JSON.stringify(detailRow.after, null, 2) : "-"}
                </pre>
              </details>
              <details>
                <summary>Meta</summary>
                <pre className="audit-entry__code">
                  {detailRow.meta ? JSON.stringify(detailRow.meta, null, 2) : "-"}
                </pre>
              </details>
            </div>
          </div>
        </ModalForm>
      ) : null}
    </div>
  );
}
