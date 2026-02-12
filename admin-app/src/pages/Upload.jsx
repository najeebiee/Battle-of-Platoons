import React, { useEffect, useMemo, useRef, useState } from "react";
import "../styles/pages/upload.css";
import { ModalForm } from "../components/ModalForm";
import { FloatingSelectField } from "../components/FloatingSelectField";
import AppPagination from "../components/AppPagination";
import ExportButton from "../components/ExportButton";
import { exportToXlsx } from "../services/export.service";
import {
  mergeRawDataRowsByIdentity,
  normalizeRawDataRows,
  parseRawDataWorkbook,
  upsertRawData,
} from "../services/rawData.service";
import { listAgents } from "../services/agents.service";
import { listDepots } from "../services/depots.service";

function ReplaceIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M12 5a7 7 0 0 1 6.6 4.5.75.75 0 0 1-1.4.54A5.5 5.5 0 1 0 17.5 12a.75.75 0 0 1 1.5 0 7 7 0 1 1-7-7Zm5.03-1.28a.75.75 0 0 1 1.05-.07l2.7 2.3a.75.75 0 0 1-.49 1.3h-3.65a.75.75 0 0 1 0-1.5h1.68l-2.06-1.76a.75.75 0 0 1-.23-1.27Z"
      />
    </svg>
  );
}

function WarnIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M12 3.5c.3 0 .58.16.72.42l8.2 14.5a.83.83 0 0 1-.72 1.25H3.8a.83.83 0 0 1-.72-1.25l8.2-14.5c.14-.26.42-.42.72-.42Zm0 5.25c.45 0 .8.36.8.8v4.7a.8.8 0 1 1-1.6 0v-4.7c0-.44.35-.8.8-.8Zm0 8.1a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z"
      />
    </svg>
  );
}

function UpsertIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M6.25 4.5a.75.75 0 0 1 .75.75v9.19l2.22-2.22a.75.75 0 1 1 1.06 1.06l-3.5 3.5a.75.75 0 0 1-1.06 0l-3.5-3.5a.75.75 0 1 1 1.06-1.06l2.22 2.22V5.25a.75.75 0 0 1 .75-.75ZM12 6.25a.75.75 0 0 1 .75-.75h5.5a.75.75 0 0 1 0 1.5h-5.5A.75.75 0 0 1 12 6.25Zm0 4a.75.75 0 0 1 .75-.75h5.5a.75.75 0 0 1 0 1.5h-5.5a.75.75 0 0 1-.75-.75Zm0 4a.75.75 0 0 1 .75-.75h5.5a.75.75 0 0 1 0 1.5h-5.5a.75.75 0 0 1-.75-.75Z"
      />
    </svg>
  );
}

function InsertIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M6.5 4.5A2.5 2.5 0 0 0 4 7v10a2.5 2.5 0 0 0 2.5 2.5h11A2.5 2.5 0 0 0 20 17V9.5a.75.75 0 0 0-.22-.53l-4.75-4.75A.75.75 0 0 0 14.5 4.5h-8Zm0 1.5h7.25V9a1 1 0 0 0 1 1H18v7a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Zm8.75 1.06L17.94 9h-2.69V7.06Z"
      />
    </svg>
  );
}

export default function Upload() {
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const rowsPerPage = 10;
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
  const [activeManualSelect, setActiveManualSelect] = useState("");

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

  useEffect(() => {
    setPage(1);
  }, [processed.displayRows.length]);

  const pageCount = Math.max(1, Math.ceil(processed.displayRows.length / rowsPerPage));

  useEffect(() => {
    if (page > pageCount) {
      setPage(pageCount);
    }
  }, [page, pageCount]);

  const pagedRows = useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    return processed.displayRows.slice(start, start + rowsPerPage);
  }, [page, rowsPerPage, processed.displayRows]);
  const baseIndex = (page - 1) * rowsPerPage;

  const selectedManualLeaderName = useMemo(() => {
    if (!manualForm.agent_id) return "";
    const selected = agentsOptions.find(agent => agent.id === manualForm.agent_id);
    return selected?.name || "";
  }, [agentsOptions, manualForm.agent_id]);

  const filteredManualAgents = useMemo(() => {
    const query = manualLookupInputs.agent.trim().toLowerCase();
    if (!query) return agentsOptions;
    return agentsOptions.filter(agent =>
      (agent.name || "").toLowerCase().includes(query) ||
      (agent.id || "").toLowerCase().includes(query)
    );
  }, [agentsOptions, manualLookupInputs.agent]);

  const selectedManualLeadsDepotName = useMemo(() => {
    if (!manualForm.leads_depot_id) return "";
    const selected = depotsOptions.find(depot => depot.id === manualForm.leads_depot_id);
    return selected?.name || "";
  }, [depotsOptions, manualForm.leads_depot_id]);

  const selectedManualSalesDepotName = useMemo(() => {
    if (!manualForm.sales_depot_id) return "";
    const selected = depotsOptions.find(depot => depot.id === manualForm.sales_depot_id);
    return selected?.name || "";
  }, [depotsOptions, manualForm.sales_depot_id]);

  const filteredManualLeadsDepots = useMemo(() => {
    const query = manualLookupInputs.leads_depot_id.trim().toLowerCase();
    if (!query) return depotsOptions;
    return depotsOptions.filter(depot =>
      (depot.name || "").toLowerCase().includes(query) ||
      (depot.id || "").toLowerCase().includes(query)
    );
  }, [depotsOptions, manualLookupInputs.leads_depot_id]);

  const filteredManualSalesDepots = useMemo(() => {
    const query = manualLookupInputs.sales_depot_id.trim().toLowerCase();
    if (!query) return depotsOptions;
    return depotsOptions.filter(depot =>
      (depot.name || "").toLowerCase().includes(query) ||
      (depot.id || "").toLowerCase().includes(query)
    );
  }, [depotsOptions, manualLookupInputs.sales_depot_id]);

  function exportXlsx() {
    const exportRows = processed.displayRows.map((row, idx) => {
      const warningText = row.displayWarnings?.length
        ? row.displayWarnings.map(warn => `Warning: ${warn}`)
        : [];
      const issueText = [...(row.displayErrors ?? []), ...warningText].join("; ");
      const duplicateBadges = [
        row.merge_count > 1 ? `Merged (${row.merge_count})` : null,
        row.dup_base_row ? "Row exists" : null,
      ].filter(Boolean);

      return {
        "#": idx + 1,
        Date: row.date_real || "-",
        "Leader Name": row.leader_name_input,
        "Leads Depot": row.leads_depot_name || "-",
        "Sales Depot": row.sales_depot_name || "-",
        Leads: row.leads,
        Payins: row.payins,
        Sales: row.sales,
        "Duplicates / Merge": duplicateBadges.length ? duplicateBadges.join(" / ") : "-",
        Status: row.displayStatus,
        Errors: issueText,
      };
    });
    const filename = `upload-preview-${new Date().toISOString().slice(0, 10)}.xlsx`;
    exportToXlsx({ rows: exportRows, filename, sheetName: "Upload Preview" });
  }

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
    setActiveManualSelect("");
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
    setError("");
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
      const message = e?.message || "Failed to save";
      setError(message);
      setSaveResult({
        insertedCount: 0,
        upsertedCount: 0,
        errors: [message],
        skipped: rows.length - processed.rowsForSave.length,
      });
    }
  }

  function handleManualAgentChange(value) {
    const normalized = value.trim().toLowerCase();
    const exactMatch = agentsOptions.find(agent =>
      (agent.name || "").trim().toLowerCase() === normalized ||
      (agent.id || "").trim().toLowerCase() === normalized
    );
    setManualLookupInputs(prev => ({
      ...prev,
      agent: value,
    }));
    setManualForm(prev => ({
      ...prev,
      agent_id: exactMatch?.id ?? "",
    }));
  }

  function handleManualLeaderSelect(agent) {
    if (!agent) return;
    setManualLookupInputs(prev => ({
      ...prev,
      agent: agent.name || "",
    }));
    setManualForm(prev => ({
      ...prev,
      agent_id: agent.id,
    }));
  }

  function handleManualDepotInputChange(field, value) {
    const normalized = value.trim().toLowerCase();
    const exactMatch = depotsOptions.find(depot =>
      (depot.name || "").trim().toLowerCase() === normalized ||
      (depot.id || "").trim().toLowerCase() === normalized
    );
    setManualLookupInputs(prev => ({
      ...prev,
      [field]: value,
    }));
    setManualForm(prev => ({
      ...prev,
      [field]: exactMatch?.id ?? "",
    }));
  }

  function handleManualDepotSelect(field, depot) {
    if (!depot) return;
    setManualLookupInputs(prev => ({
      ...prev,
      [field]: depot.name || "",
    }));
    setManualForm(prev => ({
      ...prev,
      [field]: depot.id,
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
      setActiveManualSelect("");
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
    <div className="card upload-page">
      <div className="card-title">Upload Raw Data</div>
      <div className="muted">Import the Daily Data template (.xlsx) and review rows before saving.</div>

      <div className="upload-header-actions" style={{ marginTop: 12 }}>
        <button
          type="button"
          className="button secondary upload-manual-btn"
          onClick={() => {
            setManualError("");
            setManualOpen(true);
            setActiveManualSelect("");
          }}
          disabled={manualLoading}
        >
          Manual Input
        </button>
        <button type="button" className="button ghost upload-template-btn" onClick={downloadTemplate}>
          Download Template
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
        <div className="upload-icon" aria-hidden>
          <svg width="30" height="30" viewBox="0 0 24 24" focusable="false">
            <path
              fill="currentColor"
              d="M6 3.75A2.25 2.25 0 0 0 3.75 6v12A2.25 2.25 0 0 0 6 20.25h12A2.25 2.25 0 0 0 20.25 18V8.19a.75.75 0 0 0-.22-.53l-3.69-3.69a.75.75 0 0 0-.53-.22H6Zm0 1.5h8.5V8a1 1 0 0 0 1 1h3.25V18a.75.75 0 0 1-.75.75H6A.75.75 0 0 1 5.25 18V6A.75.75 0 0 1 6 5.25Zm10 .56L18.69 8H16.5a.5.5 0 0 1-.5-.5V5.81ZM8 11.25a.75.75 0 0 1 .75-.75h6.5a.75.75 0 0 1 0 1.5h-6.5a.75.75 0 0 1-.75-.75Zm0 3a.75.75 0 0 1 .75-.75h6.5a.75.75 0 0 1 0 1.5h-6.5a.75.75 0 0 1-.75-.75Z"
            />
          </svg>
        </div>
        <div className="dropzone__content">
          <div className="dropzone__title">Select or drop an .xlsx file</div>
          <div className="dropzone__sub">.xlsx only. Sheet name "Daily Data" or first sheet.</div>
          <button
            type="button"
            className="button primary dropzone__cta upload-browse-btn"
            onClick={e => { e.stopPropagation(); inputRef.current?.click(); }}
          >
            Browse files
          </button>
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

      {(fileName || rows.length > 0) ? (
        <div className="upload-file-meta">
          <div className="upload-file-meta__label">File:</div>
          <div className="upload-file-meta__value">
            {fileName} {meta ? `(Sheet: ${meta.sheetName}, Rows: ${meta.totalRows})` : ""}
          </div>
          <button className="button" type="button" onClick={resetUpload}>
            <ReplaceIcon />
            Replace file
          </button>
          <ExportButton
            onClick={exportXlsx}
            loading={false}
            disabled={!processed.displayRows.length || loading}
            label="Export XLSX"
          />
        </div>
      ) : null}

      <div className="upload-import">
        <div className="upload-import__title">Import Mode</div>
        <div className="upload-import__options">
          <button
            type="button"
            className={`import-option${importMode === "warn" ? " is-active" : ""}`}
            onClick={() => { setImportMode("warn"); setSaveResult(null); }}
          >
            <span className="import-option__icon"><WarnIcon /></span>
            Warn (upsert)
            <span>Flag duplicates, overwrite existing rows.</span>
          </button>
          <button
            type="button"
            className={`import-option${importMode === "upsert" ? " is-active" : ""}`}
            onClick={() => { setImportMode("upsert"); setSaveResult(null); }}
          >
            <span className="import-option__icon"><UpsertIcon /></span>
            Upsert
            <span>Update existing rows or insert new ones.</span>
          </button>
          <button
            type="button"
            className={`import-option${importMode === "insert_only" ? " is-active" : ""}`}
            onClick={() => { setImportMode("insert_only"); setSaveResult(null); }}
          >
            <span className="import-option__icon"><InsertIcon /></span>
            Insert Only
            <span>Skip duplicates entirely.</span>
          </button>
        </div>
      </div>

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
                {pagedRows.map((row, idx) => {
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
                      <div>{baseIndex + idx + 1}</div>
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

          <div className="upload-pagination-row">
            <AppPagination
              count={pageCount}
              page={page}
              onChange={setPage}
              totalItems={processed.displayRows.length}
              pageSize={rowsPerPage}
            />
            <div className="save-bar">
              <button className="button primary" disabled={!processed.rowsForSave.length || loading} onClick={handleSave}>
                Save to Database
              </button>
              {saveProgress.total ? (
                <div className="muted">Saving {saveProgress.done}/{saveProgress.total}…</div>
              ) : null}
            </div>
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
        title="Manual Input"
        compactHeader
        onClose={() => {
          setManualOpen(false);
          setActiveManualSelect("");
        }}
        onOverlayClose={() => {
          setManualOpen(false);
          setActiveManualSelect("");
        }}
        onSubmit={handleManualSubmit}
        footer={(
          <>
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                setManualOpen(false);
                setActiveManualSelect("");
              }}
            >
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
        <div className="manual-input-grid">
          <div className="field manual-input-grid__date">
            <label>Date <span className="req">*</span></label>
            <input
              type="date"
              value={manualForm.date_real}
              onChange={e => setManualForm(prev => ({ ...prev, date_real: e.target.value }))}
              required
            />
          </div>
          <div className="manual-input-grid__leader">
            <FloatingSelectField
              label="Leader"
              required
              placeholder="Select leader"
              searchPlaceholder="Search leader"
              valueText={selectedManualLeaderName}
              searchValue={manualLookupInputs.agent}
              onSearchChange={handleManualAgentChange}
              options={filteredManualAgents}
              selectedId={manualForm.agent_id}
              onSelect={handleManualLeaderSelect}
              emptyText="No leaders found."
              isOpen={activeManualSelect === "leader"}
              onOpenChange={open => setActiveManualSelect(open ? "leader" : "")}
            />
          </div>
          <div className="field manual-input-grid__payins">
            <label>Payins</label>
            <input
              type="number"
              min="0"
              step="1"
              value={manualForm.payins}
              onChange={e => setManualForm(prev => ({ ...prev, payins: e.target.value }))}
            />
          </div>
          <div className="field manual-input-grid__col">
            <label>Leads</label>
            <input
              type="number"
              min="0"
              step="1"
              value={manualForm.leads}
              onChange={e => setManualForm(prev => ({ ...prev, leads: e.target.value }))}
            />
          </div>
          <div className="manual-input-grid__col">
            <FloatingSelectField
              label="Leads Depot"
              required
              placeholder="Select leads depot"
              searchPlaceholder="Search leads depot"
              valueText={selectedManualLeadsDepotName}
              searchValue={manualLookupInputs.leads_depot_id}
              onSearchChange={value => handleManualDepotInputChange("leads_depot_id", value)}
              options={filteredManualLeadsDepots}
              selectedId={manualForm.leads_depot_id}
              onSelect={depot => handleManualDepotSelect("leads_depot_id", depot)}
              emptyText="No depots found."
              isOpen={activeManualSelect === "leads_depot"}
              onOpenChange={open => setActiveManualSelect(open ? "leads_depot" : "")}
            />
          </div>
          <div className="field manual-input-grid__col manual-input-grid__sales">
            <label>Sales</label>
            <input
              type="number"
              min="0"
              step="1"
              value={manualForm.sales}
              onChange={e => setManualForm(prev => ({ ...prev, sales: e.target.value }))}
            />
          </div>
          <div className="manual-input-grid__col manual-input-grid__sales-depot">
            <FloatingSelectField
              label="Sales Depot"
              required
              placeholder="Select sales depot"
              searchPlaceholder="Search sales depot"
              valueText={selectedManualSalesDepotName}
              searchValue={manualLookupInputs.sales_depot_id}
              onSearchChange={value => handleManualDepotInputChange("sales_depot_id", value)}
              options={filteredManualSalesDepots}
              selectedId={manualForm.sales_depot_id}
              onSelect={depot => handleManualDepotSelect("sales_depot_id", depot)}
              emptyText="No depots found."
              isOpen={activeManualSelect === "sales_depot"}
              onOpenChange={open => setActiveManualSelect(open ? "sales_depot" : "")}
            />
          </div>
        </div>
      </ModalForm>
    </div>
  );
}

