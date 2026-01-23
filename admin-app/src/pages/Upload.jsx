import React, { useEffect, useMemo, useRef, useState } from "react";
import { ModalForm } from "../components/ModalForm";
import {
  mergeRawDataRowsByIdentity,
  normalizeRawDataRows,
  parseRawDataWorkbook,
  upsertRawData,
} from "../services/rawData.service";
import { listAgents } from "../services/agents.service";
import { listDepots } from "../services/depots.service";

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
  const [manualOpen, setManualOpen] = useState(false);
  const [manualForm, setManualForm] = useState({
    date_real: "",
    agent_id: "",
    leads_depot_id: "",
    leads: 0,
    payins: 0,
    sales: 0,
    sales_depot_id: "",
  });
  const [manualLookupInputs, setManualLookupInputs] = useState({
    agent: "",
    leads_depot_id: "",
    sales_depot_id: "",
  });
  const [agentsOptions, setAgentsOptions] = useState([]);
  const [depotsOptions, setDepotsOptions] = useState([]);
  const [manualError, setManualError] = useState("");
  const [manualLoading, setManualLoading] = useState(false);

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
      const mergeNotes = row.merge_notes ?? [];
      const conflictNotes = mergeNotes.filter(note => note.toLowerCase().includes("conflicting"));
      if (conflictNotes.length) {
        displayWarnings.push(...conflictNotes);
      }
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
        mergeNotes,
        conflictNotes,
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
    setManualLoading(true);
    Promise.all([listAgents(), listDepots()])
      .then(([agents, depots]) => {
        if (!mounted) return;
        setAgentsOptions(agents ?? []);
        setDepotsOptions(depots ?? []);
      })
      .catch(err => {
        if (!mounted) return;
        setManualError(err.message || "Failed to load dropdown options");
      })
      .finally(() => {
        if (mounted) setManualLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  async function processFile(file) {
    setLoading(true);
    setError("");
    setSaveResult(null);
    setSaveProgress({ done: 0, total: 0 });
    setParseProgress({ done: 0, total: 0, stage: "reading" });

    try {
      const { rows: parsedRows, meta: workbookMeta } = await parseRawDataWorkbook(
        file,
        {},
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
    await processFile(file);
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
    setSaveProgress({ done: 0, total: 0 });
    setParseProgress({ done: 0, total: 0, stage: "" });
    setIsDragging(false);
    setImportMode("warn");
    setManualOpen(false);
    setManualError("");
    setManualForm({
      date_real: "",
      agent_id: "",
      leads_depot_id: "",
      leads: 0,
      payins: 0,
      sales: 0,
      sales_depot_id: "",
    });
    setManualLookupInputs({
      agent: "",
      leads_depot_id: "",
      sales_depot_id: "",
    });
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
    setSaveProgress({ done: 0, total: processed.rowsForSave.length });
    setSaveResult(null);
    try {
      const payload = processed.rowsForSave.map(row => ({
        date_real: row.date_real,
        agent_id: row.agent_id ?? row.resolved_agent_id,
        leads_depot_id: row.leads_depot_id,
        sales_depot_id: row.sales_depot_id,
        leads: row.leads ?? 0,
        payins: row.payins ?? 0,
        sales: row.sales ?? 0,
      }));
      const result = await upsertRawData(payload);
      if (!isMountedRef.current) return;
      setSaveProgress({ done: processed.rowsForSave.length, total: processed.rowsForSave.length });
      setSaveResult({
        insertedCount: 0,
        upsertedCount: result.length,
        errors: [],
        skipped: rows.length - processed.rowsForSave.length,
      });
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

  function parseLookupValue(value) {
    const cleaned = value?.toString().trim() ?? "";
    if (!cleaned) return { label: "", id: "" };
    const parts = cleaned.split(" — ");
    if (parts.length >= 2) {
      const id = parts[parts.length - 1]?.trim() ?? "";
      const label = parts.slice(0, -1).join(" — ").trim();
      return { label, id };
    }
    return { label: cleaned, id: "" };
  }

  function findAgentByName(name) {
    const normalized = name.trim().toLowerCase();
    const matches = agentsOptions.filter(agent => agent.name?.toLowerCase() === normalized);
    return matches.length === 1 ? matches[0] : null;
  }

  function findDepotByName(name) {
    const normalized = name.trim().toLowerCase();
    const matches = depotsOptions.filter(depot => depot.name?.toLowerCase() === normalized);
    return matches.length === 1 ? matches[0] : null;
  }

  function handleManualAgentChange(value) {
    const parsed = parseLookupValue(value);
    let agentId = parsed.id;
    if (!agentId && parsed.label) {
      const match = findAgentByName(parsed.label);
      agentId = match?.id ?? "";
    }
    setManualLookupInputs(prev => ({
      ...prev,
      agent: value,
    }));
    setManualForm(prev => ({
      ...prev,
      agent_id: agentId,
    }));
  }

  function handleManualDepotChange(field, value) {
    const parsed = parseLookupValue(value);
    let depotId = parsed.id;
    if (!depotId && parsed.label) {
      const match = findDepotByName(parsed.label);
      depotId = match?.id ?? "";
    }
    setManualLookupInputs(prev => ({
      ...prev,
      [field]: value,
    }));
    setManualForm(prev => ({
      ...prev,
      [field]: depotId,
    }));
  }

  async function handleManualSubmit(e) {
    e.preventDefault();
    setManualError("");
    setSaveResult(null);

    const errors = [];
    if (!manualForm.date_real) errors.push("Date is required.");
    if (!manualForm.agent_id) errors.push("Leader is required.");
    if (!manualForm.leads_depot_id) errors.push("Leads depot is required.");
    if (!manualForm.sales_depot_id) errors.push("Sales depot is required.");
    if (errors.length) {
      setManualError(errors.join(" "));
      return;
    }

    const timestampKey = `manual-${Date.now()}`;
    const manualRow = {
      sourceRowIndex: timestampKey,
      excelRowNumber: "manual",
      date_real: manualForm.date_real,
      agent_id: manualForm.agent_id,
      leads: Number(manualForm.leads) || 0,
      payins: Number(manualForm.payins) || 0,
      sales: Number(manualForm.sales) || 0,
      leads_depot_id: manualForm.leads_depot_id,
      sales_depot_id: manualForm.sales_depot_id,
    };

    try {
      setManualLoading(true);
      const { rows: normalizedRows } = await normalizeRawDataRows([manualRow]);
      setRows(prev => mergeRawDataRowsByIdentity([...prev, ...normalizedRows]));
      setManualOpen(false);
      setManualForm({
        date_real: "",
        agent_id: "",
        leads_depot_id: "",
        leads: 0,
        payins: 0,
        sales: 0,
        sales_depot_id: "",
      });
      setManualLookupInputs({
        agent: "",
        leads_depot_id: "",
        sales_depot_id: "",
      });
    } catch (submitError) {
      setManualError(submitError.message || "Failed to add manual row");
    } finally {
      setManualLoading(false);
    }
  }

  return (
    <div className="card">
      <div className="card-title">Upload Raw Data</div>
      <div className="muted">Import the Daily Data template (.xlsx) and review rows before saving.</div>

      <div className="upload-actions-row" style={{ marginTop: 12 }}>
        <button
          type="button"
          className="button secondary"
          onClick={() => {
            setManualError("");
            setManualOpen(true);
          }}
          disabled={manualLoading}
        >
          Manual Input
        </button>
      </div>

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
                    row.merge_count > 1 ? `Merged (${row.merge_count})` : null,
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
                        <div>
                          <div className="status-pill duplicate" title={row.mergeNotes?.join(" ")}>
                            {duplicateBadges.join(" · ")}
                          </div>
                          {row.conflictNotes?.length ? (
                            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                              {row.conflictNotes.join(" ")}
                            </div>
                          ) : null}
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

      <ModalForm
        isOpen={manualOpen}
        title="Manual Input (Daily Data)"
        onClose={() => setManualOpen(false)}
        onOverlayClose={() => setManualOpen(false)}
        onSubmit={handleManualSubmit}
        footer={(
          <>
            <button type="button" className="button secondary" onClick={() => setManualOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="button primary" disabled={manualLoading}>
              Add Row
            </button>
          </>
        )}
      >
        {manualError ? (
          <div className="error-box" role="alert">
            {manualError}
          </div>
        ) : null}
        <div className="form-grid">
          <label className="form-field">
            <span>Date</span>
            <input
              type="date"
              value={manualForm.date_real}
              onChange={e => setManualForm(prev => ({ ...prev, date_real: e.target.value }))}
              required
            />
          </label>
          <label className="form-field">
            <span>Leader</span>
            <input
              type="text"
              list="manual-agents"
              value={manualLookupInputs.agent}
              onChange={e => handleManualAgentChange(e.target.value)}
              placeholder="Select leader"
              required
            />
          </label>
          <label className="form-field">
            <span>Leads</span>
            <input
              type="number"
              min="0"
              step="1"
              value={manualForm.leads}
              onChange={e => setManualForm(prev => ({ ...prev, leads: e.target.value }))}
            />
          </label>
          <label className="form-field">
            <span>Leads Depot</span>
            <input
              type="text"
              list="manual-depots"
              value={manualLookupInputs.leads_depot_id}
              onChange={e => handleManualDepotChange("leads_depot_id", e.target.value)}
              placeholder="Select leads depot"
              required
            />
          </label>
          <label className="form-field">
            <span>Payins</span>
            <input
              type="number"
              min="0"
              step="1"
              value={manualForm.payins}
              onChange={e => setManualForm(prev => ({ ...prev, payins: e.target.value }))}
            />
          </label>
          <label className="form-field">
            <span>Sales</span>
            <input
              type="number"
              min="0"
              step="1"
              value={manualForm.sales}
              onChange={e => setManualForm(prev => ({ ...prev, sales: e.target.value }))}
            />
          </label>
          <label className="form-field">
            <span>Sales Depot</span>
            <input
              type="text"
              list="manual-depots"
              value={manualLookupInputs.sales_depot_id}
              onChange={e => handleManualDepotChange("sales_depot_id", e.target.value)}
              placeholder="Select sales depot"
              required
            />
          </label>
        </div>
        <datalist id="manual-agents">
          {agentsOptions.map(agent => (
            <option key={agent.id} value={`${agent.name} — ${agent.id}`} />
          ))}
        </datalist>
        <datalist id="manual-depots">
          {depotsOptions.map(depot => (
            <option key={depot.id} value={`${depot.name} — ${depot.id}`} />
          ))}
        </datalist>
      </ModalForm>
    </div>
  );
}
