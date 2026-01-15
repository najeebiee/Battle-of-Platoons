import React, { useEffect, useMemo, useRef, useState } from "react";
import { parseRawDataWorkbook, saveRawDataRows } from "../services/rawData.service";
import { getMyProfile } from "../services/profile.service";

export default function Upload() {
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saveProgress, setSaveProgress] = useState({ done: 0, total: 0 });
  const [parseProgress, setParseProgress] = useState({ done: 0, total: 0, stage: "" });
  const [saveResult, setSaveResult] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [importMode, setImportMode] = useState("warn");
  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState("");
  const [profileLoading, setProfileLoading] = useState(true);
  const [source, setSource] = useState("company");
  const [parsedFile, setParsedFile] = useState(null);
  const forcedSource = profile?.role === "depot_admin" ? "depot" : profile?.role === "company_admin" ? "company" : null;
  const canSelectSource = profile?.role === "super_admin";
  const sourceLabel = source === "depot" ? "Depot" : "Company";
  const sourceHint = forcedSource
    ? `Source is locked to ${sourceLabel} for your role.`
    : "Select which source you are uploading.";

  const inputRef = useRef(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const processed = useMemo(() => {
    const displayRows = rows.map(row => {
      const displayWarnings = [];
      const displayErrors = [...(row.errors ?? [])];
      if (row.suggestions?.length) {
        displayErrors.push(`Suggestions: ${row.suggestions.join("; ")}`);
      }
      const hasDuplicate = Boolean(row.dup_base_row);
      let displayStatus = "Valid";
      let statusTone = "valid";
      let isValidForSave = row.status === "valid" && row.resolved_agent_id;
      const rowWillOverwrite = hasDuplicate && importMode !== "insert_only";

      if (row.status === "invalid") {
        displayStatus = "Invalid";
        statusTone = "invalid";
        isValidForSave = false;
      } else if (hasDuplicate) {
        if (importMode === "insert_only") {
          displayStatus = "Invalid";
          statusTone = "invalid";
          displayErrors.push("Duplicate (skipped)");
          isValidForSave = false;
        } else if (importMode === "warn") {
          displayStatus = "Duplicate (will overwrite)";
          statusTone = "duplicate";
          displayWarnings.push("Duplicate (will overwrite)");
        } else {
          displayStatus = "Valid";
          statusTone = "valid";
        }
      }

      return {
        ...row,
        hasDuplicate,
        will_overwrite: rowWillOverwrite,
        displayWarnings,
        displayErrors,
        displayStatus,
        statusTone,
        isValidForSave,
      };
    });

    const total = displayRows.length;
    const validNew = displayRows.filter(row => row.status === "valid" && !row.hasDuplicate).length;
    const duplicate = displayRows.filter(row => row.hasDuplicate).length;
    const invalid = displayRows.filter(row => row.displayStatus === "Invalid").length;
    const rowsForSave = displayRows.filter(row => row.isValidForSave);

    return {
      displayRows,
      rowsForSave,
      summary: { total, validNew, duplicate, invalid },
    };
  }, [rows, importMode]);

  const parseProgressText = useMemo(() => {
    if (!parseProgress.stage) return "";
    if (parseProgress.stage === "reading") return "Reading file…";
    if (parseProgress.stage === "processing") {
      return parseProgress.total
        ? `Processing ${parseProgress.done}/${parseProgress.total}`
        : "Processing…";
    }
    if (parseProgress.stage === "checking_duplicates") {
      return parseProgress.total
        ? `Checking duplicates ${parseProgress.done}/${parseProgress.total}`
        : "Checking duplicates…";
    }
    return "";
  }, [parseProgress]);

  useEffect(() => {
    let mounted = true;
    setProfileLoading(true);
    getMyProfile()
      .then(data => {
        if (!mounted) return;
        setProfile(data);
        const derivedSource = data?.role === "depot_admin" ? "depot" : data?.role === "company_admin" ? "company" : null;
        setSource(prev => derivedSource || prev || "company");
      })
      .catch(err => {
        if (!mounted) return;
        setProfileError(err.message || "Failed to load profile");
      })
      .finally(() => {
        if (mounted) setProfileLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  async function processFileWithSource(file, selectedSource) {
    setLoading(true);
    setError("");
    setSaveResult(null);
    setSaveProgress({ done: 0, total: 0 });
    setParseProgress({ done: 0, total: 0, stage: "reading" });

    try {
      const { rows: parsedRows, meta: workbookMeta } = await parseRawDataWorkbook(
        file,
        { source: selectedSource },
        (done, total, stage) => {
          if (!isMountedRef.current) return;
          setParseProgress({ done, total, stage });
        }
      );
      if (isMountedRef.current) {
        setRows(parsedRows);
        setMeta(workbookMeta);
        setFileName(file.name);
      }
    } catch (e) {
      if (!isMountedRef.current) return;
      setRows([]);
      setMeta(null);
      setFileName("");
      setError(e.message || "Failed to parse file");
      setParseProgress({ done: 0, total: 0, stage: "" });
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }

  async function handleFile(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setError("Only .xlsx files are accepted.");
      setRows([]);
      setMeta(null);
      setFileName("");
      setSaveResult(null);
      setSaveProgress({ done: 0, total: 0 });
      setParseProgress({ done: 0, total: 0, stage: "" });
      return;
    }
    setParsedFile(file);
    await processFileWithSource(file, source);
  }

  function onInputChange(e) {
    const file = e.target.files?.[0];
    handleFile(file);
  }

  useEffect(() => {
    if (!profile) return;
    if (forcedSource && source !== forcedSource) {
      setSource(forcedSource);
      if (parsedFile) processFileWithSource(parsedFile, forcedSource);
    }
  }, [profile, parsedFile, source, forcedSource]);

  function downloadTemplate() {
    const a = document.createElement("a");
    a.href = "/Leaderboard_Template.xlsx";
    a.download = "Leaderboard_Template.xlsx";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function resetUpload() {
    setFileName("");
    setRows([]);
    setMeta(null);
    setLoading(false);
    setError("");
    setSaveResult(null);
    setSaveProgress({ done: 0, total: 0 });
    setParseProgress({ done: 0, total: 0, stage: "" });
    setIsDragging(false);
    setImportMode("warn");
    setParsedFile(null);
    if (profile?.role === "depot_admin") setSource("depot");
    else if (profile?.role === "company_admin") setSource("company");
    if (inputRef.current) inputRef.current.value = "";
  }

  function onDrop(e) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setError("Only .xlsx files are accepted.");
      return;
    }
    handleFile(file);
  }

  function handleSourceChange(nextSource) {
    setSource(nextSource);
    if (parsedFile) processFileWithSource(parsedFile, nextSource);
  }

  async function handleSave() {
    setSaveProgress({ done: 0, total: processed.rowsForSave.length });
    setSaveResult(null);
    try {
      const result = await saveRawDataRows(
        processed.rowsForSave,
        { mode: importMode, source },
        (done, total) => {
          if (!isMountedRef.current) return;
          setSaveProgress({ done, total });
        }
      );
      if (!isMountedRef.current) return;
      setSaveResult({ ...result, skipped: rows.length - processed.rowsForSave.length });
    } catch (e) {
      if (!isMountedRef.current) return;
      setSaveResult({
        insertedCount: 0,
        upsertedCount: 0,
        errors: [e.message || "Failed to save"],
        skipped: rows.length - processed.rowsForSave.length,
      });
    }
  }

  return (
    <div className="card">
      <div className="card-title">Upload Raw Data</div>
      <div className="muted">Import the Daily Data template (.xlsx) and review rows before saving.</div>

      <div
        className={`dropzone ${isDragging ? "dropzone--dragging" : ""}`}
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inputRef.current?.click(); } }}
      >
        <div className="upload-icon" aria-hidden>📤</div>
        <div>
          <div className="dropzone__title">Select or drop an .xlsx file</div>
          <div className="dropzone__sub">.xlsx only. Sheet name "Daily Data" or first sheet.</div>
        </div>
        <input
          ref={inputRef}
          id="file-input"
          type="file"
          accept=".xlsx"
          onChange={onInputChange}
          style={{ display: "none" }}
        />
      </div>

      <div className="upload-actions-row">
        <button type="button" className="button secondary" onClick={downloadTemplate}>
          Download Template
        </button>
        {(fileName || rows.length > 0) ? (
          <button className="button" type="button" onClick={resetUpload}>
            Upload New
          </button>
        ) : null}
      </div>

      <div className="summary-grid" style={{ marginTop: 12 }}>
        <div className="summary-pill">
          <div className="summary-label">Source</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <select
              value={source}
              onChange={e => handleSourceChange(e.target.value)}
              disabled={profileLoading || (!canSelectSource && Boolean(forcedSource))}
            >
              <option value="company">Company</option>
              <option value="depot">Depot</option>
            </select>
            <span className={`status-pill ${source === "depot" ? "duplicate" : "valid"}`}>
              Source: {sourceLabel}
            </span>
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            {profileLoading ? "Loading profile…" : sourceHint}
          </div>
        </div>
      </div>

      {profileError ? (
        <div className="error-box" role="alert">
          {profileError}
        </div>
      ) : null}

      {fileName ? (
        <div className="hint" style={{ marginTop: 12 }}>
          <strong>File:</strong> {fileName} {meta ? `(Sheet: ${meta.sheetName}, Rows: ${meta.totalRows})` : ""}
        </div>
      ) : null}

      {error ? (
        <div className="error-box" role="alert">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="muted">
          {parseProgressText || "Parsing workbook…"}
        </div>
      ) : null}

      {rows.length ? (
        <>
          <div className="summary-grid">
            <div className="summary-pill">
              <div className="summary-label">Import Mode</div>
              <div>
                <select
                  value={importMode}
                  onChange={e => {
                    setImportMode(e.target.value);
                    setSaveResult(null);
                  }}
                >
                  <option value="warn">Warn (upsert)</option>
                  <option value="upsert">Upsert</option>
                  <option value="insert_only">Insert Only</option>
                </select>
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                {importMode === "insert_only"
                  ? "Duplicates will be skipped."
                  : importMode === "upsert"
                    ? "Duplicates will overwrite existing rows."
                    : "Duplicates will be flagged but still overwrite."}
              </div>
            </div>
          </div>
          <div className="summary-grid">
            <div className="summary-pill">
              <div className="summary-label">Total</div>
              <div className="summary-value">{processed.summary.total}</div>
            </div>
            <div className="summary-pill">
              <div className="summary-label">Valid (New)</div>
              <div className="summary-value valid">{processed.summary.validNew}</div>
            </div>
            <div className="summary-pill">
              <div className="summary-label">Duplicates</div>
              <div className="summary-value duplicate">{processed.summary.duplicate}</div>
            </div>
            <div className="summary-pill">
              <div className="summary-label">Invalid</div>
              <div className="summary-value invalid">{processed.summary.invalid}</div>
            </div>
          </div>

          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Date</th>
                  <th>Leader Name</th>
                  <th>Leads Depot</th>
                  <th>Sales Depot</th>
                  <th>Leads</th>
                  <th>Payins</th>
                  <th>Sales</th>
                  <th>Duplicates / Merge</th>
                  <th>Status</th>
                  <th>Errors</th>
                </tr>
              </thead>
              <tbody>
                {processed.displayRows.map((row, idx) => {
                  const warningText = row.displayWarnings?.length
                    ? row.displayWarnings.map(warn => `Warning: ${warn}`)
                    : [];
                  const issueText = [...(row.displayErrors ?? []), ...warningText].join("; ");
                  const duplicateBadges = [
                    row.mergedCount > 1 ? `Merged (${row.mergedCount})` : null,
                    row.dup_base_row ? "Row exists" : null,
                  ].filter(Boolean);

                  return (
                    <tr
                      key={`${row.excelRowNumber}-${row.sourceRowIndex}`}
                      className={row.displayStatus === "Invalid" ? "row-invalid" : ""}
                    >
                    <td>
                      <div>{idx + 1}</div>
                    </td>
                    <td>{row.date_real || "—"}</td>
                    <td>
                      <div>{row.leader_name_input}</div>
                    </td>
                    <td>
                      <div>{row.leads_depot_name || "—"}</div>
                    </td>
                    <td>
                      <div>{row.sales_depot_name || "—"}</div>
                    </td>
                    <td>{row.leads}</td>
                    <td>{row.payins}</td>
                    <td>{row.sales}</td>
                    <td>
                      {duplicateBadges.length ? (
                        <div className="status-pill duplicate">
                          {duplicateBadges.join(" · ")}
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <span className={`status-pill ${row.statusTone}`}>
                        {row.displayStatus}
                      </span>
                    </td>
                    <td>
                      {issueText}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="save-bar">
            <button className="button primary" disabled={!processed.rowsForSave.length || loading} onClick={handleSave}>
              Save to Database
            </button>
            {saveProgress.total ? (
              <div className="muted">Saving {saveProgress.done}/{saveProgress.total}…</div>
            ) : null}
          </div>
        </>
      ) : null}

      {saveResult ? (
        <div className="result-box">
          <div><strong>Inserted:</strong> {saveResult.insertedCount ?? 0}</div>
          <div><strong>Upserted:</strong> {saveResult.upsertedCount ?? 0}</div>
          <div><strong>Skipped:</strong> {saveResult.skipped}</div>
          {saveResult.errors?.length ? (
            <div className="error-list">
              <div><strong>Errors:</strong></div>
              <ul>
                {saveResult.errors.slice(0, 3).map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
