import * as XLSX from "xlsx";
import { listAgents } from "./agents.service";
import { listProductCenterUnits } from "./productCenterUnits.service";
import { ensureSessionOrThrow, supabase } from "./supabase";

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function normalizeHeaderName(header = "") {
  return header
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeName(name = "") {
  return name
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[.,'"()[\]{}]/g, "")
    .replace(/\s+/g, " ");
}

function formatDateParts(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function validateDateParts(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;

  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return formatDateParts(y, m, d);
}

function parseDateCell(value) {
  if (value === null || value === undefined || value === "") {
    return { dateReal: null, originalValue: value, error: "Missing Date" };
  }

  if (value instanceof Date) {
    const y = value.getUTCFullYear();
    const m = value.getUTCMonth() + 1;
    const d = value.getUTCDate();
    return { dateReal: formatDateParts(y, m, d), originalValue: value };
  }

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed && parsed.y && parsed.m && parsed.d) {
      return { dateReal: formatDateParts(parsed.y, parsed.m, parsed.d), originalValue: value };
    }
    return { dateReal: null, originalValue: value, error: "Invalid Date" };
  }

  const str = value.toString().trim();
  if (!str) {
    return { dateReal: null, originalValue: value, error: "Missing Date" };
  }

  const ymdMatch = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(str);
  if (ymdMatch) {
    const [, y, m, d] = ymdMatch;
    const formatted = validateDateParts(Number(y), Number(m), Number(d));
    if (formatted) return { dateReal: formatted, originalValue: value };
    return { dateReal: null, originalValue: value, error: "Invalid Date" };
  }

  const mdyMatch = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(str);
  if (mdyMatch) {
    const [, m, d, y] = mdyMatch;
    const formatted = validateDateParts(Number(y), Number(m), Number(d));
    if (formatted) return { dateReal: formatted, originalValue: value };
    return { dateReal: null, originalValue: value, error: "Invalid Date" };
  }

  return { dateReal: null, originalValue: value, error: "Invalid Date" };
}

function parseNumber(value, field, errors) {
  if (value === null || value === undefined || value === "") return 0;
  const num = Number(value);
  if (Number.isFinite(num)) return num;
  errors.push(`Invalid number for ${field}`);
  return 0;
}

const HEADER_ALIASES_V2 = {
  leader_name: ["leader", "leader_name", "platoon_leader", "platoon leader", "name"],
  date: ["date"],
  leads: ["leads"],
  payins: ["payins", "pay_ins", "pay in", "pay ins"],
  sales: ["sales"],
  activation: ["activation", "activations"],
  leads_unit_type: ["leads_unit_type", "leads_category", "leads_product_center_type"],
  sales_unit_type: ["sales_unit_type", "sales_category", "sales_product_center_type"],
  activation_unit_type: [
    "activation_unit_type",
    "activation_category",
    "activation_product_center_type",
  ],
  leads_unit_name: ["leads_unit_name", "leads_product_center_unit", "leads_product_center_name"],
  sales_unit_name: ["sales_unit_name", "sales_product_center_unit", "sales_product_center_name"],
  activation_unit_name: [
    "activation_unit_name",
    "activation_product_center_unit",
    "activation_product_center_name",
  ],
};

const REQUIRED_FIELDS_V2 = [
  "date",
  "leader_name",
  "leads",
  "payins",
  "sales",
  "activation",
  "leads_unit_type",
  "sales_unit_type",
  "activation_unit_type",
];

function findHeaderKeyV2(normalizedHeader) {
  for (const [key, aliases] of Object.entries(HEADER_ALIASES_V2)) {
    if (aliases.includes(normalizedHeader)) return key;
  }
  return null;
}

export function computeRawDataV2IdentityKey({
  date_real,
  agent_id,
  leads_product_center_unit_id,
  sales_product_center_unit_id,
  activation_product_center_unit_id,
}) {
  if (
    !date_real ||
    !agent_id ||
    !leads_product_center_unit_id ||
    !sales_product_center_unit_id ||
    !activation_product_center_unit_id
  ) {
    return "";
  }

  return [
    date_real,
    agent_id,
    leads_product_center_unit_id,
    sales_product_center_unit_id,
    activation_product_center_unit_id,
  ].join("__");
}

function buildMergeKey(row = {}) {
  return computeRawDataV2IdentityKey({
    date_real: row.date_real,
    agent_id: row.agent_id ?? row.resolved_agent_id,
    leads_product_center_unit_id: row.leads_product_center_unit_id,
    sales_product_center_unit_id: row.sales_product_center_unit_id,
    activation_product_center_unit_id: row.activation_product_center_unit_id,
  });
}

export function mergeRawDataV2RowsByIdentity(rows = []) {
  const merged = [];
  const map = new Map();

  rows.forEach((row) => {
    const key = buildMergeKey(row);
    if (!key) {
      merged.push({
        ...row,
        merge_count: row.merge_count ?? 1,
        merge_notes: Array.isArray(row.merge_notes) ? [...row.merge_notes] : [],
      });
      return;
    }

    const existing = map.get(key);
    if (!existing) {
      const base = {
        ...row,
        merge_count: row.merge_count ?? 1,
        merge_notes: Array.isArray(row.merge_notes) ? [...row.merge_notes] : [],
        dup_base_row: Boolean(row.dup_base_row),
      };
      map.set(key, base);
      merged.push(base);
      return;
    }

    existing.leads = toNumber(existing.leads) + toNumber(row.leads);
    existing.payins = toNumber(existing.payins) + toNumber(row.payins);
    existing.sales = toNumber(existing.sales) + toNumber(row.sales);
    existing.activation = toNumber(existing.activation) + toNumber(row.activation);
    existing.status =
      existing.status === "invalid" || row.status === "invalid" ? "invalid" : "valid";
    existing.errors = Array.from(new Set([...(existing.errors ?? []), ...(row.errors ?? [])]));
    existing.suggestions = Array.from(
      new Set([...(existing.suggestions ?? []), ...(row.suggestions ?? [])])
    );
    existing.merge_notes = Array.from(
      new Set([...(existing.merge_notes ?? []), ...(row.merge_notes ?? [])])
    );
    existing.merge_count += row.merge_count ?? 1;
    existing.dup_base_row = Boolean(existing.dup_base_row || row.dup_base_row);
  });

  map.forEach((row) => {
    if (row.merge_count > 1) {
      row.merge_notes = Array.from(
        new Set([
          ...(row.merge_notes ?? []),
          "Merged duplicate rows for same leader/date/product-center assignment",
        ])
      );
    }
  });

  return merged;
}

async function buildAgentLookups() {
  const agents = await listAgents();
  const byId = new Map();
  const byNameNormalized = new Map();

  (agents ?? []).forEach((agent) => {
    const normalized = {
      id: agent.id,
      name: agent.name ?? "",
      companyId: agent.companyId ?? "",
      platoonId: agent.platoonId ?? "",
      role: agent.role ?? "",
    };
    byId.set(normalized.id, normalized);
    const normName = normalizeName(normalized.name);
    if (!byNameNormalized.has(normName)) byNameNormalized.set(normName, []);
    byNameNormalized.get(normName).push(normalized);
  });

  return { byId, byNameNormalized };
}

function resolveLeaderName(leaderNameInput, lookups, errors) {
  const leaderName = leaderNameInput?.toString().trim();
  if (!leaderName) {
    errors.push("Missing leader name");
    return { resolvedId: "", suggestions: [] };
  }

  const normName = normalizeName(leaderName);
  const matches = lookups.byNameNormalized.get(normName) ?? [];
  if (matches.length === 1) return { resolvedId: matches[0].id, suggestions: [] };
  if (matches.length > 1) {
    errors.push("Ambiguous leader name. Matches multiple participants.");
    return {
      resolvedId: "",
      suggestions: matches.slice(0, 5).map((agent) => `${agent.name} - ${agent.id}`),
    };
  }

  errors.push("Leader not found");
  return { resolvedId: "", suggestions: [] };
}

function normalizeUnitTypeValue(input = "") {
  const value = input.toString().trim().toLowerCase();
  return value === "city" ? "city" : value === "depot" ? "depot" : "";
}

export async function normalizeRawDataRowsV2(inputRows = [], _options = {}, onProgress = () => {}) {
  const progressCb = typeof onProgress === "function" ? onProgress : () => {};
  const parseStart = Date.now();
  const [lookups, units] = await Promise.all([buildAgentLookups(), listProductCenterUnits()]);
  const unitNames = Object.fromEntries((units ?? []).map((unit) => [unit.id, unit.name]));
  const unitTypes = Object.fromEntries((units ?? []).map((unit) => [unit.id, unit.unit_type]));
  const unitsByType = (units ?? []).reduce((map, unit) => {
    const unitType = normalizeUnitTypeValue(unit?.unit_type);
    if (!unitType) return map;
    if (!map.has(unitType)) map.set(unitType, []);
    map.get(unitType).push(unit);
    return map;
  }, new Map());

  const rows = [];
  const totalRows = inputRows.length;
  progressCb(0, totalRows, "processing");

  for (let idx = 0; idx < inputRows.length; idx += 1) {
    const rawRow = inputRows[idx] ?? {};
    const errors = [];

    const dateInput = rawRow.date_original ?? rawRow.date_real ?? rawRow.date ?? "";
    const { dateReal, originalValue: originalDate, error: dateError } = parseDateCell(dateInput);
    if (dateError) errors.push(dateError);

    const leads = parseNumber(rawRow.leads, "Leads", errors);
    const payins = parseNumber(rawRow.payins, "Payins", errors);
    const sales = parseNumber(rawRow.sales, "Sales", errors);
    const activation = parseNumber(rawRow.activation, "Activation", errors);

    const inputAgentId = rawRow.agent_id ?? rawRow.resolved_agent_id ?? "";
    let leader_name_input = rawRow.leader_name_input?.toString().trim() ?? "";
    let resolved_agent_id = "";
    let suggestions = [];

    if (inputAgentId) {
      const agent = lookups.byId.get(inputAgentId);
      if (agent) {
        resolved_agent_id = agent.id;
        if (!leader_name_input) leader_name_input = agent.name ?? "";
      } else {
        errors.push("Leader not found");
      }
    } else {
      const resolved = resolveLeaderName(leader_name_input, lookups, errors);
      resolved_agent_id = resolved.resolvedId;
      suggestions = resolved.suggestions;
    }

    const resolveUnit = ({ idField, typeField, label }) => {
      const existingId = rawRow[idField] ?? null;
      if (existingId) {
        return {
          id: existingId,
          error: null,
        };
      }

      const unitType = normalizeUnitTypeValue(rawRow[typeField]);
      if (!unitType) {
        return { id: null, error: `Invalid ${label} category type` };
      }

      const matches = unitsByType.get(unitType) ?? [];
      const preferred = matches.find(
        unit => (unit?.name || "").trim().toLowerCase() === unitType
      );
      const unit = preferred ?? (matches.length === 1 ? matches[0] : null);
      return {
        id: unit?.id ?? null,
        error: unit ? null : `${label} category: ${unitType} unit type is not configured`,
      };
    };

    const leadsUnit = resolveUnit({
      idField: "leads_product_center_unit_id",
      typeField: "leads_unit_type",
      label: "leads",
    });
    const salesUnit = resolveUnit({
      idField: "sales_product_center_unit_id",
      typeField: "sales_unit_type",
      label: "sales",
    });
    const activationUnit = resolveUnit({
      idField: "activation_product_center_unit_id",
      typeField: "activation_unit_type",
      label: "activation",
    });

    if (!leadsUnit.id || leadsUnit.error) errors.push(leadsUnit.error || "Invalid leads category");
    if (!salesUnit.id || salesUnit.error) errors.push(salesUnit.error || "Invalid sales category");
    if (!activationUnit.id || activationUnit.error) {
      errors.push(activationUnit.error || "Invalid activation category");
    }

    const date_real = dateReal ?? "";
    rows.push({
      sourceRowIndex: rawRow.sourceRowIndex ?? idx,
      excelRowNumber: rawRow.excelRowNumber ?? idx + 2,
      date_real,
      date_original: originalDate,
      leader_name_input,
      resolved_agent_id,
      agent_id: resolved_agent_id,
      leads_product_center_unit_id: leadsUnit.id,
      sales_product_center_unit_id: salesUnit.id,
      activation_product_center_unit_id: activationUnit.id,
      leads_product_center_unit_name: unitNames[leadsUnit.id] ?? "",
      leads_product_center_unit_type:
        rawRow.leads_unit_type ?? unitTypes[leadsUnit.id] ?? "",
      sales_product_center_unit_name: unitNames[salesUnit.id] ?? "",
      sales_product_center_unit_type:
        rawRow.sales_unit_type ?? unitTypes[salesUnit.id] ?? "",
      activation_product_center_unit_name: unitNames[activationUnit.id] ?? "",
      activation_product_center_unit_type:
        rawRow.activation_unit_type ?? unitTypes[activationUnit.id] ?? "",
      leads,
      payins,
      sales,
      activation,
      status: errors.length ? "invalid" : "valid",
      errors,
      suggestions,
      merge_count: rawRow.merge_count,
      merge_notes: rawRow.merge_notes,
      dup_base_row: rawRow.dup_base_row,
    });

    if ((idx + 1) % 50 === 0) {
      progressCb(idx + 1, totalRows, "processing");
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  if (totalRows) progressCb(totalRows, totalRows, "processing");

  const mergedRows = mergeRawDataV2RowsByIdentity(rows);
  const duplicateStart = Date.now();
  const existingKeys = new Set();

  const validIdentityRows = mergedRows.filter((row) => buildMergeKey(row));
  if (!validIdentityRows.length) {
    progressCb(totalRows, totalRows, "checking_duplicates");
  } else {
    const { data, error } = await supabase
      .from("raw_data_v2")
      .select(
        "date_real,agent_id,leads_product_center_unit_id,sales_product_center_unit_id,activation_product_center_unit_id"
      );
    if (error) throw error;
    (data ?? []).forEach((row) => {
      const key = buildMergeKey(row);
      if (key) existingKeys.add(key);
    });
    progressCb(totalRows, totalRows, "checking_duplicates");
  }

  const rowsWithDuplicates = mergedRows.map((row) => ({
    ...row,
    dup_base_row: Boolean(row.dup_base_row || existingKeys.has(buildMergeKey(row))),
  }));

  const parseEnd = Date.now();
  return {
    rows: rowsWithDuplicates,
    meta: {
      totalRows: rowsWithDuplicates.length,
      parseMs: duplicateStart - parseStart,
      duplicateCheckMs: parseEnd - duplicateStart,
    },
  };
}

export async function parseRawDataWorkbookV2(file, _options = {}, onProgress = () => {}) {
  if (!file) throw new Error("File is required");
  const progressCb = typeof onProgress === "function" ? onProgress : () => {};

  progressCb(0, 0, "reading");
  const buf = await file.arrayBuffer();
  const workbook = XLSX.read(buf, { type: "array" });

  const sheetName = workbook.SheetNames.includes("Daily Data")
    ? "Daily Data"
    : workbook.SheetNames[0];
  if (!sheetName) throw new Error("No sheets found in workbook");

  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: true });
  if (!rawRows.length) throw new Error("Sheet is empty");

  const headerMap = {};
  const headers = new Set();
  rawRows.forEach((row) => Object.keys(row).forEach((key) => headers.add(key)));
  headers.forEach((header) => {
    const key = findHeaderKeyV2(normalizeHeaderName(header));
    if (key && !(key in headerMap)) headerMap[key] = header;
  });

  const missingRequired = REQUIRED_FIELDS_V2.filter((field) => headerMap[field] === undefined);
  if (missingRequired.length) {
    throw new Error(`Missing required columns: ${missingRequired.join(", ")}`);
  }

  const inputRows = rawRows.map((rawRow, idx) => ({
    sourceRowIndex: idx,
    excelRowNumber: idx + 2,
    date_original: rawRow[headerMap.date],
    leader_name_input: rawRow[headerMap.leader_name],
    leads: rawRow[headerMap.leads],
    payins: rawRow[headerMap.payins],
    sales: rawRow[headerMap.sales],
    activation: rawRow[headerMap.activation],
    leads_unit_type: rawRow[headerMap.leads_unit_type],
    leads_unit_name: rawRow[headerMap.leads_unit_name],
    sales_unit_type: rawRow[headerMap.sales_unit_type],
    sales_unit_name: rawRow[headerMap.sales_unit_name],
    activation_unit_type: rawRow[headerMap.activation_unit_type],
    activation_unit_name: rawRow[headerMap.activation_unit_name],
  }));

  const { rows, meta } = await normalizeRawDataRowsV2(inputRows, {}, progressCb);

  return {
    rows,
    meta: {
      sheetName,
      totalRows: meta.totalRows,
      parseMs: meta.parseMs,
      duplicateCheckMs: meta.duplicateCheckMs,
    },
  };
}

function sanitizeRawDataV2Patch(patch = {}) {
  const payload = {};
  Object.entries(patch ?? {}).forEach(([key, value]) => {
    if (value === undefined) return;
    payload[key] = value;
  });
  return payload;
}

function buildUpsertPayload(row = {}) {
  const payload = {
    date_real: row.date_real ?? "",
    agent_id: row.agent_id ?? row.resolved_agent_id ?? "",
    leads: toNumber(row.leads),
    payins: toNumber(row.payins),
    sales: toNumber(row.sales),
    activation: toNumber(row.activation),
    leads_product_center_unit_id: row.leads_product_center_unit_id ?? null,
    sales_product_center_unit_id: row.sales_product_center_unit_id ?? null,
    activation_product_center_unit_id: row.activation_product_center_unit_id ?? null,
  };

  if (
    !payload.date_real ||
    !payload.agent_id ||
    !payload.leads_product_center_unit_id ||
    !payload.sales_product_center_unit_id ||
    !payload.activation_product_center_unit_id
  ) {
    return null;
  }

  return payload;
}

async function fetchAgentMap(ids = []) {
  const uniqueIds = Array.from(new Set((ids ?? []).filter(Boolean).map((id) => String(id))));
  if (!uniqueIds.length) return new Map();

  const agents = await listAgents();
  return new Map(
    (agents ?? [])
      .filter((agent) => uniqueIds.includes(String(agent.id)))
      .map((agent) => [String(agent.id), agent])
  );
}

async function fetchProductCenterUnitMap(ids = []) {
  const uniqueIds = Array.from(new Set((ids ?? []).filter(Boolean).map((id) => String(id))));
  if (!uniqueIds.length) return new Map();

  const units = await listProductCenterUnits();
  const maps = buildProductCenterUnitMaps(units);
  const byId = maps.byId ?? new Map();
  const result = new Map();

  uniqueIds.forEach((id) => {
    if (byId.has(id)) result.set(id, byId.get(id));
  });

  return result;
}

async function enrichRawDataV2Rows(rows = []) {
  if (!rows.length) return [];

  const agentIds = rows.map((row) => row.agent_id).filter(Boolean);
  const unitIds = rows.flatMap((row) => [
    row.leads_product_center_unit_id,
    row.sales_product_center_unit_id,
    row.activation_product_center_unit_id,
  ]);

  const [agentMap, unitMap] = await Promise.all([
    fetchAgentMap(agentIds),
    fetchProductCenterUnitMap(unitIds),
  ]);

  return rows.map((row) => {
    const agent = agentMap.get(String(row.agent_id ?? "")) ?? null;
    const leadsUnit = unitMap.get(String(row.leads_product_center_unit_id ?? "")) ?? null;
    const salesUnit = unitMap.get(String(row.sales_product_center_unit_id ?? "")) ?? null;
    const activationUnit =
      unitMap.get(String(row.activation_product_center_unit_id ?? "")) ?? null;

    return {
      ...row,
      agent_name: agent?.name ?? "",
      agent_role: agent?.role ?? "",
      companyId: agent?.companyId ?? "",
      platoonId: agent?.platoonId ?? "",
      uplineAgentId: agent?.uplineAgentId ?? "",
      leads_product_center_unit_name: leadsUnit?.name ?? "",
      leads_product_center_unit_type: leadsUnit?.unit_type ?? "",
      sales_product_center_unit_name: salesUnit?.name ?? "",
      sales_product_center_unit_type: salesUnit?.unit_type ?? "",
      activation_product_center_unit_name: activationUnit?.name ?? "",
      activation_product_center_unit_type: activationUnit?.unit_type ?? "",
      identity_key: computeRawDataV2IdentityKey(row),
    };
  });
}

function applyRawDataV2Filters(
  query,
  {
    dateFrom,
    dateTo,
    agentId,
    leadsProductCenterUnitId,
    salesProductCenterUnitId,
    activationProductCenterUnitId,
    limit = 200,
  } = {}
) {
  let q = query;
  if (dateFrom) q = q.gte("date_real", dateFrom);
  if (dateTo) q = q.lte("date_real", dateTo);
  if (agentId) q = q.eq("agent_id", agentId);
  if (leadsProductCenterUnitId) {
    q = q.eq("leads_product_center_unit_id", leadsProductCenterUnitId);
  }
  if (salesProductCenterUnitId) {
    q = q.eq("sales_product_center_unit_id", salesProductCenterUnitId);
  }
  if (activationProductCenterUnitId) {
    q = q.eq("activation_product_center_unit_id", activationProductCenterUnitId);
  }

  const safeLimit = Number(limit);
  if (Number.isFinite(safeLimit) && safeLimit > 0) {
    q = q.limit(safeLimit);
  }

  return q.order("date_real", { ascending: false });
}

export async function listRawDataV2({
  dateFrom,
  dateTo,
  agentId,
  leadsProductCenterUnitId,
  salesProductCenterUnitId,
  activationProductCenterUnitId,
  limit = 200,
  includeVoided = false,
} = {}) {
  let query = supabase.from("raw_data_v2").select("*");
  if (!includeVoided) query = query.eq("voided", false);

  const { data, error } = await applyRawDataV2Filters(query, {
    dateFrom,
    dateTo,
    agentId,
    leadsProductCenterUnitId,
    salesProductCenterUnitId,
    activationProductCenterUnitId,
    limit,
  });

  if (error) throw error;
  return enrichRawDataV2Rows(data ?? []);
}

export async function getRawDataV2History(options = {}) {
  return listRawDataV2(options);
}

export async function listPublishingRowsV2({
  dateFrom,
  dateTo,
  agentId,
  status,
  limit,
} = {}) {
  let query = supabase.from("raw_data_v2").select("*");

  if (status === "published") query = query.eq("published", true).eq("voided", false);
  if (status === "unpublished") query = query.eq("published", false).eq("voided", false);
  if (status === "voided") query = query.eq("voided", true);

  const { data, error } = await applyRawDataV2Filters(query, {
    dateFrom,
    dateTo,
    agentId,
    limit,
  });

  if (error) throw error;
  return enrichRawDataV2Rows(data ?? []);
}

export async function upsertRawDataV2(rows = []) {
  await ensureSessionOrThrow(120);
  const payload = rows.map((row) => buildUpsertPayload(row)).filter(Boolean);
  if (!payload.length) return [];

  const { data, error } = await supabase
    .from("raw_data_v2")
    .upsert(payload, {
      onConflict:
        "date_real,agent_id,leads_product_center_unit_id,sales_product_center_unit_id,activation_product_center_unit_id",
    })
    .select("*");

  if (error) throw error;
  return enrichRawDataV2Rows(data ?? []);
}

export async function updateRawDataV2(id, patch = {}) {
  await ensureSessionOrThrow(120);

  const payload = sanitizeRawDataV2Patch(patch);
  const { data, error } = await supabase
    .from("raw_data_v2")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  const enriched = await enrichRawDataV2Rows(data ? [data] : []);
  return enriched[0] ?? null;
}

export async function setRawDataV2Published(id, published, publishReason = null) {
  return updateRawDataV2(id, {
    published: Boolean(published),
    publish_reason: publishReason?.trim() || null,
  });
}

export async function setRawDataV2Voided(id, voided, voidReason = null) {
  return updateRawDataV2(id, {
    voided: Boolean(voided),
    void_reason: voided ? voidReason?.trim() || null : null,
    voided_at: voided ? new Date().toISOString() : null,
  });
}

export async function deleteRawDataV2(id) {
  await ensureSessionOrThrow(120);
  const { error } = await supabase.from("raw_data_v2").delete().eq("id", id);
  if (error) throw error;
}

export async function listPublishableRawDataV2({ startDate, endDate } = {}) {
  let query = supabase.from("publishable_raw_data_v2").select("*");
  if (startDate) query = query.gte("date_real", startDate);
  if (endDate) query = query.lte("date_real", endDate);

  const { data, error } = await query.order("date_real", { ascending: false });
  if (error) throw error;
  return enrichRawDataV2Rows(data ?? []);
}
