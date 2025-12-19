import React, { useEffect, useMemo, useState } from "react";
import { listAgents } from "../services/agents.service";
import { deleteRawData, listRawData, updateRawData } from "../services/rawData.service";

function formatNumber(value) {
  if (value === null || value === undefined || value === "") return "—";
  const num = Number(value);
  if (Number.isNaN(num)) return "—";
  return num.toLocaleString();
}

function formatCurrency(value) {
  if (value === null || value === undefined || value === "") return "—";
  const num = Number(value);
  if (Number.isNaN(num)) return "—";
  return num.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 });
}

function toTimestamp(dateStr) {
  if (!dateStr) return null;
  const parsed = new Date(`${dateStr}T00:00:00`).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

const TAB_CONFIG = {
  leaders: {
    key: "leaders",
    label: "Leaders",
    columnHeader: "Leader",
    filterLabel: "Leader",
    getFilterValue: row => row.agent_id || "",
    getFilterLabel: row => {
      if (row.leaderName) return `${row.leaderName} (${row.agent_id})`;
      return row.agent_id || "Unknown leader";
    },
    renderCell: row => (
      <div>
        <div>{row.leaderName || "—"}</div>
        <div className="muted" style={{ fontSize: 12 }}>{row.agent_id}</div>
      </div>
    ),
  },
  depots: {
    key: "depots",
    label: "Depots",
    columnHeader: "Depot",
    filterLabel: "Depot",
    getFilterValue: (row, agentMap) => agentMap[row.agent_id]?.depotId || row.depotName || "",
    getFilterLabel: row => row.depotName || "Unknown depot",
    renderCell: row => row.depotName || "—",
  },
  companies: {
    key: "companies",
    label: "Companies",
    columnHeader: "Company",
    filterLabel: "Company",
    getFilterValue: (row, agentMap) => agentMap[row.agent_id]?.companyId || row.companyName || "",
    getFilterLabel: row => row.companyName || "Unknown company",
    renderCell: row => row.companyName || "—",
  },
  platoons: {
    key: "platoons",
    label: "Platoons",
    columnHeader: "Platoon",
    filterLabel: "Platoon",
    getFilterValue: (row, agentMap) => agentMap[row.agent_id]?.platoonId || row.platoonName || "",
    getFilterLabel: row => row.platoonName || "Unknown platoon",
    renderCell: row => row.platoonName || "—",
  },
};

const initialFilters = {
  dateFrom: "",
  dateTo: "",
  leaders: "",
  depots: "",
  companies: "",
  platoons: "",
};

const LEADERS_TAB_KEY = TAB_CONFIG.leaders.key;

export default function Updates() {
  const [rows, setRows] = useState([]);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const [filtersInput, setFiltersInput] = useState(initialFilters);
  const [filtersApplied, setFiltersApplied] = useState(initialFilters);
  const [activeTab, setActiveTab] = useState(TAB_CONFIG.leaders.key);

  const [editingId, setEditingId] = useState("");
  const [editValues, setEditValues] = useState({ leads: "", payins: "", sales: "" });

  const agentMap = useMemo(() => Object.fromEntries(agents.map(a => [a.id, a])), [agents]);

  const filterOptions = useMemo(() => {
    const config = TAB_CONFIG[activeTab];
    const optionsMap = new Map();

    rows.forEach(row => {
      const value = config.getFilterValue(row, agentMap);
      if (!value) return;
      if (optionsMap.has(value)) return;
      const label = config.getFilterLabel(row, agentMap);
      optionsMap.set(value, label);
    });

    return Array.from(optionsMap, ([value, label]) => ({ value, label })).sort((a, b) =>
      a.label.localeCompare(b.label)
    );
  }, [activeTab, agentMap, rows]);

  useEffect(() => {
    listAgents()
      .then(data => setAgents(data))
      .catch(e => console.error("Failed to load agents", e));
  }, []);

  useEffect(() => {
    applyFilters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredRows = useMemo(() => {
    const config = TAB_CONFIG[activeTab];
    const activeValue = filtersApplied[activeTab];

    const fromTs = toTimestamp(filtersApplied.dateFrom);
    const toTs = toTimestamp(filtersApplied.dateTo);

    return rows
      .filter(row => {
        const rowTs = toTimestamp(row.date_real);
        if ((fromTs !== null || toTs !== null) && rowTs === null) return false;
        if (fromTs !== null && rowTs < fromTs) return false;
        if (toTs !== null && rowTs > toTs) return false;
        if (!activeValue) return true;
        return config.getFilterValue(row, agentMap) === activeValue;
      })
      .sort((a, b) => {
        const aDate = toTimestamp(a.date_real) ?? 0;
        const bDate = toTimestamp(b.date_real) ?? 0;
        if (aDate === bDate) return (b.id || "").toString().localeCompare((a.id || "").toString());
        return bDate - aDate;
      });
  }, [activeTab, agentMap, filtersApplied, rows]);

  useEffect(() => {
    if (import.meta?.env?.DEV) {
      // Debug aid for verifying filtering behavior in development only
      const dates = rows
        .map(row => toTimestamp(row.date_real))
        .filter(value => value !== null)
        .sort((a, b) => a - b);
      const minDate = dates.length ? new Date(dates[0]).toISOString().slice(0, 10) : null;
      const maxDate = dates.length ? new Date(dates[dates.length - 1]).toISOString().slice(0, 10) : null;
      console.log("APPLIED FILTERS", filtersApplied);
      console.log("ROWS BEFORE", rows.length, "ROWS AFTER", filteredRows.length);
      console.log("DATE RANGE IN ROWS", { minDate, maxDate });
    }
  }, [filtersApplied, filteredRows.length, rows]);

  async function applyFilters(customFilters = filtersInput) {
    const normalizedFilters = { ...initialFilters, ...customFilters };

    // Applied filters drive the visible row filtering.
    setFiltersApplied(normalizedFilters);
    setLoading(true);
    setError("");
    setStatus("");
    try {
      const data = await listRawData({ dateFrom: normalizedFilters.dateFrom, dateTo: normalizedFilters.dateTo });
      setRows(data);
    } catch (e) {
      console.error(e);
      setError(e.message || "Failed to load updates");
    } finally {
      setLoading(false);
    }
  }

  async function clearFilters() {
    setFiltersInput(initialFilters);
    setEditingId("");
    setEditValues({ leads: "", payins: "", sales: "" });
    await applyFilters(initialFilters);
  }

  function startEdit(row) {
    if (activeTab !== LEADERS_TAB_KEY) return;
    setEditingId(row.id);
    setEditValues({
      leads: row.leads ?? "",
      payins: row.payins ?? "",
      sales: row.sales ?? "",
    });
    setStatus("");
    setError("");
  }

  function cancelEdit() {
    setEditingId("");
    setEditValues({ leads: "", payins: "", sales: "" });
  }

  useEffect(() => {
    if (activeTab !== LEADERS_TAB_KEY && editingId) {
      cancelEdit();
    }
  }, [activeTab, editingId]);

  function onEditValueChange(field, value) {
    setEditValues(prev => ({ ...prev, [field]: value }));
  }

  async function saveEdit(rowId) {
    const leadsNum = Number(editValues.leads);
    const payinsNum = Number(editValues.payins);
    const salesNum = Number(editValues.sales);
    if ([leadsNum, payinsNum, salesNum].some(n => Number.isNaN(n))) {
      setError("Please enter valid numbers for leads, payins, and sales.");
      return;
    }

    setSavingId(rowId);
    setError("");
    setStatus("");
    try {
      const updated = await updateRawData(rowId, { leads: leadsNum, payins: payinsNum, sales: salesNum });
      setRows(prev => prev.map(r => (r.id === rowId ? { ...r, ...updated } : r)));
      setStatus("Row updated successfully.");
      cancelEdit();
    } catch (e) {
      console.error(e);
      setError(e.message || "Failed to update row");
    } finally {
      setSavingId("");
    }
  }

  async function handleDelete(rowId) {
    const confirmed = window.confirm("Delete this entry? This cannot be undone.");
    if (!confirmed) return;

    setDeletingId(rowId);
    setError("");
    setStatus("");
    try {
      await deleteRawData(rowId);
      setRows(prev => prev.filter(r => r.id !== rowId));
      setStatus("Row deleted.");
    } catch (e) {
      console.error(e);
      const message = e?.message || "Failed to delete row";
      if (message.toLowerCase().includes("rls") || message.toLowerCase().includes("permission")) {
        setError("Delete blocked by RLS policy. Ensure admin is authenticated and raw_data delete policy allows authenticated.");
      } else {
        setError(message);
      }
    } finally {
      setDeletingId("");
    }
  }

  return (
    <div className="card">
      <div className="card-title">Updates History</div>
      <div className="muted">Review, edit, or delete uploaded daily performance data.</div>

      <div className="tabs" style={{ marginTop: 12 }}>
        {Object.values(TAB_CONFIG).map(tab => (
          <button
            key={tab.key}
            type="button"
            className={`tab-button${activeTab === tab.key ? " active" : ""}`}
            onClick={() => setActiveTab(tab.key)}
            disabled={loading}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="filters-row" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginTop: 16, alignItems: "end" }}>
        <div>
          <label className="input-label" htmlFor="dateFrom">Date From</label>
          <input
            id="dateFrom"
            type="date"
            value={filtersInput.dateFrom}
            onChange={e => setFiltersInput(prev => ({ ...prev, dateFrom: e.target.value }))}
            className="input"
          />
        </div>
        <div>
          <label className="input-label" htmlFor="dateTo">Date To</label>
          <input
            id="dateTo"
            type="date"
            value={filtersInput.dateTo}
            onChange={e => setFiltersInput(prev => ({ ...prev, dateTo: e.target.value }))}
            className="input"
          />
        </div>
        <div>
          <label className="input-label" htmlFor="groupingFilter">{TAB_CONFIG[activeTab].filterLabel}</label>
          <select
            id="groupingFilter"
            value={filtersInput[activeTab]}
            onChange={e => setFiltersInput(prev => ({ ...prev, [activeTab]: e.target.value }))}
            className="input"
          >
            <option value="">All {TAB_CONFIG[activeTab].label.toLowerCase()}</option>
            {filterOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="button primary" type="button" onClick={applyFilters} disabled={loading}>
            Apply Filters
          </button>
          <button className="button secondary" type="button" onClick={clearFilters} disabled={loading}>
            Clear
          </button>
        </div>
      </div>

      {(error || status) ? (
        <div style={{ marginTop: 12 }}>
          {error ? <div className="error-box" role="alert">{error}</div> : null}
          {status ? <div className="hint">{status}</div> : null}
        </div>
      ) : null}

      {loading ? <div className="muted" style={{ marginTop: 12 }}>Loading updates…</div> : null}

      <div className="table-scroll" style={{ marginTop: 16 }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>{TAB_CONFIG[activeTab].columnHeader}</th>
              <th>Leads</th>
              <th>Payins</th>
              <th>Sales</th>
              <th>Computed ID</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map(row => {
              const isEditing = activeTab === LEADERS_TAB_KEY && row.id === editingId;
              return (
                <tr key={row.id}>
                  <td>{row.date_real}</td>
                  <td>{TAB_CONFIG[activeTab].renderCell(row, agentMap)}</td>
                  <td>
                    {isEditing ? (
                      <input
                        type="number"
                        className="input"
                        value={editValues.leads}
                        onChange={e => onEditValueChange("leads", e.target.value)}
                        style={{ maxWidth: 120 }}
                      />
                    ) : formatNumber(row.leads)}
                  </td>
                  <td>
                    {isEditing ? (
                      <input
                        type="number"
                        className="input"
                        value={editValues.payins}
                        onChange={e => onEditValueChange("payins", e.target.value)}
                        style={{ maxWidth: 120 }}
                      />
                    ) : formatNumber(row.payins)}
                  </td>
                  <td>
                    {isEditing ? (
                      <input
                        type="number"
                        className="input"
                        value={editValues.sales}
                        onChange={e => onEditValueChange("sales", e.target.value)}
                        style={{ maxWidth: 140 }}
                      />
                    ) : formatCurrency(row.sales)}
                  </td>
                  <td>
                    <div className="muted" style={{ fontSize: 12 }}>{row.id}</div>
                  </td>
                  <td>
                    {isEditing ? (
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          className="button primary"
                          type="button"
                          onClick={() => saveEdit(row.id)}
                          disabled={savingId === row.id}
                        >
                          {savingId === row.id ? "Saving…" : "Save"}
                        </button>
                        <button className="button secondary" type="button" onClick={cancelEdit} disabled={savingId === row.id}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: 8 }}>
                        {activeTab === LEADERS_TAB_KEY ? (
                          <button
                            className="button secondary"
                            type="button"
                            onClick={() => startEdit(row)}
                            disabled={savingId === row.id || deletingId === row.id}
                          >
                            Edit
                          </button>
                        ) : (
                          <button
                            className="button secondary"
                            type="button"
                            disabled
                            title="Edit available only in Leaders tab"
                          >
                            Edit
                          </button>
                        )}
                        <button
                          className="button secondary"
                          type="button"
                          onClick={() => handleDelete(row.id)}
                          disabled={deletingId === row.id || savingId === row.id}
                          style={{ background: "#ffe8e8", color: "#b00020" }}
                        >
                          {deletingId === row.id ? "Deleting…" : "Delete"}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {!filteredRows.length && !loading ? (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: 16 }} className="muted">
                  No data to display.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
