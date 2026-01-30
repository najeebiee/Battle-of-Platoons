import React, { useEffect, useMemo, useState } from "react";
import "../styles/pages/finalization.css";
import { Navigate } from "react-router-dom";
import AppPagination from "../components/AppPagination";
import {
  finalizeWeek,
  getWeekStatusByDate,
  listRecentWeeks,
  reopenWeek,
} from "../services/finalization.service";
import { supabase } from "../services/supabase";
import { getMyProfile } from "../services/profile.service";

function formatDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toIsoWeekKey(date) {
  const ref = new Date(date);
  if (Number.isNaN(ref.getTime())) return null;
  const utcDate = new Date(Date.UTC(ref.getFullYear(), ref.getMonth(), ref.getDate()));
  const day = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((utcDate - yearStart) / 86400000 + 1) / 7);
  return `${utcDate.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function computeWeekRange(dateStr) {
  const ref = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(ref.getTime())) return { start: dateStr, end: dateStr };
  const day = ref.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  const start = new Date(ref);
  start.setUTCDate(ref.getUTCDate() - diff);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function StatusBadge({ status }) {
  const label = status === "finalized" ? "Finalized" : "Open";
  const cls = status === "finalized" ? "valid" : "muted";
  return <span className={`status-pill ${cls}`}>{label}</span>;
}

export default function Finalization() {
  const [selectedDate, setSelectedDate] = useState(formatDateInput(new Date()));
  const [selectedWeekKey, setSelectedWeekKey] = useState("");
  const [week, setWeek] = useState(null);
  const [recentWeeks, setRecentWeeks] = useState([]);
  const [historyPage, setHistoryPage] = useState(1);
  const historyRowsPerPage = 10;
  const [loadingWeek, setLoadingWeek] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);

  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [finalizeReason, setFinalizeReason] = useState("");
  const [reopenReason, setReopenReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const isSuperAdmin = profile?.role === "super_admin";

  const rangeLabel = useMemo(() => {
    if (!week?.start_date || !week?.end_date) return "Select a date to load the week range";
    return `${week.start_date} → ${week.end_date}`;
  }, [week]);

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
      .finally(() => {
        if (mounted) setProfileLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    refreshWeek(selectedDate);
  }, [selectedDate]);

  useEffect(() => {
    refreshHistory();
  }, []);

  const weekOptions = useMemo(() => {
    return [...recentWeeks].sort((a, b) => (a.start_date || "").localeCompare(b.start_date || ""));
  }, [recentWeeks]);

  useEffect(() => {
    setHistoryPage(1);
  }, [recentWeeks.length]);

  const historyPageCount = Math.max(1, Math.ceil(recentWeeks.length / historyRowsPerPage));

  useEffect(() => {
    if (historyPage > historyPageCount) {
      setHistoryPage(historyPageCount);
    }
  }, [historyPage, historyPageCount]);

  const pagedWeeks = useMemo(() => {
    const start = (historyPage - 1) * historyRowsPerPage;
    return recentWeeks.slice(start, start + historyRowsPerPage);
  }, [historyPage, historyRowsPerPage, recentWeeks]);

  useEffect(() => {
    if (!selectedWeekKey && weekOptions.length) {
      setSelectedWeekKey(weekOptions[0].week_key);
      if (weekOptions[0].start_date) {
        setSelectedDate(weekOptions[0].start_date);
      }
    }
  }, [selectedWeekKey, weekOptions]);

  async function refreshWeek(dateStr) {
    setLoadingWeek(true);
    setError("");
    try {
      const data = await getWeekStatusByDate(dateStr);
      setWeek(data);
      if (data?.week_key) {
        setSelectedWeekKey(data.week_key);
      }
    } catch (e) {
      console.error(e);
      setWeek(null);
      setError(e?.message || "Failed to load week status");
    } finally {
      setLoadingWeek(false);
    }
  }

  async function refreshHistory() {
    setLoadingHistory(true);
    try {
      const today = new Date();
      const prev = new Date(today);
      prev.setDate(today.getDate() - 7);
      await supabase.rpc("ensure_week_row", { d: formatDateInput(today) });
      await supabase.rpc("ensure_week_row", { d: formatDateInput(prev) });
      const history = await listRecentWeeks(10);
      setRecentWeeks(history ?? []);
    } catch (e) {
      console.error(e);
      setError(prev => prev || e?.message || "Failed to load week history");
    } finally {
      setLoadingHistory(false);
    }
  }

  async function handleFinalize() {
    if (!isSuperAdmin) {
      setActionError("Only Super Admins can finalize a week.");
      return;
    }
    if (finalizeReason.trim().length < 5) {
      setActionError("Reason must be at least 5 characters.");
      return;
    }

    setActionLoading(true);
    setActionError("");
    try {
      await finalizeWeek(selectedDate, finalizeReason);
      setFinalizeReason("");
      await refreshWeek(selectedDate);
      await refreshHistory();
    } catch (e) {
      console.error(e);
      setActionError(e?.message || "Failed to finalize week");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleReopen() {
    if (!isSuperAdmin) {
      setActionError("Only Super Admins can reopen a week.");
      return;
    }
    if (reopenReason.trim().length < 5) {
      setActionError("Reason must be at least 5 characters.");
      return;
    }

    setActionLoading(true);
    setActionError("");
    try {
      await reopenWeek(selectedDate, reopenReason);
      setReopenReason("");
      await refreshWeek(selectedDate);
      await refreshHistory();
    } catch (e) {
      console.error(e);
      setActionError(e?.message || "Failed to reopen week");
    } finally {
      setActionLoading(false);
    }
  }

  if (!profileLoading && !isSuperAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="card">
      <div className="card-title">Week Finalization</div>
      <div className="muted" style={{ marginBottom: 12 }}>
        Finalize a week to lock uploads, edits, voids, approvals, and overwrites for that range. Only Super
        Admins can finalize or reopen weeks.
      </div>

      {!profileLoading && !isSuperAdmin ? (
        <div className="hint" style={{ marginBottom: 12 }}>
          You can view week status and history, but only Super Admins can finalize or reopen a week.
        </div>
      ) : null}

      {error ? (
        <div className="error-box" role="alert">
          {error}
        </div>
      ) : null}

      <div className="finalization-grid">
        <div className="finalization-panel">
          <label className="form-label" htmlFor="week-select">
            Select week
          </label>
          <div className="finalization-date">
            <select
              id="week-select"
              className="input"
              value={selectedWeekKey}
              onChange={e => {
                const nextKey = e.target.value;
                setSelectedWeekKey(nextKey);
                const match = weekOptions.find(w => w.week_key === nextKey);
                if (match?.start_date) setSelectedDate(match.start_date);
                setActionError("");
              }}
            >
              {weekOptions.map(weekRow => (
                <option key={weekRow.week_key} value={weekRow.week_key}>
                  {weekRow.week_key} ({weekRow.start_date} → {weekRow.end_date})
                </option>
              ))}
            </select>
            <div className="muted" style={{ fontSize: 12 }}>
              Choose a week to load its status and actions.
            </div>
          </div>

          <div className="week-status-card">
            <div className="week-status-card__header">
              <div className="week-status-card__meta">
                <div className="week-status-card__label">Week</div>
                <div className="week-status-card__value">{week?.week_key || "—"}</div>
              </div>
              <StatusBadge status={week?.status} />
            </div>

            <div className="week-range">{rangeLabel}</div>

            <div className="week-meta">
              <div>
                <div className="meta-label">Finalized</div>
                <div className="meta-value">
                  {week?.finalized_at ? (
                    <>
                      <div>{new Date(week.finalized_at).toLocaleString()}</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        By {week.finalized_by || "Unknown"}
                      </div>
                      {week.finalize_reason ? (
                        <div className="muted" style={{ marginTop: 4 }}>{week.finalize_reason}</div>
                      ) : null}
                    </>
                  ) : (
                    "—"
                  )}
                </div>
              </div>
              <div>
                <div className="meta-label">Reopened</div>
                <div className="meta-value">
                  {week?.reopened_at ? (
                    <>
                      <div>{new Date(week.reopened_at).toLocaleString()}</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        By {week.reopened_by || "Unknown"}
                      </div>
                      {week.reopen_reason ? (
                        <div className="muted" style={{ marginTop: 4 }}>{week.reopen_reason}</div>
                      ) : null}
                    </>
                  ) : (
                    "—"
                  )}
                </div>
              </div>
            </div>
          </div>

          {loadingWeek ? <div className="muted">Loading week status…</div> : null}
        </div>

        <div className="finalization-actions">
          <div className="action-card">
            <div className="action-card__title">
              {week?.status === "finalized" ? "Reopen week" : "Finalize week"}
            </div>
            <div className="action-card__note">
              Provide an audit reason (minimum 5 characters).
            </div>

            {week?.status === "finalized" ? (
              <>
                <textarea
                  className="input"
                  rows={3}
                  value={reopenReason}
                  onChange={e => setReopenReason(e.target.value)}
                  placeholder="Reason to reopen"
                />
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  Reopening makes the week editable again for admins.
                </div>

                <button
                  type="button"
                  className="button primary action-card__cta"
                  onClick={handleReopen}
                  disabled={!isSuperAdmin || actionLoading || reopenReason.trim().length < 5}
                >
                  {actionLoading ? "Working…" : "Reopen"}
                </button>
              </>
            ) : (
              <>
                <textarea
                  className="input"
                  rows={3}
                  value={finalizeReason}
                  onChange={e => setFinalizeReason(e.target.value)}
                  placeholder="Reason to finalize"
                />
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  Finalizing locks uploads, edits, voids, and approvals for the week.
                </div>

                <button
                  type="button"
                  className="button primary action-card__cta"
                  onClick={handleFinalize}
                  disabled={!isSuperAdmin || actionLoading || finalizeReason.trim().length < 5}
                >
                  {actionLoading ? "Working…" : "Finalize"}
                </button>
              </>
            )}

            {actionError ? (
              <div className="error-box" role="alert" style={{ marginTop: 10 }}>
                {actionError}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="finalization-history">
        <div className="finalization-history__header">
          <div style={{ fontWeight: 800 }}>Recent weeks</div>
          {loadingHistory ? <div className="muted">Loading…</div> : null}
        </div>

        <div className="table-scroll" style={{ marginTop: 8 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Week</th>
                <th>Range</th>
                <th>Status</th>
                <th>Finalized</th>
                <th>Reopened</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {pagedWeeks.map(weekRow => {
                const displayReason =
                  weekRow.status === "finalized"
                    ? weekRow.finalize_reason
                    : weekRow.reopen_reason || weekRow.finalize_reason;

                return (
                  <tr key={weekRow.week_key || `${weekRow.start_date}-${weekRow.end_date}`}>
                    <td>{weekRow.week_key}</td>
                    <td>
                      <div>{weekRow.start_date} → {weekRow.end_date}</div>
                    </td>
                    <td>
                      <StatusBadge status={weekRow.status} />
                    </td>
                    <td>
                      {weekRow.finalized_at ? (
                        <>
                          <div>{new Date(weekRow.finalized_at).toLocaleString()}</div>
                          <div className="muted" style={{ fontSize: 12 }}>{weekRow.finalized_by || "—"}</div>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      {weekRow.reopened_at ? (
                        <>
                          <div>{new Date(weekRow.reopened_at).toLocaleString()}</div>
                          <div className="muted" style={{ fontSize: 12 }}>{weekRow.reopened_by || "—"}</div>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td style={{ maxWidth: 260 }}>
                      {displayReason ? <span className="muted">{displayReason}</span> : "—"}
                    </td>
                  </tr>
                );
              })}

              {!recentWeeks.length && !loadingHistory ? (
                <tr>
                  <td colSpan={6} className="muted" style={{ textAlign: "center" }}>
                    No week records yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <AppPagination count={historyPageCount} page={historyPage} onChange={setHistoryPage} />
      </div>
    </div>
  );
}
