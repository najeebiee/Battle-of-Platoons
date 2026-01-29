import React, { useEffect, useMemo, useState } from "react";
import "./finalization.css";
import { Navigate } from "react-router-dom";
import {
  finalizeWeek,
  getWeekStatusByDate,
  listRecentWeeks,
  reopenWeek,
} from "../services/finalization.service";
import { getMyProfile } from "../services/profile.service";

function formatDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function StatusBadge({ status }) {
  const label = status === "finalized" ? "Finalized" : "Open";
  const cls = status === "finalized" ? "valid" : "muted";
  return <span className={`status-pill ${cls}`}>{label}</span>;
}

export default function Finalization() {
  const [selectedDate, setSelectedDate] = useState(formatDateInput(new Date()));
  const [week, setWeek] = useState(null);
  const [recentWeeks, setRecentWeeks] = useState([]);
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

  async function refreshWeek(dateStr) {
    setLoadingWeek(true);
    setError("");
    try {
      const data = await getWeekStatusByDate(dateStr);
      setWeek(data);
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
          <label className="form-label" htmlFor="week-date">
            Pick any date within the week
          </label>
          <input
            id="week-date"
            type="date"
            value={selectedDate}
            onChange={e => {
              setSelectedDate(e.target.value);
              setActionError("");
            }}
            style={{ maxWidth: 240 }}
          />

          <div className="week-status-card">
            <div className="week-status-row">
              <div>
                <div className="muted" style={{ fontSize: 12 }}>
                  Week
                </div>
                <div style={{ fontWeight: 800, fontSize: 18 }}>{week?.week_key || "—"}</div>
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
            <div style={{ fontWeight: 800, marginBottom: 6 }}>
              {week?.status === "finalized" ? "Reopen week" : "Finalize week"}
            </div>
            <div className="muted" style={{ marginBottom: 8 }}>
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
                  className="button primary"
                  onClick={handleReopen}
                  disabled={!isSuperAdmin || actionLoading || reopenReason.trim().length < 5}
                  style={{ marginTop: 10 }}
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
                  className="button primary"
                  onClick={handleFinalize}
                  disabled={!isSuperAdmin || actionLoading || finalizeReason.trim().length < 5}
                  style={{ marginTop: 10 }}
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
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
              {recentWeeks.map(weekRow => {
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
      </div>
    </div>
  );
}
