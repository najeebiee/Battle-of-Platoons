import React, { useEffect, useState } from "react";
import "../styles/pages/formulas.css";
import {
  listAllFormulasForSuperAdmin,
  listPublishedFormulas,
  listAudit,
  updateDraft,
  publishDraft,
  createDraft,
} from "../services/scoringFormula.service";
import { getMyProfile } from "../services/profile.service";
import { computeMetricScore, computeTotalScore } from "../services/scoringEngine";

export default function ScoringFormulas() {
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState("");

  const [formulas, setFormulas] = useState([]);
  const [formulasLoading, setFormulasLoading] = useState(true);
  const [formulasError, setFormulasError] = useState("");

  const [selectedId, setSelectedId] = useState(null);
  const [selectedFormula, setSelectedFormula] = useState(null);

  const isSuperAdmin = profile?.role === "super_admin";

  const [draftLabel, setDraftLabel] = useState("");
  const [draftStartWeekKey, setDraftStartWeekKey] = useState("");
  const [draftEndWeekKey, setDraftEndWeekKey] = useState("");
  const [draftMetrics, setDraftMetrics] = useState([]);
  const [reasonText, setReasonText] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saveLoading, setSaveLoading] = useState(false);
  const [publishLoading, setPublishLoading] = useState(false);
  const [publishError, setPublishError] = useState("");
  const [createModal, setCreateModal] = useState({
    open: false,
    battleType: "depots",
    label: "",
    start: "",
    end: "",
    reason: "",
    loading: false,
    error: "",
  });

  const [previewInputs, setPreviewInputs] = useState({
    leads: "0",
    payins: "0",
    sales: "0",
  });

  const [auditEntries, setAuditEntries] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState("");

  useEffect(() => {
    let mounted = true;
    setProfileLoading(true);
    getMyProfile()
      .then(data => {
        if (!mounted) return;
        setProfile(data);
      })
      .catch(err => {
        if (!mounted) return;
        setProfileError(err?.message || "Failed to load profile");
      })
      .finally(() => {
        if (mounted) setProfileLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (profileLoading) return;
    let mounted = true;
    setFormulasLoading(true);
    setFormulasError("");

    const loader = isSuperAdmin ? listAllFormulasForSuperAdmin : listPublishedFormulas;
    loader()
      .then(({ data, error }) => {
        if (!mounted) return;
        if (error) {
          setFormulasError(error.message || "Failed to load formulas");
          setFormulas([]);
          return;
        }
        setFormulas(data ?? []);
        if (!selectedId && (data?.length ?? 0) > 0) {
          setSelectedId(data[0].id);
        }
      })
      .catch(err => {
        if (!mounted) return;
        setFormulasError(err?.message || "Failed to load formulas");
      })
      .finally(() => {
        if (mounted) setFormulasLoading(false);
      });

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileLoading, isSuperAdmin]);

  useEffect(() => {
    const found = formulas.find(f => f.id === selectedId) || null;
    setSelectedFormula(found);
  }, [formulas, selectedId]);

  const isPublished = selectedFormula?.status === "published";
  const isEditable = isSuperAdmin && selectedFormula && !isPublished;
  const isDepotBattle =
    String(selectedFormula?.battle_type || "").toLowerCase() === "depot" ||
    String(selectedFormula?.battle_type || "").toLowerCase() === "depots";

  function Stepper({ id, value, onChange, step = 50, min = 0, disabled = false }) {
    return (
      <div className="row" style={{ gap: "8px", alignItems: "center" }}>
        <button
          type="button"
          className="btn ghost"
          disabled={disabled || value <= min}
          onClick={() => onChange(Math.max(min, (Number(value) || 0) - step))}
        >
          −
        </button>
        <input
          id={id}
          type="number"
          min={min}
          step={step}
          value={value}
          onChange={e => onChange(Math.max(min, Number(e.target.value) || 0))}
          style={{ flex: 1 }}
          disabled={disabled}
        />
        <button
          type="button"
          className="btn ghost"
          disabled={disabled}
          onClick={() => onChange((Number(value) || 0) + step)}
        >
          +
        </button>
      </div>
    );
  }

  function clampNonNegative(value) {
    const num = Number(value);
    if (Number.isNaN(num)) return 0;
    return Math.max(0, num);
  }

  function getAllowedMetricKeys(battleType) {
    if (battleType === "depots") {
      return ["leads", "sales"];
    }
    return ["leads", "payins", "sales"];
  }

  function getDefaultMetrics(battleType) {
    if (battleType === "depots") {
      return [
        { key: "leads", divisor: 500, maxPoints: 400 },
        { key: "sales", divisor: 3_000_000, maxPoints: 600 },
      ];
    }
    return [
      { key: "leads", divisor: 500, maxPoints: 400 },
      { key: "payins", divisor: 200, maxPoints: 200 },
      { key: "sales", divisor: 3_000_000, maxPoints: 400 },
    ];
  }

  function normalizeMetrics(formula) {
    const sourceMetrics =
      formula?.config?.metrics ??
      formula?.metrics?.metrics ??
      formula?.metrics ??
      formula?.config ??
      [];
    const metricsArray = Array.isArray(sourceMetrics) ? sourceMetrics : [];
    const allowedKeys = getAllowedMetricKeys(formula?.battle_type);
    return allowedKeys.map(key => {
      const existing = metricsArray.find(m => m.key === key || m.metric === key || m.name === key);
      return {
        key,
        divisor: Number(existing?.divisor ?? existing?.division ?? 0),
        maxPoints: Number(existing?.maxPoints ?? existing?.max_points ?? existing?.points ?? 0),
      };
    });
  }

  useEffect(() => {
    if (!selectedFormula) return;

    setDraftLabel(selectedFormula.label || selectedFormula.name || selectedFormula.title || "");
    setDraftStartWeekKey(
      selectedFormula.effective_start_week_key ||
        selectedFormula.start_week_key ||
        selectedFormula.start_week ||
        ""
    );
    setDraftEndWeekKey(
      selectedFormula.effective_end_week_key ||
        selectedFormula.end_week_key ||
        selectedFormula.end_week ||
        ""
    );
    setDraftMetrics(normalizeMetrics(selectedFormula));
    setReasonText("");
    setSaveError("");
    setPublishError("");
    setPreviewInputs({ leads: "0", payins: "0", sales: "0" });
  }, [selectedFormula]);

  useEffect(() => {
    if (!selectedId) return;
    let mounted = true;
    setAuditLoading(true);
    setAuditError("");
    listAudit(selectedId)
      .then(({ data, error }) => {
        if (!mounted) return;
        if (error) {
          setAuditError(error.message || "Failed to load audit log");
          setAuditEntries([]);
          return;
        }
        setAuditEntries(data ?? []);
      })
      .catch(err => {
        if (!mounted) return;
        setAuditError(err?.message || "Failed to load audit log");
      })
      .finally(() => {
        if (mounted) setAuditLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [selectedId]);

  function handleMetricChange(targetKey, field, value) {
    setDraftMetrics(prev =>
      prev.map(metric =>
        metric.key === targetKey
          ? { ...metric, [field]: value === "" ? "" : Number(value) }
          : metric
      )
    );
  }

  async function handleSaveDraft() {
    if (!isEditable) return;
    setSaveError("");

    const trimmedReason = reasonText?.trim() || "";
    if (!trimmedReason) {
      setSaveError("Reason is required.");
      return;
    }

    const payloadMetrics = {
      metrics: draftMetrics.map(m => ({
        key: m.key,
        divisor: Number(m.divisor) || 0,
        maxPoints: Number(m.maxPoints) || 0,
      })),
    };

    setSaveLoading(true);
    const { data, error } = await updateDraft({
      formula_id: selectedId,
      label: draftLabel,
      effective_start_week_key: draftStartWeekKey,
      effective_end_week_key: draftEndWeekKey || null,
      config: payloadMetrics,
      reason: trimmedReason,
    });
    setSaveLoading(false);

    if (error) {
      setSaveError(error.message || "Failed to save draft");
      return;
    }

    if (data) {
      setFormulas(current =>
        current.map(f => (f.id === selectedId ? { ...f, ...data } : f))
      );
    }
  }

  async function handlePublish() {
    if (!isEditable) return;

    const confirm = window.confirm("Publish this formula? This action is irreversible.");
    if (!confirm) return;

    setPublishError("");

    const trimmedReason = reasonText?.trim() || "";
    if (!trimmedReason) {
      setPublishError("Reason is required to publish.");
      return;
    }

    setPublishLoading(true);
    const { data, error } = await publishDraft(selectedId, trimmedReason);
    setPublishLoading(false);

    if (error) {
      setPublishError(error.message || "Failed to publish draft");
      return;
    }

    if (data) {
      setFormulas(current =>
        current.map(f =>
          f.id === selectedId ? { ...f, ...data, status: "published" } : f
        )
      );
    } else {
      setFormulas(current =>
        current.map(f =>
          f.id === selectedId ? { ...f, status: "published" } : f
        )
      );
    }
  }

  function getTotals() {
    const leads = clampNonNegative(previewInputs.leads);
    const payins = isDepotBattle ? 0 : clampNonNegative(previewInputs.payins);
    const sales = clampNonNegative(previewInputs.sales);
    return { leads, payins, sales };
  }

  const allowedPreviewKeys = getAllowedMetricKeys(selectedFormula?.battle_type);
  const basePreviewMetrics = isEditable ? draftMetrics : normalizeMetrics(selectedFormula);
  const previewMetrics = Array.isArray(basePreviewMetrics)
    ? basePreviewMetrics.filter(metric => allowedPreviewKeys.includes(metric.key))
    : [];
  const previewTotals = getTotals();
  const previewTotalScore = computeTotalScore(selectedFormula?.battle_type, previewTotals, {
    metrics: Array.isArray(previewMetrics)
      ? previewMetrics.map(metric => ({
          ...metric,
          divisor: Number(metric.divisor) || 0,
          maxPoints: Number(metric.maxPoints) || 0,
        }))
      : [],
  });

  function renderDetails() {
    if (formulasLoading) {
      return <div className="muted">Loading formula details…</div>;
    }
    if (formulasError) {
      return <div className="error">{formulasError}</div>;
    }
    if (!selectedFormula) {
      return <div className="muted">Select a formula to view details.</div>;
    }

    const fields = [
      { label: "Label", value: selectedFormula.label || "(Untitled)" },
      { label: "Status", value: selectedFormula.status || "unknown" },
      { label: "Version", value: selectedFormula.version ?? selectedFormula.revision ?? "—" },
    ];

    const displayMetrics = isEditable ? draftMetrics : normalizeMetrics(selectedFormula);
    const totalPoints = displayMetrics.reduce(
      (sum, metric) => sum + (Number(metric.maxPoints) || 0),
      0
    );
    const totalPointsValid = totalPoints === 1000;
    const divisorsValid =
      displayMetrics.filter(m => Number(m.divisor) > 0 || !isEditable).length ===
      displayMetrics.length;

    return (
      <div className="stack">
        <div className="muted">
          {isSuperAdmin
            ? isPublished
              ? "Published formulas are read-only."
              : "Super Admin view — edit draft details and publish when ready."
            : "Read-only view — contact a Super Admin for changes."}
        </div>
        <div className="grid two">
          {fields.map(field => (
            <div key={field.label} className="stack xs">
              <div className="label">{field.label}</div>
              <div className="value">{field.value}</div>
            </div>
          ))}
        </div>
        {isEditable ? (
          <div className="stack sm">
            <div className="stack xs">
              <label className="label" htmlFor="formula-name">
                Label
              </label>
              <input
                id="formula-name"
                type="text"
                value={draftLabel}
                onChange={e => setDraftLabel(e.target.value)}
              />
            </div>
            <div className="grid two" style={{ gap: "12px" }}>
              <div className="stack xs">
                <div className="label">Effective Start Week</div>
                <input
                  type="text"
                  value={draftStartWeekKey}
                  onChange={e => setDraftStartWeekKey(e.target.value)}
                  disabled={!isEditable}
                />
              </div>
              <div className="stack xs">
                <div className="label">Effective End Week</div>
                <input
                  type="text"
                  value={draftEndWeekKey}
                  onChange={e => setDraftEndWeekKey(e.target.value)}
                  disabled={!isEditable}
                />
              </div>
            </div>
            <div className="stack sm">
              <div className="label">Metrics</div>
              <div className="stack sm">
                {displayMetrics.map(metric => {
                  const percent =
                    totalPoints > 0
                      ? (((Number(metric.maxPoints) || 0) / totalPoints) * 100).toFixed(2)
                      : "0.00";
                  const name =
                    metric.key === "leads"
                      ? "Leads"
                      : metric.key === "payins"
                        ? "Pay-ins"
                        : "Sales";
                  return (
                    <div key={metric.key} className="card" style={{ padding: "12px" }}>
                      <div className="row between" style={{ marginBottom: "8px" }}>
                        <div className="label">{name}</div>
                        <div className="muted">{percent}% of total</div>
                      </div>
                      <div className="grid two" style={{ gap: "12px" }}>
                        <div className="stack xs">
                          <label className="label" htmlFor={`divisor-${metric.key}`}>
                            Divisor
                          </label>
                          <Stepper
                            id={`divisor-${metric.key}`}
                            value={metric.divisor}
                            step={metric.key === "sales" ? 10000 : 10}
                            min={0}
                            disabled={!isEditable}
                            onChange={val => handleMetricChange(metric.key, "divisor", val)}
                          />
                        </div>
                        <div className="stack xs">
                          <label className="label" htmlFor={`max-${metric.key}`}>
                            Max Points
                          </label>
                          <Stepper
                            id={`max-${metric.key}`}
                            value={metric.maxPoints}
                            step={50}
                            min={0}
                            disabled={!isEditable}
                            onChange={val => handleMetricChange(metric.key, "maxPoints", val)}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className={`card ${totalPointsValid ? "muted" : "error"}`} style={{ padding: "12px" }}>
              <div className="row between">
                <div className="label">Total Points</div>
                <div className="value">
                  {totalPoints} / 1000
                </div>
              </div>
              {!totalPointsValid && (
                <div className="muted">Total points must equal 1000 to save or publish.</div>
              )}
              {!divisorsValid && (
                <div className="muted">Divisors must be greater than 0.</div>
              )}
            </div>
            <div className="stack xs">
              <label className="label" htmlFor="reason">
                Reason (required)
              </label>
              <textarea
                id="reason"
                rows={3}
                value={reasonText}
                onChange={e => setReasonText(e.target.value)}
                disabled={!isEditable}
              />
            </div>
            {saveError && <div className="error">{saveError}</div>}
            {publishError && <div className="error">{publishError}</div>}
            <div className="row" style={{ gap: "8px" }}>
              <button
                className="btn primary"
                onClick={handleSaveDraft}
                disabled={
                  saveLoading || !totalPointsValid || !reasonText.trim() || !divisorsValid
                }
              >
                {saveLoading ? "Saving…" : "Save Draft"}
              </button>
              <button
                className="btn"
                onClick={handlePublish}
                disabled={
                  publishLoading ||
                  isPublished ||
                  !totalPointsValid ||
                  !reasonText.trim() ||
                  !divisorsValid
                }
              >
                {publishLoading ? "Publishing…" : "Publish"}
              </button>
            </div>
          </div>
        ) : (
          <div className="stack sm">
            <div className="label">Metrics</div>
            <div className="stack sm">
              {displayMetrics.map(metric => {
                const percent =
                  totalPoints > 0
                    ? (((Number(metric.maxPoints) || 0) / totalPoints) * 100).toFixed(2)
                    : "0.00";
                const name =
                  metric.key === "leads"
                    ? "Leads"
                    : metric.key === "payins"
                      ? "Pay-ins"
                      : "Sales";
                return (
                  <div key={metric.key} className="card muted" style={{ padding: "12px" }}>
                    <div className="row between" style={{ marginBottom: "8px" }}>
                      <div className="label">{name}</div>
                      <div className="muted">{percent}% of total</div>
                    </div>
                    <div className="grid two" style={{ gap: "12px" }}>
                      <div className="stack xs">
                        <div className="label">Divisor</div>
                        <div className="value">{metric.divisor}</div>
                      </div>
                      <div className="stack xs">
                        <div className="label">Max Points</div>
                        <div className="value">{metric.maxPoints}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <div className="stack sm">
          <div className="label">Preview Calculator</div>
          <div className="grid three" style={{ gap: "8px" }}>
            {["leads", "payins", "sales"]
              .filter(key => !(isDepotBattle && key === "payins"))
              .map(key => (
                <div className="stack xs" key={key}>
                  <label className="label" htmlFor={`preview-${key}`}>
                    {key.charAt(0).toUpperCase() + key.slice(1)}
                  </label>
                  <input
                    id={`preview-${key}`}
                    type="number"
                    value={previewInputs[key]}
                    min={0}
                    onChange={e =>
                      setPreviewInputs(prev => ({
                        ...prev,
                        [key]: String(clampNonNegative(e.target.value)),
                      }))
                    }
                  />
                </div>
              ))}
          </div>
          {previewMetrics.length === 0 ? (
            <div className="muted">No metrics configured for preview.</div>
          ) : (
            <div className="stack xs">
              <div className="label">Per-metric Breakdown</div>
              <div className="stack xs">
                {previewMetrics.map(metric => {
                  const key = metric?.key ?? metric?.name ?? metric?.metric ?? "metric";
                  const divisor = metric?.divisor ?? metric?.division ?? 0;
                  const maxPoints = metric?.maxPoints ?? metric?.max_points ?? metric?.points ?? 0;
                  const actual = previewTotals[key] ?? 0;
                  const score = computeMetricScore(actual, divisor, maxPoints);
                  const formulaText =
                    divisor > 0
                      ? `${actual} ÷ ${divisor} × ${maxPoints} (cap ${maxPoints})`
                      : "Divisor must be > 0";
                  return (
                    <div key={key} className="card" style={{ padding: "8px" }}>
                      <div className="row between">
                        <div>{key}</div>
                        <div className="muted">
                          {score.toFixed(2)} / {maxPoints}
                        </div>
                      </div>
                      <div className="muted">{formulaText}</div>
                    </div>
                  );
                })}
              </div>
              <div className="row between">
                <div className="label">Total</div>
                <div className="value">{previewTotalScore.toFixed(2)}</div>
              </div>
            </div>
          )}
        </div>
        <div className="stack sm">
          <div className="label">Audit Log</div>
          {auditLoading && <div className="muted">Loading audit…</div>}
          {auditError && <div className="error">{auditError}</div>}
          {!auditLoading && !auditError && auditEntries.length === 0 && (
            <div className="muted">No audit entries yet.</div>
          )}
          {!auditLoading && !auditError && auditEntries.length > 0 && (
            <div className="stack sm" style={{ position: "relative", paddingLeft: 16 }}>
              <div
                style={{
                  position: "absolute",
                  left: 6,
                  top: 0,
                  bottom: 0,
                  width: 2,
                  background: "#e2e8f0",
                }}
              />
              {auditEntries.map(entry => {
                const actor =
                  entry.actor_name ||
                  entry.actor ||
                  entry.actor_uuid ||
                  entry.user_id ||
                  "Unknown";
                const action = entry.action || entry.event || "change";
                const reason = entry.reason || entry.notes || "";
                const timestamp = entry.created_at || entry.timestamp || entry.at || "";
                return (
                  <div key={`${action}-${timestamp}-${actor}`} className="stack xs" style={{ position: "relative", paddingLeft: 12 }}>
                    <div
                      style={{
                        position: "absolute",
                        left: -2,
                        top: 4,
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        background: "#0f172a",
                      }}
                    />
                    <div className="row between">
                      <div className="label">{action}</div>
                      <div className="muted" style={{ fontSize: 12 }}>{timestamp}</div>
                    </div>
                    <div className="muted" style={{ fontSize: 12 }}>By: {actor}</div>
                    {reason && <div className="value" style={{ fontSize: 14 }}>{reason}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  const sections = [
    { key: "depots", title: "Depots" },
    { key: "commanders", title: "Commanders" },
    { key: "companies", title: "Companies" },
    { key: "platoons", title: "Platoons" },
    { key: "squads", title: "Squads" },
    { key: "teams", title: "Teams" },
  ];

  const grouped = sections.map(section => ({
    ...section,
    items: formulas.filter(f => (f.battle_type || "").toLowerCase() === section.key),
  }));

  return (
    <div style={{ fontFamily: "Inter, system-ui, Arial, sans-serif" }}>
      {createModal.open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 20,
          }}
        >
          <div
            style={{
              background: "#fff",
              padding: 20,
              borderRadius: 12,
              width: "min(420px, 90vw)",
              border: "1px solid #e2e8f0",
            }}
          >
            <div className="row between" style={{ marginBottom: 12 }}>
              <div className="card-title" style={{ margin: 0 }}>
                New {createModal.battleType.replace(/s$/, "")} Formula
              </div>
              <button className="btn ghost" onClick={() => setCreateModal(prev => ({ ...prev, open: false }))}>
                ✕
              </button>
            </div>
            {createModal.error && <div className="error">{createModal.error}</div>}
            <div className="stack sm">
              <div className="stack xs">
                <label className="label">Label</label>
                <input
                  type="text"
                  value={createModal.label}
                  onChange={e => setCreateModal(prev => ({ ...prev, label: e.target.value }))}
                />
              </div>
              <div className="stack xs">
                <label className="label">Effective Start Week</label>
                <input
                  type="text"
                  value={createModal.start}
                  onChange={e => setCreateModal(prev => ({ ...prev, start: e.target.value }))}
                />
              </div>
              <div className="stack xs">
                <label className="label">Effective End Week (optional)</label>
                <input
                  type="text"
                  value={createModal.end}
                  onChange={e => setCreateModal(prev => ({ ...prev, end: e.target.value }))}
                />
              </div>
              <div className="stack xs">
                <label className="label">Reason</label>
                <textarea
                  rows={3}
                  value={createModal.reason}
                  onChange={e => setCreateModal(prev => ({ ...prev, reason: e.target.value }))}
                />
              </div>
              <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
                <button
                  className="btn ghost"
                  onClick={() => setCreateModal(prev => ({ ...prev, open: false }))}
                  disabled={createModal.loading}
                >
                  Cancel
                </button>
                <button
                  className="btn primary"
                  disabled={
                    createModal.loading ||
                    !createModal.label.trim() ||
                    !createModal.start.trim() ||
                    !createModal.reason.trim()
                  }
                  onClick={async () => {
                    setCreateModal(prev => ({ ...prev, loading: true, error: "" }));
                    const config = { metrics: getDefaultMetrics(createModal.battleType) };
                    const { data, error } = await createDraft({
                      battle_type: createModal.battleType,
                      effective_start_week_key: createModal.start.trim(),
                      effective_end_week_key: createModal.end.trim() || null,
                      label: createModal.label.trim(),
                      config,
                      reason: createModal.reason.trim(),
                    });
                    if (error) {
                      setCreateModal(prev => ({ ...prev, loading: false, error: error.message || "Failed to create draft" }));
                      return;
                    }
                    setCreateModal({
                      open: false,
                      battleType: createModal.battleType,
                      label: "",
                      start: "",
                      end: "",
                      reason: "",
                      loading: false,
                      error: "",
                    });
                    await reloadFormulasAndSelect(data?.id);
                  }}
                >
                  {createModal.loading ? "Creating…" : "Create"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="grid two formulas-grid">
        <div className="card formula-library">
          <div className="card-title">Formulas</div>
          {profileError && <div className="error">{profileError}</div>}
          {formulasError && !formulasLoading && <div className="error">{formulasError}</div>}
          {formulasLoading && <div className="muted">Loading formulas…</div>}
          {!formulasLoading && formulas.length === 0 && (
            <div className="muted">No formulas found.</div>
          )}
          <div className="stack lg">
            {grouped.map(section => (
              <div key={section.key} className="formula-section">
                <div className="formula-section__header">
                  <div className="formula-section__title">{section.title}</div>
                  {isSuperAdmin && (
                    <button
                      className="btn primary formula-create-btn"
                      onClick={() =>
                        setCreateModal({
                          open: true,
                          battleType: section.key,
                          label: "",
                          start: "",
                          end: "",
                          reason: "",
                          loading: false,
                          error: "",
                        })
                      }
                    >
                      + New {section.title.replace(/s$/, "")} Formula
                    </button>
                  )}
                </div>
                <div className="formula-list">
                  {section.items.map(formula => {
                    const isSelected = formula.id === selectedId;
                    const start = formula.effective_start_week_key || formula.start_week_key || "—";
                    const end = formula.effective_end_week_key || formula.end_week_key || "∞";
                    const statusLabel = (formula.status || "unknown").toString();
                    return (
                      <button
                        key={formula.id}
                        className={`formula-item${isSelected ? " is-active" : ""}`}
                        onClick={() => setSelectedId(formula.id)}
                      >
                        <div className="formula-item__body">
                          <div className="formula-item__meta">
                            <span>{formula.label || "(Untitled)"}</span>
                            <span className="formula-badge">{statusLabel}</span>
                            <span className="muted">
                              v{formula.version ?? formula.revision ?? "—"}
                            </span>
                          </div>
                          <div className="formula-item__range">
                            {start} → {end || "∞"}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                  {section.items.length === 0 && (
                    <div className="muted">No formulas</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-title">Details</div>
          {renderDetails()}
        </div>
      </div>
    </div>
  );
}
