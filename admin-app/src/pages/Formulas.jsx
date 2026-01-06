import React, { useEffect, useMemo, useState } from "react";
import {
  listAllFormulasForSuperAdmin,
  listPublishedFormulas,
  listAudit,
} from "../services/scoringFormula.service";
import { getMyProfile } from "../services/profile.service";
import { supabase } from "../services/supabase";
import { computeMetricScore, computeTotalScore } from "../services/scoringEngine";

export default function ScoringFormulas() {
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState("");

  const [formulas, setFormulas] = useState([]);
  const [formulasLoading, setFormulasLoading] = useState(true);
  const [formulasError, setFormulasError] = useState("");

  const [selectedId, setSelectedId] = useState(null);

  const isSuperAdmin = profile?.role === "super_admin";

  const [formData, setFormData] = useState({
    name: "",
    metricsText: "",
    reason: "",
  });
  const [saveError, setSaveError] = useState("");
  const [saveLoading, setSaveLoading] = useState(false);
  const [publishLoading, setPublishLoading] = useState(false);
  const [publishError, setPublishError] = useState("");

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

  const selectedFormula = useMemo(
    () => formulas.find(f => f.id === selectedId) || null,
    [formulas, selectedId]
  );

  useEffect(() => {
    if (!selectedFormula) return;
    const metricsJson = selectedFormula.metrics ?? selectedFormula.config ?? {};
    setFormData({
      name: selectedFormula.name || selectedFormula.title || "",
      metricsText: JSON.stringify(metricsJson, null, 2),
      reason: "",
    });
    setSaveError("");
    setPublishError("");
    setPreviewInputs({ leads: "0", payins: "0", sales: "0" });
  }, [selectedFormula]);

  const isPublished = selectedFormula?.status === "published";
  const isEditable = isSuperAdmin && selectedFormula && !isPublished;

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

  function handleFieldChange(key, value) {
    setFormData(prev => ({ ...prev, [key]: value }));
  }

  async function handleSaveDraft() {
    if (!isEditable) return;
    setSaveError("");

    const trimmedReason = formData.reason?.trim() || "";
    if (!trimmedReason) {
      setSaveError("Reason is required.");
      return;
    }

    let parsedMetrics;
    try {
      parsedMetrics = JSON.parse(formData.metricsText || "{}");
    } catch (err) {
      setSaveError(err.message || "Invalid metrics JSON");
      return;
    }

    setSaveLoading(true);
    const { data, error } = await supabase.rpc("update_draft_scoring_formula", {
      formula_id: selectedId,
      name: formData.name,
      metrics: parsedMetrics,
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

    const trimmedReason = formData.reason?.trim() || "";
    if (!trimmedReason) {
      setPublishError("Reason is required to publish.");
      return;
    }

    setPublishLoading(true);
    const { data, error } = await supabase.rpc("publish_scoring_formula", {
      formula_id: selectedId,
      reason: trimmedReason,
    });
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

  function parseMetricsForPreview() {
    const sourceText = isEditable ? formData.metricsText : JSON.stringify(selectedFormula?.metrics ?? selectedFormula?.config ?? {});
    try {
      const parsed = typeof sourceText === "string" ? JSON.parse(sourceText || "{}") : sourceText || {};
      if (Array.isArray(parsed)) return parsed;
      if (Array.isArray(parsed.metrics)) return parsed.metrics;
      return [];
    } catch (_) {
      return [];
    }
  }

  function getTotals() {
    const leads = Number(previewInputs.leads) || 0;
    const payins = Number(previewInputs.payins) || 0;
    const sales = Number(previewInputs.sales) || 0;
    return { leads, payins, sales };
  }

  const previewMetrics = parseMetricsForPreview();
  const previewTotals = getTotals();
  const previewTotalScore = computeTotalScore(selectedFormula?.battle_type, previewTotals, {
    metrics: previewMetrics,
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
      { label: "Name", value: selectedFormula.name || selectedFormula.title || "(Untitled)" },
      { label: "Status", value: selectedFormula.status || "unknown" },
      { label: "Version", value: selectedFormula.version ?? selectedFormula.revision ?? "—" },
    ];

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
                Name
              </label>
              <input
                id="formula-name"
                type="text"
                value={formData.name}
                onChange={e => handleFieldChange("name", e.target.value)}
              />
            </div>
            <div className="stack xs">
              <label className="label" htmlFor="metrics-json">
                Metrics (JSON)
              </label>
              <textarea
                id="metrics-json"
                rows={10}
                value={formData.metricsText}
                onChange={e => handleFieldChange("metricsText", e.target.value)}
              />
            </div>
            <div className="stack xs">
              <label className="label" htmlFor="reason">
                Reason (required)
              </label>
              <textarea
                id="reason"
                rows={3}
                value={formData.reason}
                onChange={e => handleFieldChange("reason", e.target.value)}
              />
            </div>
            {saveError && <div className="error">{saveError}</div>}
            {publishError && <div className="error">{publishError}</div>}
            <div className="row" style={{ gap: "8px" }}>
              <button
                className="btn primary"
                onClick={handleSaveDraft}
                disabled={saveLoading}
              >
                {saveLoading ? "Saving…" : "Save Draft"}
              </button>
              <button
                className="btn"
                onClick={handlePublish}
                disabled={publishLoading || isPublished}
              >
                {publishLoading ? "Publishing…" : "Publish"}
              </button>
            </div>
          </div>
        ) : (
          <div className="stack xs">
            <div className="label">Metrics</div>
            <pre className="code-block">
              {JSON.stringify(selectedFormula.metrics ?? selectedFormula.config ?? {}, null, 2)}
            </pre>
          </div>
        )}
        <div className="stack sm">
          <div className="label">Preview Calculator</div>
          <div className="grid three" style={{ gap: "8px" }}>
            {["leads", "payins", "sales"].map(key => (
              <div className="stack xs" key={key}>
                <label className="label" htmlFor={`preview-${key}`}>
                  {key.charAt(0).toUpperCase() + key.slice(1)}
                </label>
                <input
                  id={`preview-${key}`}
                  type="number"
                  value={previewInputs[key]}
                  onChange={e =>
                    setPreviewInputs(prev => ({ ...prev, [key]: e.target.value }))
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
                  return (
                    <div key={key} className="row between">
                      <div>{key}</div>
                      <div className="muted">
                        {score.toFixed(2)} / {maxPoints}
                      </div>
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
            <div className="stack xs">
              {auditEntries.map(entry => {
                const actor = entry.actor || entry.actor_name || entry.user_id || "Unknown";
                const action = entry.action || entry.event || "change";
                const reason = entry.reason || entry.notes || "";
                const timestamp = entry.created_at || entry.timestamp || entry.at || "";
                return (
                  <div key={`${action}-${timestamp}-${actor}`} className="card muted" style={{ padding: "8px" }}>
                    <div className="row between">
                      <div className="label">{action}</div>
                      <div className="value">{timestamp}</div>
                    </div>
                    <div className="muted">By: {actor}</div>
                    {reason && <div className="value">Reason: {reason}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="grid two" style={{ gap: "16px" }}>
      <div className="card">
        <div className="card-title">Formulas</div>
        {profileError && <div className="error">{profileError}</div>}
        {formulasError && !formulasLoading && <div className="error">{formulasError}</div>}
        {formulasLoading && <div className="muted">Loading formulas…</div>}
        {!formulasLoading && formulas.length === 0 && (
          <div className="muted">No formulas found.</div>
        )}
        <div className="stack sm">
          {formulas.map(formula => (
            <button
              key={formula.id}
              className={`btn ${formula.id === selectedId ? "primary" : "ghost"}`}
              onClick={() => setSelectedId(formula.id)}
            >
              {formula.name || formula.title || `Formula ${formula.id}`}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-title">Details</div>
        {renderDetails()}
      </div>
    </div>
  );
}
