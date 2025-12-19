import React, { useMemo, useRef, useState } from "react";
import { parseRawDataWorkbook, saveRawDataRows } from "../services/rawData.service";

export default function Upload() {
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [saveResult, setSaveResult] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [importMode, setImportMode] = useState("warn");

  const inputRef = useRef(null);

  const processed = useMemo(() => {
    const displayRows = rows.map(row => {
      const displayWarnings = row.warnings ?? [];
      const displayErrors = [...(row.errors ?? [])];
      let displayStatus = "Valid";
      let statusTone = "valid";
      let isValidForSave = row.status === "valid";

      if (row.status === "invalid") {
        displayStatus = "Invalid";
        statusTone = "invalid";
        isValidForSave = false;
      } else if (row.duplicate) {
        if (importMode === "insert_only") {
          displayStatus = "Invalid";
          statusTone = "invalid";
          displayErrors.push("Duplicate ID exists");
          isValidForSave = false;
        } else {
          displayStatus = "Duplicate (Existing)";
          statusTone = "duplicate";
        }
      }

      return {
        ...row,
        displayWarnings,
        displayErrors,
        displayStatus,
        statusTone,
        isValidForSave,
      };
    });

    const total = displayRows.length;
    const validNew = displayRows.filter(row => row.status === "valid" && !row.duplicate).length;
    const duplicate = displayRows.filter(row => row.duplicate).length;
    const invalid = displayRows.filter(row => row.displayStatus === "Invalid").length;
    const rowsForSave = displayRows.filter(row => row.isValidForSave);

    return {
      displayRows,
      rowsForSave,
      summary: { total, validNew, duplicate, invalid },
    };
  }, [rows, importMode]);

  async function handleFile(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setError("Only .xlsx files are accepted.");
      setRows([]);
      setMeta(null);
      setFileName("");
      setSaveResult(null);
      setProgress({ done: 0, total: 0 });
      return;
    }
    setLoading(true);
    setError("");
    setSaveResult(null);
    setProgress({ done: 0, total: 0 });

    try {
      const { rows: parsedRows, meta: workbookMeta } = await parseRawDataWorkbook(file);
      setRows(parsedRows);
      setMeta(workbookMeta);
      setFileName(file.name);
    } catch (e) {
      setRows([]);
      setMeta(null);
      setFileName("");
      setError(e.message || "Failed to parse file");
    } finally {
      setLoading(false);
    }
  }

  function onInputChange(e) {
    const file = e.target.files?.[0];
    handleFile(file);
  }

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
    setProgress({ done: 0, total: 0 });
    setIsDragging(false);
    setImportMode("warn");
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

  async function handleSave() {
    setProgress({ done: 0, total: processed.rowsForSave.length });
    setSaveResult(null);
    try {
      const result = await saveRawDataRows(
        processed.rowsForSave,
        importMode,
        (done, total) => setProgress({ done, total })
      );
      setSaveResult({ ...result, skipped: rows.length - processed.rowsForSave.length });
    } catch (e) {
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

      {loading ? <div className="muted">Parsing workbook…</div> : null}

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
                  <th>agent_id</th>
                  <th>Computed ID</th>
                  <th>Leader Name</th>
                  <th>Leads</th>
                  <th>Payins</th>
                  <th>Sales</th>
                  <th>Status</th>
                  <th>Errors</th>
                </tr>
              </thead>
              <tbody>
                {processed.displayRows.map(row => {
                  const warningText = row.displayWarnings?.length
                    ? row.displayWarnings.map(warn => `Warning: ${warn}`)
                    : [];
                  const issueText = [...(row.displayErrors ?? []), ...warningText].join("; ");

                  return (
                    <tr
                      key={`${row.displayIndex}-${row.sourceRowIndex}`}
                      className={row.displayStatus === "Invalid" ? "row-invalid" : ""}
                    >
                    <td>
                      <div>{row.displayIndex}</div>
                    </td>
                    <td>{row.date_real || "—"}</td>
                    <td>
                      <div>{row.resolved_agent_id || row.agent_id_input || ""}</div>
                    </td>
                    <td>
                      <div className="muted" style={{ fontSize: 12 }}>{row.computed_id}</div>
                    </td>
                    <td>{row.leader_name_input}</td>
                    <td>{row.leads}</td>
                    <td>{row.payins}</td>
                    <td>{row.sales}</td>
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
            {progress.total ? (
              <div className="muted">Saving {progress.done}/{progress.total}…</div>
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
