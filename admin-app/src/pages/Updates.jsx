import React, { useEffect, useMemo, useState } from "react";
import "../styles/pages/updates.css";
import { ModalForm } from "../components/ModalForm";
import { FloatingSelectField } from "../components/FloatingSelectField";
import AppPagination from "../components/AppPagination";
import ExportButton from "../components/ExportButton";
import { exportToXlsx } from "../services/export.service";
import { listAgents } from "../services/agents.service";
import { listActiveProductCenterUnits } from "../services/productCenterUnits.service";
import { getRawDataV2History, updateRawDataV2 } from "../services/rawDataV2.service";
import { getMyProfile } from "../services/profile.service";

function normalizeToYmd(input) {
  if (!input) return "";
  const s = String(input).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const match = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    const mm = String(match[1]).padStart(2, "0");
    const dd = String(match[2]).padStart(2, "0");
    const yyyy = String(match[3]);
    return `${yyyy}-${mm}-${dd}`;
  }

  return "";
}

function toTsYmd(ymd) {
  const normalized = normalizeToYmd(ymd);
  if (!normalized) return null;
  const ts = new Date(`${normalized}T00:00:00`).getTime();
  return Number.isNaN(ts) ? null : ts;
}

function getPhDateYmd(offsetDays = 0) {
  const now = Date.now() + offsetDays * 24 * 60 * 60 * 1000;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now));
}

function isPhTodayOrYesterday(dateValue) {
  if (!dateValue) return false;
  const day = normalizeToYmd(dateValue);
  return day === getPhDateYmd(0) || day === getPhDateYmd(-1);
}

function formatProductCenterUnitLabel(unit) {
  if (!unit) return "";
  const type = unit.unit_type ? String(unit.unit_type).toUpperCase() : "";
  return type ? `${type} - ${unit.name || unit.id}` : unit.name || unit.id;
}

const initialFilters = {
  dateFrom: "",
  dateTo: "",
  leaderId: "",
  leadsProductCenterUnitId: "",
  salesProductCenterUnitId: "",
  activationProductCenterUnitId: "",
};

const ADMIN_ROLES = new Set(["admin", "super_admin"]);

function EditIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M16.862 3.487a1.5 1.5 0 0 1 2.12 0l1.531 1.531a1.5 1.5 0 0 1 0 2.12l-9.94 9.94a1 1 0 0 1-.474.26l-4.12.94a.75.75 0 0 1-.9-.9l.94-4.12a1 1 0 0 1 .26-.474l9.94-9.94Zm1.06 2.12L8.47 15.06l-.51 2.24 2.24-.51 9.45-9.45-1.73-1.73ZM4 20.25c0-.414.336-.75.75-.75h14.5a.75.75 0 0 1 0 1.5H4.75a.75.75 0 0 1-.75-.75Z"
      />
    </svg>
  );
}

export default function Updates() {
  const [agents, setAgents] = useState([]);
  const [productCenterUnits, setProductCenterUnits] = useState([]);
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const rowsPerPage = 10;

  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const [filtersInput, setFiltersInput] = useState(initialFilters);
  const [filtersApplied, setFiltersApplied] = useState(initialFilters);
  const [filterSearch, setFilterSearch] = useState({
    leaderId: "",
    leadsProductCenterUnitId: "",
    salesProductCenterUnitId: "",
    activationProductCenterUnitId: "",
  });

  const [editingRow, setEditingRow] = useState(null);
  const [editValues, setEditValues] = useState({
    leads: "",
    payins: "",
    sales: "",
    activation: "",
  });

  const [profile, setProfile] = useState(null);
  const currentRole = profile?.role || "";
  const isAdmin = ADMIN_ROLES.has(currentRole);
  const isUser = currentRole === "user";

  const leadInvalid =
    editingRow &&
    (editValues.leads === "" || Number.isNaN(Number(editValues.leads)) || Number(editValues.leads) < 0);
  const payinsInvalid =
    editingRow &&
    (editValues.payins === "" || Number.isNaN(Number(editValues.payins)) || Number(editValues.payins) < 0);
  const salesInvalid =
    editingRow &&
    (editValues.sales === "" || Number.isNaN(Number(editValues.sales)) || Number(editValues.sales) < 0);
  const activationInvalid =
    editingRow &&
    (editValues.activation === "" ||
      Number.isNaN(Number(editValues.activation)) ||
      Number(editValues.activation) < 0);
  const canSaveEdit =
    editingRow &&
    !leadInvalid &&
    !payinsInvalid &&
    !salesInvalid &&
    !activationInvalid &&
    savingId !== editingRow?.id;

  const agentMap = useMemo(() => {
    const map = {};
    for (const agent of agents) map[agent.id] = agent;
    return map;
  }, [agents]);

  const leaderFilterLabel = useMemo(() => {
    if (!filtersInput.leaderId) return "";
    const found = agents.find((agent) => String(agent.id) === String(filtersInput.leaderId));
    return found?.name || "";
  }, [agents, filtersInput.leaderId]);

  const leadsProductCenterFilterLabel = useMemo(() => {
    if (!filtersInput.leadsProductCenterUnitId) return "";
    const found = productCenterUnits.find(
      (unit) => String(unit.id) === String(filtersInput.leadsProductCenterUnitId)
    );
    return formatProductCenterUnitLabel(found);
  }, [productCenterUnits, filtersInput.leadsProductCenterUnitId]);

  const salesProductCenterFilterLabel = useMemo(() => {
    if (!filtersInput.salesProductCenterUnitId) return "";
    const found = productCenterUnits.find(
      (unit) => String(unit.id) === String(filtersInput.salesProductCenterUnitId)
    );
    return formatProductCenterUnitLabel(found);
  }, [productCenterUnits, filtersInput.salesProductCenterUnitId]);

  const activationProductCenterFilterLabel = useMemo(() => {
    if (!filtersInput.activationProductCenterUnitId) return "";
    const found = productCenterUnits.find(
      (unit) => String(unit.id) === String(filtersInput.activationProductCenterUnitId)
    );
    return formatProductCenterUnitLabel(found);
  }, [productCenterUnits, filtersInput.activationProductCenterUnitId]);

  const leaderFilterOptions = useMemo(() => {
    const q = filterSearch.leaderId.trim().toLowerCase();
    const base = agents.map((agent) => ({ id: agent.id, name: agent.name || agent.id }));
    if (!q) return base;
    return base.filter(
      (option) => option.name.toLowerCase().includes(q) || option.id.toLowerCase().includes(q)
    );
  }, [agents, filterSearch.leaderId]);

  const productCenterOptions = useMemo(
    () =>
      productCenterUnits.map((unit) => ({
        id: unit.id,
        name: formatProductCenterUnitLabel(unit),
      })),
    [productCenterUnits]
  );

  const leadsProductCenterFilterOptions = useMemo(() => {
    const q = filterSearch.leadsProductCenterUnitId.trim().toLowerCase();
    if (!q) return productCenterOptions;
    return productCenterOptions.filter(
      (option) => option.name.toLowerCase().includes(q) || option.id.toLowerCase().includes(q)
    );
  }, [filterSearch.leadsProductCenterUnitId, productCenterOptions]);

  const salesProductCenterFilterOptions = useMemo(() => {
    const q = filterSearch.salesProductCenterUnitId.trim().toLowerCase();
    if (!q) return productCenterOptions;
    return productCenterOptions.filter(
      (option) => option.name.toLowerCase().includes(q) || option.id.toLowerCase().includes(q)
    );
  }, [filterSearch.salesProductCenterUnitId, productCenterOptions]);

  const activationProductCenterFilterOptions = useMemo(() => {
    const q = filterSearch.activationProductCenterUnitId.trim().toLowerCase();
    if (!q) return productCenterOptions;
    return productCenterOptions.filter(
      (option) => option.name.toLowerCase().includes(q) || option.id.toLowerCase().includes(q)
    );
  }, [filterSearch.activationProductCenterUnitId, productCenterOptions]);

  function canManageRow(row) {
    if (!row) return false;
    if (isAdmin) return true;
    if (!isUser) return false;
    return (
      String(row.agent_id || "") === String(profile?.agent_id || "") &&
      isPhTodayOrYesterday(row.date_real) &&
      !row.voided
    );
  }

  useEffect(() => {
    (async () => {
      try {
        const data = await listAgents();
        setAgents(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error(err);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const data = await listActiveProductCenterUnits();
        setProductCenterUnits(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error(err);
      }
    })();
  }, []);

  useEffect(() => {
    let mounted = true;
    getMyProfile()
      .then((data) => {
        if (!mounted) return;
        setProfile(data);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err?.message || "Failed to load profile");
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!profile?.role) return;
    const seeded =
      profile.role === "user"
        ? { ...initialFilters, leaderId: profile.agent_id ?? "" }
        : initialFilters;
    setFiltersInput(seeded);
    setFiltersApplied(seeded);
    void applyFilters(seeded);
  }, [profile?.role, profile?.agent_id]);

  async function applyFilters(customFilters = filtersInput) {
    const normalized = { ...initialFilters, ...(customFilters || {}) };
    normalized.dateFrom = normalizeToYmd(normalized.dateFrom);
    normalized.dateTo = normalizeToYmd(normalized.dateTo);
    if (profile?.role === "user") {
      normalized.leaderId = profile?.agent_id ?? "";
    }

    setFiltersApplied(normalized);
    setLoading(true);
    setError("");
    setStatus("");

    try {
      const data = await getRawDataV2History({
        dateFrom: normalized.dateFrom,
        dateTo: normalized.dateTo,
        agentId: normalized.leaderId,
        leadsProductCenterUnitId: normalized.leadsProductCenterUnitId,
        salesProductCenterUnitId: normalized.salesProductCenterUnitId,
        activationProductCenterUnitId: normalized.activationProductCenterUnitId,
        limit: 500,
        includeVoided: true,
      });
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setError(err?.message || "Failed to load updates");
    } finally {
      setLoading(false);
    }
  }

  async function clearFilters() {
    const resetFilters =
      profile?.role === "user"
        ? { ...initialFilters, leaderId: profile?.agent_id ?? "" }
        : initialFilters;
    setFiltersInput(resetFilters);
    setFiltersApplied(resetFilters);
    setFilterSearch({
      leaderId: "",
      leadsProductCenterUnitId: "",
      salesProductCenterUnitId: "",
      activationProductCenterUnitId: "",
    });
    cancelEdit();
    await applyFilters(resetFilters);
  }

  const visibleRows = useMemo(() => {
    const fromTs = toTsYmd(filtersApplied.dateFrom);
    const toTs = toTsYmd(filtersApplied.dateTo);
    const selectedLeaderId = filtersApplied.leaderId;
    const filteredLeadsUnitId = filtersApplied.leadsProductCenterUnitId;
    const filteredSalesUnitId = filtersApplied.salesProductCenterUnitId;
    const filteredActivationUnitId = filtersApplied.activationProductCenterUnitId;

    const filtered = rows.filter((row) => {
      const rowTs = toTsYmd(row.date_real);
      if ((fromTs !== null || toTs !== null) && rowTs === null) return false;
      if (fromTs !== null && rowTs < fromTs) return false;
      if (toTs !== null && rowTs > toTs) return false;
      if (selectedLeaderId && String(row.agent_id || "") !== String(selectedLeaderId)) return false;
      if (
        filteredLeadsUnitId &&
        String(row.leads_product_center_unit_id || "") !== String(filteredLeadsUnitId)
      ) {
        return false;
      }
      if (
        filteredSalesUnitId &&
        String(row.sales_product_center_unit_id || "") !== String(filteredSalesUnitId)
      ) {
        return false;
      }
      if (
        filteredActivationUnitId &&
        String(row.activation_product_center_unit_id || "") !== String(filteredActivationUnitId)
      ) {
        return false;
      }
      return true;
    });

    filtered.sort((a, b) => {
      const ad = toTsYmd(a.date_real) ?? 0;
      const bd = toTsYmd(b.date_real) ?? 0;
      if (ad === bd) return String(b.id || "").localeCompare(String(a.id || ""));
      return bd - ad;
    });

    return filtered;
  }, [filtersApplied, rows]);

  useEffect(() => {
    setPage(1);
  }, [visibleRows.length]);

  const pageCount = Math.max(1, Math.ceil(visibleRows.length / rowsPerPage));

  useEffect(() => {
    if (page > pageCount) {
      setPage(pageCount);
    }
  }, [page, pageCount]);

  const pagedRows = useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    return visibleRows.slice(start, start + rowsPerPage);
  }, [page, rowsPerPage, visibleRows]);

  function exportXlsx() {
    const exportRows = visibleRows.map((row) => ({
      Date: row.date_real,
      Leader: row.agent_name || "(Restricted)",
      "Leads Product Center": row.leads_product_center_unit_name || "-",
      Leads: row.leads ?? "-",
      "Sales Product Center": row.sales_product_center_unit_name || "-",
      Payins: row.payins ?? "-",
      Sales: row.sales ?? "-",
      "Activation Product Center": row.activation_product_center_unit_name || "-",
      Activation: row.activation ?? "-",
      Published: row.published ? "Published" : "Unpublished",
      Status: row.voided ? "Voided" : "Active",
    }));
    const filename = `updates-history-${new Date().toISOString().slice(0, 10)}.xlsx`;
    exportToXlsx({ rows: exportRows, filename, sheetName: "Updates" });
  }

  function startEdit(row) {
    if (row.voided) return;
    if (!canManageRow(row)) {
      setError("You do not have permission to edit this entry.");
      return;
    }

    setEditingRow(row);
    setEditValues({
      leads: row.leads ?? "",
      payins: row.payins ?? "",
      sales: row.sales ?? "",
      activation: row.activation ?? "",
    });
    setError("");
    setStatus("");
  }

  function cancelEdit() {
    setEditingRow(null);
    setEditValues({ leads: "", payins: "", sales: "", activation: "" });
  }

  function onEditChange(field, value) {
    setEditValues((prev) => ({ ...prev, [field]: value }));
  }

  async function saveEdit(rowId) {
    const leadsNum = Number(editValues.leads);
    const payinsNum = Number(editValues.payins);
    const salesNum = Number(editValues.sales);
    const activationNum = Number(editValues.activation);

    if ([leadsNum, payinsNum, salesNum, activationNum].some((n) => Number.isNaN(n))) {
      setError("Please enter valid numbers for leads, payins, sales, and activation.");
      return;
    }

    const targetRow = rows.find((row) => row.id === rowId);
    if (!targetRow || !canManageRow(targetRow)) {
      setError("You do not have permission to edit this entry.");
      return;
    }

    setSavingId(rowId);
    setError("");
    setStatus("");

    try {
      const updated = await updateRawDataV2(rowId, {
        leads: leadsNum,
        payins: payinsNum,
        sales: salesNum,
        activation: activationNum,
      });

      setRows((prev) => prev.map((row) => (row.id === rowId ? updated : row)));
      setStatus("Entry updated.");
      cancelEdit();
    } catch (err) {
      console.error(err);
      setError(err?.message || "Failed to update entry");
    } finally {
      setSavingId("");
    }
  }

  const tableColumnCount = 12;

  return (
    <div className="card updates-page">
      <div className="card-title">{isUser ? "My Updates" : "Updates History"}</div>
      <div className="muted">
        {isUser
          ? "Review your entries and apply filters."
          : "Review and edit uploaded daily performance data."}
      </div>
      {isUser ? (
        <div className="updates-user-note">
          You can only <strong>edit</strong> rows dated today/yesterday (PH timezone).
        </div>
      ) : null}

      <div className="updates-filters">
        <div className="updates-filter-row">
          <div>
            <label className="form-label">Date From</label>
            <input
              type="date"
              className="input"
              value={filtersInput.dateFrom}
              onChange={(e) => setFiltersInput((prev) => ({ ...prev, dateFrom: e.target.value }))}
            />
          </div>

          <div>
            <label className="form-label">Date To</label>
            <input
              type="date"
              className="input"
              value={filtersInput.dateTo}
              onChange={(e) => setFiltersInput((prev) => ({ ...prev, dateTo: e.target.value }))}
            />
          </div>
        </div>

        <div className="updates-filter-row">
          {!isUser ? (
            <div>
              <FloatingSelectField
                label="Leader"
                placeholder="All leaders"
                searchPlaceholder="Search leader"
                valueText={leaderFilterLabel}
                searchValue={filterSearch.leaderId}
                onSearchChange={(value) => setFilterSearch((prev) => ({ ...prev, leaderId: value }))}
                options={leaderFilterOptions}
                selectedId={filtersInput.leaderId}
                onSelect={(option) => {
                  setFiltersInput((prev) => ({ ...prev, leaderId: option.id }));
                  setFilterSearch((prev) => ({ ...prev, leaderId: option.name }));
                }}
                emptyText="No leaders found."
              />
            </div>
          ) : null}

          <div>
            <FloatingSelectField
              label="Leads Product Center"
              placeholder="All product centers"
              searchPlaceholder="Search leads product center"
              valueText={leadsProductCenterFilterLabel}
              searchValue={filterSearch.leadsProductCenterUnitId}
              onSearchChange={(value) =>
                setFilterSearch((prev) => ({ ...prev, leadsProductCenterUnitId: value }))
              }
              options={leadsProductCenterFilterOptions}
              selectedId={filtersInput.leadsProductCenterUnitId}
              onSelect={(option) => {
                setFiltersInput((prev) => ({ ...prev, leadsProductCenterUnitId: option.id }));
                setFilterSearch((prev) => ({ ...prev, leadsProductCenterUnitId: option.name }));
              }}
              emptyText="No product centers found."
            />
          </div>

          <div>
            <FloatingSelectField
              label="Sales Product Center"
              placeholder="All product centers"
              searchPlaceholder="Search sales product center"
              valueText={salesProductCenterFilterLabel}
              searchValue={filterSearch.salesProductCenterUnitId}
              onSearchChange={(value) =>
                setFilterSearch((prev) => ({ ...prev, salesProductCenterUnitId: value }))
              }
              options={salesProductCenterFilterOptions}
              selectedId={filtersInput.salesProductCenterUnitId}
              onSelect={(option) => {
                setFiltersInput((prev) => ({ ...prev, salesProductCenterUnitId: option.id }));
                setFilterSearch((prev) => ({ ...prev, salesProductCenterUnitId: option.name }));
              }}
              emptyText="No product centers found."
            />
          </div>

          <div>
            <FloatingSelectField
              label="Activation Product Center"
              placeholder="All product centers"
              searchPlaceholder="Search activation product center"
              valueText={activationProductCenterFilterLabel}
              searchValue={filterSearch.activationProductCenterUnitId}
              onSearchChange={(value) =>
                setFilterSearch((prev) => ({ ...prev, activationProductCenterUnitId: value }))
              }
              options={activationProductCenterFilterOptions}
              selectedId={filtersInput.activationProductCenterUnitId}
              onSelect={(option) => {
                setFiltersInput((prev) => ({
                  ...prev,
                  activationProductCenterUnitId: option.id,
                }));
                setFilterSearch((prev) => ({
                  ...prev,
                  activationProductCenterUnitId: option.name,
                }));
              }}
              emptyText="No product centers found."
            />
          </div>
        </div>

        <div className="updates-filter-actions">
          <button
            type="button"
            className="button primary"
            onClick={() => applyFilters(filtersInput)}
            disabled={loading}
          >
            Apply Filters
          </button>

          <button type="button" className="button secondary" onClick={clearFilters} disabled={loading}>
            Clear Filters
          </button>

          <ExportButton
            onClick={exportXlsx}
            loading={false}
            disabled={loading || !visibleRows.length}
            label="Export XLSX"
          />
        </div>
      </div>

      {(error || status) && (
        <div style={{ marginTop: 12 }}>
          {error ? (
            <div className="error-box" role="alert">
              {error}
            </div>
          ) : null}
          {status ? <div className="hint">{status}</div> : null}
        </div>
      )}

      {loading ? (
        <div className="muted" style={{ marginTop: 12 }}>
          Loading...
        </div>
      ) : null}

      <div className="table-scroll updates-table-wrap">
        <table className="updates-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Leader</th>
              <th>Leads Product Center</th>
              <th className="num">Leads</th>
              <th>Sales Product Center</th>
              <th className="num">Payins</th>
              <th className="num">Sales</th>
              <th>Activation Product Center</th>
              <th className="num">Activation</th>
              <th className="center">Published</th>
              <th className="center">Status</th>
              <th className="center">Actions</th>
            </tr>
          </thead>

          <tbody>
            {pagedRows.map((row) => (
              <tr key={row.id}>
                <td>{row.date_real}</td>
                <td>
                  <div>{row.agent_name || "(Restricted)"}</div>
                </td>
                <td>{row.leads_product_center_unit_name || "—"}</td>
                <td className="num">{row.leads ?? "—"}</td>
                <td>{row.sales_product_center_unit_name || "—"}</td>
                <td className="num">{row.payins ?? "—"}</td>
                <td className="num">{row.sales ?? "—"}</td>
                <td>{row.activation_product_center_unit_name || "—"}</td>
                <td className="num">{row.activation ?? "—"}</td>
                <td className="center">
                  <span className={`status-pill ${row.published ? "valid" : "muted"}`}>
                    {row.published ? "Published" : "Unpublished"}
                  </span>
                </td>
                <td className="center">
                  <span className={`status-pill ${row.voided ? "invalid" : "muted"}`}>
                    {row.voided ? "Voided" : "Active"}
                  </span>
                </td>
                <td className="center">
                  {canManageRow(row) ? (
                    <div className="updates-row-actions">
                      <button
                        type="button"
                        className="btn-link icon-btn"
                        onClick={() => startEdit(row)}
                        aria-label={`Edit ${row.agent_name || "entry"}`}
                      >
                        <EditIcon />
                      </button>
                    </div>
                  ) : (
                    <span className="muted">-</span>
                  )}
                </td>
              </tr>
            ))}

            {!visibleRows.length && !loading ? (
              <tr>
                <td
                  colSpan={tableColumnCount}
                  className="muted"
                  style={{ textAlign: "center", padding: 16 }}
                >
                  No data to display.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <AppPagination
        count={pageCount}
        page={page}
        onChange={setPage}
        totalItems={visibleRows.length}
        pageSize={rowsPerPage}
      />

      <ModalForm
        isOpen={Boolean(editingRow)}
        title="Edit Row"
        onClose={cancelEdit}
        onOverlayClose={cancelEdit}
        onSubmit={(e) => {
          e.preventDefault();
          if (editingRow && canSaveEdit) saveEdit(editingRow.id);
        }}
        footer={
          <>
            <button
              type="button"
              className="button secondary"
              onClick={cancelEdit}
              disabled={savingId === editingRow?.id}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="button primary"
              disabled={!canSaveEdit}
              title={
                !canSaveEdit
                  ? "Fill in valid non-negative values for Leads, Payins, Sales, and Activation."
                  : ""
              }
            >
              {savingId === editingRow?.id ? "Saving..." : "Save"}
            </button>
          </>
        }
      >
        <div className="edit-modal">
          <div className="edit-modal__section">
            <div className="edit-modal__title">Locked fields</div>
            <div className="edit-modal__summary">
              <div>
                <div className="form-label edit-modal__label">Date</div>
                <strong>{editingRow?.date_real || "-"}</strong>
              </div>
              <div>
                <div className="form-label edit-modal__label">Leads Product Center</div>
                <strong>{editingRow?.leads_product_center_unit_name || "-"}</strong>
              </div>
              <div>
                <div className="form-label edit-modal__label">Sales Product Center</div>
                <strong>{editingRow?.sales_product_center_unit_name || "-"}</strong>
              </div>
              <div>
                <div className="form-label edit-modal__label">Activation Product Center</div>
                <strong>{editingRow?.activation_product_center_unit_name || "-"}</strong>
              </div>
              <div>
                <div className="form-label edit-modal__label">Leader</div>
                <strong>{editingRow?.agent_name || "(Restricted)"}</strong>
              </div>
            </div>
            <div className="hint">
              Date and product-center assignments are locked because they are part of the row ID.
              Changing them would create a new row.
            </div>
          </div>

          <div className="edit-modal__section">
            <div className="edit-modal__title">Editable metrics</div>
            <div className="edit-modal__grid">
              <label className="form-field">
                <span className="form-label edit-modal__label">Leads</span>
                <input
                  type="number"
                  className={`input${leadInvalid ? " input-error" : ""}`}
                  min="0"
                  value={editValues.leads}
                  onChange={(e) => onEditChange("leads", e.target.value)}
                />
                {leadInvalid && <div className="field-error">Enter 0 or a positive number.</div>}
              </label>
              <label className="form-field">
                <span className="form-label edit-modal__label">Payins</span>
                <input
                  type="number"
                  className={`input${payinsInvalid ? " input-error" : ""}`}
                  min="0"
                  value={editValues.payins}
                  onChange={(e) => onEditChange("payins", e.target.value)}
                />
                {payinsInvalid && (
                  <div className="field-error">Enter 0 or a positive number.</div>
                )}
              </label>
              <label className="form-field">
                <span className="form-label edit-modal__label">Sales</span>
                <input
                  type="number"
                  className={`input${salesInvalid ? " input-error" : ""}`}
                  min="0"
                  value={editValues.sales}
                  onChange={(e) => onEditChange("sales", e.target.value)}
                />
                {salesInvalid && (
                  <div className="field-error">Enter 0 or a positive number.</div>
                )}
              </label>
              <label className="form-field">
                <span className="form-label edit-modal__label">Activation</span>
                <input
                  type="number"
                  className={`input${activationInvalid ? " input-error" : ""}`}
                  min="0"
                  value={editValues.activation}
                  onChange={(e) => onEditChange("activation", e.target.value)}
                />
                {activationInvalid && (
                  <div className="field-error">Enter 0 or a positive number.</div>
                )}
              </label>
            </div>
          </div>
        </div>
      </ModalForm>
    </div>
  );
}
