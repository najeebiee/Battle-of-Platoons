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

  const inputRef = useRef(null);

  const summary = useMemo(() => {
    const total = rows.length;
    const valid = rows.filter(r => r.status === "valid").length;
    const invalid = total - valid;
    return { total, valid, invalid };
  }, [rows]);

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
    const validRows = rows.filter(r => r.status === "valid");
    setProgress({ done: 0, total: validRows.length });
    setSaveResult(null);
    try {
      const result = await saveRawDataRows(validRows, (done, total) => setProgress({ done, total }));
      setSaveResult({ ...result, skipped: rows.length - validRows.length });
    } catch (e) {
      setSaveResult({ upsertedCount: 0, errors: [e.message || "Failed to save"], skipped: rows.length - validRows.length });
    }
  }

  return (
    <div className="card">
      <div className="card-title">Upload Raw Data</div>
      <div className="muted">Import the Daily Data template (.xlsx) and review rows before saving.</div>

      <div className="upload-actions">
        <label className="upload-drop" htmlFor="file-input">
          <input id="file-input" type="file" accept=".xlsx" onChange={onInputChange} style={{ display: "none" }} />
          <div className="upload-icon">📤</div>
          <div>
            <div className="upload-title">Select or drop an .xlsx file</div>
            <div className="muted">Sheet name "Daily Data" (or first sheet)</div>
          </div>
        </label>
        <a className="button secondary" href="#" target="_blank" rel="noreferrer">
          Download Template
        </a>
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
              <div className="summary-label">Total</div>
              <div className="summary-value">{summary.total}</div>
            </div>
            <div className="summary-pill">
              <div className="summary-label">Valid</div>
              <div className="summary-value valid">{summary.valid}</div>
            </div>
            <div className="summary-pill">
              <div className="summary-label">Invalid</div>
              <div className="summary-value invalid">{summary.invalid}</div>
            </div>
          </div>

          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Date</th>
                  <th>agent_id</th>
                  <th>Leader Name</th>
                  <th>Leads</th>
                  <th>Payins</th>
                  <th>Sales</th>
                  <th>Status</th>
                  <th>Errors</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.sourceRowIndex} className={row.status === "invalid" ? "row-invalid" : ""}>
                    <td>{row.sourceRowIndex}</td>
                    <td>{row.date_real || "—"}</td>
                    <td>{row.resolved_agent_id || row.agent_id_input || ""}</td>
                    <td>{row.leader_name_input}</td>
                    <td>{row.leads}</td>
                    <td>{row.payins}</td>
                    <td>{row.sales}</td>
                    <td>
                      <span className={`status-pill ${row.status === "valid" ? "valid" : "invalid"}`}>
                        {row.status === "valid" ? "Valid" : "Invalid"}
                      </span>
                    </td>
                    <td>{row.errors.join("; ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="save-bar">
            <button className="button primary" disabled={!summary.valid || loading} onClick={handleSave}>
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
          <div><strong>Upserted:</strong> {saveResult.upsertedCount}</div>
          <div><strong>Skipped (invalid):</strong> {saveResult.skipped}</div>
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
