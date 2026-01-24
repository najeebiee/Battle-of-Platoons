import * as XLSX from "xlsx";
import { listAgents } from "./agents.service";
import { listCompanies } from "./companies.service";
import { buildDepotMaps, listDepots, resolveDepotId } from "./depots.service";
import { listPlatoons } from "./platoons.service";
import { supabase } from "./supabase";

// FINDINGS: raw_data is unique by (date_real, agent_id, leads_depot_id, sales_depot_id).
// The UI should align to the DB uniqueness rule, so we merge by the full identity and compute ids with depots.

const HEADER_ALIASES = {
  leader_name: ["leader", "leader_name", "platoon_leader", "platoon leader", "name"],
  date: ["date"],
  leads: ["leads"],
  payins: ["payins", "pay ins", "pay_in", "pay in"],
  sales: ["sales"],
  leads_depot: ["leads_depot", "leads_depot_id", "leads_depot_name", "leads depot"],
  sales_depot: ["sales_depot", "sales_depot_id", "sales_depot_name", "sales depot"],
};

const REQUIRED_FIELDS = ["date", "leader_name", "leads", "payins", "sales", "leads_depot", "sales_depot"];

const WEEK_FINALIZED_MESSAGE =
  "This week has been finalized. Only Super Admins can modify or audit rows until it is reopened.";

function mapWeekFinalizedMessage(message = "") {
  if (message.toLowerCase().includes("week is finalized")) {
    return WEEK_FINALIZED_MESSAGE;
  }
  if (message.toLowerCase().includes("raw_data_unique_triplet")) {
    return "Database uniqueness is still (date_real, agent_id). Apply migration to include depot columns.";
  }
  return message;
}

function normalizeSupabaseError(error) {
  if (!error) return new Error("Unknown database error");
  const normalized = new Error(mapWeekFinalizedMessage(error.message || "Unknown database error"));
  normalized.code = error.code;
  normalized.cause = error;
  return normalized;
}

function normalizeHeaderName(header = "") {
  return header
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function findHeaderKey(normalizedHeader) {
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(normalizedHeader)) return key;
  }
  return null;
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

function normalizeDepotKey(depotId) {
  if (depotId === null || depotId === undefined) return "none";
  const trimmed = depotId.toString().trim();
  return trimmed ? trimmed : "none";
}

export function computeRawDataId({ date_real, agent_id, leads_depot_id, sales_depot_id }) {
  if (!date_real || !agent_id || !leads_depot_id || !sales_depot_id) return "";
  return `${date_real}_${agent_id}_${leads_depot_id}_${sales_depot_id}`;
}

function buildMergeKey({ date_real, resolved_agent_id, leads_depot_id, sales_depot_id }) {
  if (!date_real || !resolved_agent_id || !leads_depot_id || !sales_depot_id) return "";
  const leadsDepotKey = normalizeDepotKey(leads_depot_id);
  const salesDepotKey = normalizeDepotKey(sales_depot_id);
  return `${date_real}__${resolved_agent_id}__${leadsDepotKey}__${salesDepotKey}`;
}

function parseMergeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

export function mergeRawDataRowsByIdentity(rows) {
  const merged = [];
  const map = new Map();

  rows.forEach(row => {
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

    existing.leads = parseMergeNumber(existing.leads) + parseMergeNumber(row.leads);
    existing.payins = parseMergeNumber(existing.payins) + parseMergeNumber(row.payins);
    existing.sales = parseMergeNumber(existing.sales) + parseMergeNumber(row.sales);
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

  map.forEach(row => {
    if (row.merge_count > 1) {
      row.merge_notes = Array.from(
        new Set([
          ...(row.merge_notes ?? []),
          "Merged duplicate rows for same leader/date/lead depot/sales depot",
        ])
      );
    }
  });

  return merged;
}

export async function normalizeRawDataRows(inputRows = [], _options = {}, onProgress = () => {}) {
  const progressCb = typeof onProgress === "function" ? onProgress : () => {};
  const parseStart = Date.now();
  const [lookups, depots, companies, platoons] = await Promise.all([
    buildAgentLookups(),
    listDepots(),
    listCompanies(),
    listPlatoons(),
  ]);
  const depotMaps = buildDepotMaps(depots);
  const lookupMaps = {
    depotNames: Object.fromEntries((depots ?? []).map(d => [d.id, d.name])),
    companyNames: Object.fromEntries((companies ?? []).map(c => [c.id, c.name])),
    platoonNames: Object.fromEntries((platoons ?? []).map(p => [p.id, p.name])),
  };

  const rows = [];
  const totalRows = inputRows.length;
  progressCb(0, totalRows, "processing");

  for (let idx = 0; idx < inputRows.length; idx++) {
    const rawRow = inputRows[idx] ?? {};
    const errors = [];

    const dateInput = rawRow.date_original ?? rawRow.date_real ?? rawRow.date ?? "";
    const { dateReal, originalValue: originalDate, error: dateError } = parseDateCell(dateInput);
    if (dateError) errors.push(dateError);

    const leads = parseNumber(rawRow.leads, "Leads", errors);
    const payins = parseNumber(rawRow.payins, "Payins", errors);
    const sales = parseNumber(rawRow.sales, "Sales", errors);

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
      const resolved = resolveLeaderName(leader_name_input, lookups, lookupMaps, errors);
      resolved_agent_id = resolved.resolvedId;
      suggestions = resolved.suggestions;
    }

    const leadsDepotIdInput = rawRow.leads_depot_id ?? rawRow.leads_depotId ?? null;
    const salesDepotIdInput = rawRow.sales_depot_id ?? rawRow.sales_depotId ?? null;
    const leadsDepotLabel =
      rawRow.leads_depot_input ?? rawRow.leads_depot_name ?? rawRow.leads_depot ?? "";
    const salesDepotLabel =
      rawRow.sales_depot_input ?? rawRow.sales_depot_name ?? rawRow.sales_depot ?? "";

    const leadsDepotResult = leadsDepotIdInput
      ? { depot_id: leadsDepotIdInput, error: null }
      : resolveDepotId(leadsDepotLabel, depotMaps);
    const salesDepotResult = salesDepotIdInput
      ? { depot_id: salesDepotIdInput, error: null }
      : resolveDepotId(salesDepotLabel, depotMaps);

    if (!leadsDepotResult.depot_id || leadsDepotResult.error) {
      errors.push("Invalid leads depot");
    }

    if (!salesDepotResult.depot_id || salesDepotResult.error) {
      errors.push("Invalid sales depot");
    }

    const date_real = dateReal ?? "";
    const computedId = computeRawDataId({
      date_real,
      agent_id: resolved_agent_id,
      leads_depot_id: leadsDepotResult.depot_id,
      sales_depot_id: salesDepotResult.depot_id,
    });

    rows.push({
      sourceRowIndex: rawRow.sourceRowIndex ?? idx,
      excelRowNumber: rawRow.excelRowNumber ?? idx + 2,
      date_real,
      date_original: originalDate,
      leader_name_input,
      resolved_agent_id,
      computedId,
      leads_depot_id: leadsDepotResult.depot_id,
      sales_depot_id: salesDepotResult.depot_id,
      leads_depot_name: lookupMaps.depotNames?.[leadsDepotResult.depot_id] ?? "",
      sales_depot_name: lookupMaps.depotNames?.[salesDepotResult.depot_id] ?? "",
      leads,
      payins,
      sales,
      status: errors.length ? "invalid" : "valid",
      errors,
      suggestions,
      merge_count: rawRow.merge_count,
      merge_notes: rawRow.merge_notes,
      dup_base_row: rawRow.dup_base_row,
    });

    if ((idx + 1) % 50 === 0) {
      progressCb(idx + 1, totalRows, "processing");
      // yield to event loop to keep UI responsive
      // eslint-disable-next-line no-await-in-loop
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  if (totalRows) {
    progressCb(totalRows, totalRows, "processing");
  }

  const mergedRows = mergeRawDataRowsByIdentity(rows);

  const duplicateStart = Date.now();
  const computedIds = Array.from(
    new Set(mergedRows.filter(row => row.computedId).map(row => row.computedId))
  );

  const existingRows = new Set();
  const chunkSize = 400;
  if (!computedIds.length) {
    progressCb(totalRows, totalRows, "checking_duplicates");
  } else {
    for (let i = 0; i < computedIds.length; i += chunkSize) {
      const chunk = computedIds.slice(i, i + chunkSize);
      const progressDone = Math.min(
        totalRows,
        Math.round(((i + chunk.length) / computedIds.length) * totalRows)
      );
      progressCb(progressDone, totalRows, "checking_duplicates");
      // eslint-disable-next-line no-await-in-loop
      const { data, error } = await supabase.from("raw_data").select("id").in("id", chunk);
      if (error) throw error;
      (data ?? []).forEach(item => {
        existingRows.add(item.id);
      });
      // eslint-disable-next-line no-await-in-loop
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    progressCb(totalRows, totalRows, "checking_duplicates");
  }

  const rowsWithDuplicates = mergedRows.map(row => {
    const dup_base_row = Boolean(row.computedId && existingRows.has(row.computedId));
    return {
      ...row,
      dup_base_row: Boolean(row.dup_base_row || dup_base_row),
    };
  });

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

export function isPublishable(companyRow, depotRow) {
  if (!companyRow && !depotRow) return false;
  return Boolean(companyRow?.published ?? depotRow?.published);
}

export function canEditRow(row, profile, agent) {
  if (!row || !profile?.role) return false;
  const role = profile.role;
  if (role === "super_admin" || role === "admin") return true;

  return false;
}

async function buildAgentLookups() {
  const agents = await listAgents();
  const byId = new Map();
  const byNameNormalized = new Map();

  agents.forEach(agent => {
    const normalized = normalizeAgentRecord(agent);
    byId.set(normalized.id, normalized);
    const normName = normalizeName(normalized.name);
    if (!byNameNormalized.has(normName)) byNameNormalized.set(normName, []);
    byNameNormalized.get(normName).push(normalized);
  });

  return { byId, byNameNormalized };
}

function buildSuggestion(agent, lookupMaps) {
  const details = [];
  const depotName = lookupMaps.depotNames?.[agent.depotId];
  const companyName = lookupMaps.companyNames?.[agent.companyId];
  const platoonName = lookupMaps.platoonNames?.[agent.platoonId];
  if (companyName) details.push(companyName);
  if (platoonName) details.push(platoonName);
  if (depotName) details.push(depotName);
  const detailText = details.length ? ` (${details.join(" / ")})` : "";
  return `${agent.name} — ${agent.id}${detailText}`;
}

function resolveLeaderName(leaderNameInput, lookups, lookupMaps, errors) {
  const leaderName = leaderNameInput?.toString().trim();
  if (!leaderName) {
    errors.push("Missing leader name");
    return { resolvedId: "", suggestions: [] };
  }

  const normName = normalizeName(leaderName);
  const matches = lookups.byNameNormalized.get(normName) ?? [];
  if (matches.length === 1) return { resolvedId: matches[0].id, suggestions: [] };
  if (matches.length > 1) {
    errors.push(
      "Ambiguous leader name. Matches multiple participants. Please rename participant for uniqueness."
    );
    const suggestions = matches.slice(0, 5).map(agent => buildSuggestion(agent, lookupMaps));
    return { resolvedId: "", suggestions };
  }

  errors.push("Leader not found");
  return { resolvedId: "", suggestions: [] };
}

function normalizeAgentRecord(agent = {}) {
  return {
    id: agent.id,
    name: agent.name ?? "",
    depotId: agent.depotId ?? agent.depot_id ?? agent.depot ?? "",
    companyId: agent.companyId ?? agent.company_id ?? agent.company ?? "",
    platoonId: agent.platoonId ?? agent.platoon_id ?? agent.platoon ?? "",
  };
}

async function fetchAgentsByIds(ids = []) {
  if (!ids.length) return new Map();
  const { data, error } = await supabase
    .from("agents")
    .select("id,name,photo_url,depot_id,company_id,platoon_id")
    .in("id", ids);
  if (error) throw error;

  const map = new Map();
  (data ?? []).forEach(agent => {
    const normalized = normalizeAgentRecord(agent);
    map.set(normalized.id, normalized);
  });
  return map;
}

async function fetchLookupMaps() {
  const [depots, companies, platoons] = await Promise.all([
    listDepots(),
    listCompanies(),
    listPlatoons(),
  ]);

  const depotNames = Object.fromEntries(depots.map(d => [d.id, d.name]));
  const companyNames = Object.fromEntries(companies.map(c => [c.id, c.name]));
  const platoonNames = Object.fromEntries(platoons.map(p => [p.id, p.name]));

  return { depotNames, companyNames, platoonNames };
}

async function enrichRawDataRows(rows = []) {
  if (!rows.length) return [];

  const agentMap = new Map();
  rows.forEach(row => {
    if (row.agents && row.agent_id) {
      const normalized = normalizeAgentRecord(row.agents);
      agentMap.set(row.agent_id, normalized);
    }
  });

  const missingAgentIds = Array.from(
    new Set(rows.map(r => r.agent_id).filter(id => id && !agentMap.has(id)))
  );

  if (missingAgentIds.length) {
    const fetchedMap = await fetchAgentsByIds(missingAgentIds);
    fetchedMap.forEach((value, key) => agentMap.set(key, value));
  }

  const { depotNames, companyNames, platoonNames } = await fetchLookupMaps();

  return rows.map(row => {
    const agent = agentMap.get(row.agent_id) ?? {};
    const depotName = depotNames[agent.depotId] ?? "";
    const companyName = companyNames[agent.companyId] ?? "";
    const platoonName = platoonNames[agent.platoonId] ?? "";
    const leadsDepotName = depotNames[row.leads_depot_id] ?? "";
    const salesDepotName = depotNames[row.sales_depot_id] ?? "";

    return {
      id: row.id,
      date_real: row.date_real,
      agent_id: row.agent_id,
      leads: row.leads ?? 0,
      payins: row.payins ?? 0,
      sales: row.sales ?? 0,
      leads_depot_id: row.leads_depot_id ?? null,
      sales_depot_id: row.sales_depot_id ?? null,
      voided: Boolean(row.voided),
      published: Boolean(row.published),
      void_reason: row.void_reason ?? null,
      voided_at: row.voided_at ?? null,
      voided_by: row.voided_by ?? null,
      leaderName: agent.name ?? "",
      depotName,
      companyName,
      platoonName,
      leadsDepotName,
      salesDepotName,
    };
  });
}

export async function parseRawDataWorkbook(file, _options = {}, onProgress = () => {}) {
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
  rawRows.forEach(row => {
    Object.keys(row).forEach(key => headers.add(key));
  });
  headers.forEach(header => {
    const norm = normalizeHeaderName(header);
    const key = findHeaderKey(norm);
    if (key && !(key in headerMap)) headerMap[key] = header;
  });

  const missingRequired = REQUIRED_FIELDS.filter(f => headerMap[f] === undefined);
  if (missingRequired.length) {
    throw new Error(`Missing required columns: ${missingRequired.join(", ")}`);
  }

  const inputRows = rawRows.map((rawRow, idx) => ({
    sourceRowIndex: idx,
    excelRowNumber: idx + 2,
    date_original: rawRow[headerMap.date],
    leader_name_input: headerMap.leader_name !== undefined ? rawRow[headerMap.leader_name] : "",
    leads: rawRow[headerMap.leads],
    payins: rawRow[headerMap.payins],
    sales: rawRow[headerMap.sales],
    leads_depot_input: headerMap.leads_depot !== undefined ? rawRow[headerMap.leads_depot] : "",
    sales_depot_input: headerMap.sales_depot !== undefined ? rawRow[headerMap.sales_depot] : "",
  }));

  const { rows: rowsWithDuplicates, meta } = await normalizeRawDataRows(
    inputRows,
    {},
    progressCb
  );

  return {
    rows: rowsWithDuplicates,
    meta: {
      sheetName,
      totalRows: meta.totalRows,
      parseMs: meta.parseMs,
      duplicateCheckMs: meta.duplicateCheckMs,
    },
  };
}

export async function saveRawDataRows(validRows, { mode = "warn" } = {}, onProgress = () => {}) {
  const batchSize = 200;
  let upsertedCount = 0;
  let insertedCount = 0;
  const errors = [];
  const isInsertOnly = mode === "insert_only";

  for (let i = 0; i < validRows.length; i += batchSize) {
    const batch = validRows
      .slice(i, i + batchSize)
      .map(row => {
        if (!row.leads_depot_id || !row.sales_depot_id) {
          row.status = "invalid";
          row.errors = Array.from(
            new Set([...(row.errors ?? []), "Missing depot attribution for leads or sales."])
          );
          return null;
        }
        const id =
          row.computedId ||
          computeRawDataId({
            date_real: row.date_real,
            agent_id: row.resolved_agent_id,
            leads_depot_id: row.leads_depot_id,
            sales_depot_id: row.sales_depot_id,
          });
        return {
          id,
          agent_id: row.resolved_agent_id,
          date_real: row.date_real,
          date: { source: "xlsx", original: row.date_original ?? row.date_real },
          leads: row.leads ?? 0,
          payins: row.payins ?? 0,
          sales: row.sales ?? 0,
          leads_depot_id: row.leads_depot_id ?? null,
          sales_depot_id: row.sales_depot_id ?? null,
        };
      })
      .filter(item => item?.id);

    if (isInsertOnly) {
      const { error } = await supabase.from("raw_data").insert(batch, { returning: "minimal" });
      if (error) {
        errors.push(mapWeekFinalizedMessage(error.message || "Unknown database error"));
      } else {
        insertedCount += batch.length;
      }
    } else {
      const { data, error } = await supabase
        .from("raw_data")
        .upsert(batch, { onConflict: "date_real,agent_id,leads_depot_id,sales_depot_id" })
        .select();
      if (error) {
        errors.push(mapWeekFinalizedMessage(error.message || "Unknown database error"));
      } else {
        upsertedCount += data?.length ?? 0;
      }
    }

    onProgress(Math.min(i + batch.length, validRows.length), validRows.length);
  }

  return { insertedCount, upsertedCount, errors };
}

function applyRawDataFilters(query, { dateFrom, dateTo, agentId, limit = 200 }) {
  let q = query;
  if (dateFrom) q = q.gte("date_real", dateFrom);
  if (dateTo) q = q.lte("date_real", dateTo);
  if (agentId) q = q.eq("agent_id", agentId);
  const safeLimit = Number(limit) || 200;
  q = q.order("date_real", { ascending: false }).limit(safeLimit);
  return q;
}

export async function listRawData({ dateFrom, dateTo, agentId, limit = 200, includeVoided = false } = {}) {
  const baseSelect =
    "id,date_real,agent_id,leads,payins,sales,leads_depot_id,sales_depot_id,voided,void_reason,voided_at,voided_by,published,agents:agents(id,name,photo_url,depot_id,company_id,platoon_id)";

  try {
    let query = supabase.from("raw_data").select(baseSelect);
    if (!includeVoided) query = query.eq("voided", false);

    const { data, error } = await applyRawDataFilters(query, {
      dateFrom,
      dateTo,
      agentId,
      limit,
    });
    if (error) throw error;
    return enrichRawDataRows(data ?? []);
  } catch {
    let query = supabase.from("raw_data").select(
      "id,date_real,agent_id,leads,payins,sales,leads_depot_id,sales_depot_id,voided,void_reason,voided_at,voided_by,published"
    );
    if (!includeVoided) query = query.eq("voided", false);

    const { data, error } = await applyRawDataFilters(query, {
      dateFrom,
      dateTo,
      agentId,
      limit,
    });
    if (error) throw error;
    return enrichRawDataRows(data ?? []);
  }
}

export async function listPublishingRows({ dateFrom, dateTo, agentId, status, limit = 200 } = {}) {
  const baseSelect =
    "id,date_real,agent_id,leads,payins,sales,leads_depot_id,sales_depot_id,voided,void_reason,voided_at,voided_by,published,agents:agents(id,name,photo_url,depot_id,company_id,platoon_id)";

  let query = supabase.from("raw_data").select(baseSelect);

  if (dateFrom) query = query.gte("date_real", dateFrom);
  if (dateTo) query = query.lte("date_real", dateTo);
  if (agentId) query = query.eq("agent_id", agentId);

  if (status === "published") {
    query = query.eq("published", true).eq("voided", false);
  }
  if (status === "unpublished") {
    query = query.eq("published", false).eq("voided", false);
  }
  if (status === "voided") {
    query = query.eq("voided", true);
  }

  query = query.order("date_real", { ascending: false }).limit(Number(limit) || 200);

  const { data, error } = await query;
  if (error) throw error;
  return enrichRawDataRows(data ?? []);
}

const FORBIDDEN_UPDATE_FIELDS = new Set([
  "source",
  "approved",
  "approved_by",
  "approved_at",
  "is_company_row_matched",
  "published",
]);

function sanitizeRawDataPatch(patch = {}) {
  const payload = {};
  Object.entries(patch ?? {}).forEach(([key, value]) => {
    if (FORBIDDEN_UPDATE_FIELDS.has(key) || value === undefined) return;
    payload[key] = value;
  });
  return payload;
}

function buildUpsertPayload(row = {}) {
  const agentId = row.agent_id ?? row.resolved_agent_id ?? "";
  const dateReal = row.date_real ?? "";
  const leadsDepotId = row.leads_depot_id ?? null;
  const salesDepotId = row.sales_depot_id ?? null;

  if (!dateReal || !agentId || !leadsDepotId || !salesDepotId) return null;

  const id = computeRawDataId({
    date_real: dateReal,
    agent_id: agentId,
    leads_depot_id: leadsDepotId,
    sales_depot_id: salesDepotId,
  });

  return {
    id,
    agent_id: agentId,
    date_real: dateReal,
    date: { source: "api", original: dateReal },
    leads: row.leads ?? 0,
    payins: row.payins ?? 0,
    sales: row.sales ?? 0,
    leads_depot_id: leadsDepotId,
    sales_depot_id: salesDepotId,
  };
}

export async function upsertRawData(rows = []) {
  const payload = rows.map(row => buildUpsertPayload(row)).filter(Boolean);
  if (!payload.length) return [];

  const { data, error } = await supabase
    .from("raw_data")
    .upsert(payload, { onConflict: "date_real,agent_id,leads_depot_id,sales_depot_id" })
    .select();
  if (error) throw normalizeSupabaseError(error);

  return enrichRawDataRows(data ?? []);
}

export async function updateRow(id, patch = {}) {
  const payload = sanitizeRawDataPatch(patch);
  const { data, error } = await supabase
    .from("raw_data")
    .update(payload)
    .eq("id", id)
    .select("id,date_real,agent_id,leads,payins,sales,leads_depot_id,sales_depot_id,voided,void_reason,voided_at,voided_by")
    .single();
  if (error) throw normalizeSupabaseError(error);

  return enrichSingleRow(data);
}

export async function setVoided(id, voided, void_reason = null) {
  const payload = {
    voided: Boolean(voided),
    void_reason: voided ? (void_reason?.trim() || null) : null,
    voided_at: voided ? new Date().toISOString() : null,
  };
  const { data, error } = await supabase
    .from("raw_data")
    .update(payload)
    .eq("id", id)
    .select("id,date_real,agent_id,leads,payins,sales,leads_depot_id,sales_depot_id,voided,void_reason,voided_at,voided_by")
    .single();
  if (error) throw normalizeSupabaseError(error);

  return enrichSingleRow(data);
}

export async function unvoidRawData({ id, reason }) {
  const trimmedReason = reason?.trim() || null;
  const { data, error } = await supabase.rpc("unvoid_raw_data", {
    p_id: id,
    p_reason: trimmedReason,
  });
  if (error) throw normalizeSupabaseError(error);
  return data;
}

export async function setPublished(id, published) {
  const { data, error } = await supabase
    .from("raw_data")
    .update({ published: Boolean(published) })
    .eq("id", id)
    .select("id,date_real,agent_id,leads,payins,sales,leads_depot_id,sales_depot_id,voided,void_reason,voided_at,voided_by,published")
    .single();
  if (error) throw normalizeSupabaseError(error);

  return enrichSingleRow(data);
}

export async function updateRawData(id, { leads, payins, sales }) {
  return updateRow(id, { leads, payins, sales });
}

export async function deleteRawData(id) {
  const { error } = await supabase.from("raw_data").delete().eq("id", id);
  if (error) throw normalizeSupabaseError(error);
}

async function requireSessionUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data?.user) throw new Error("User session not found");
  return data.user;
}

export async function updateRawDataWithAudit(rowId, changes, reason, sessionUser) {
  if (!reason || !reason.trim()) throw new Error("Reason is required");

  const actorEmail = sessionUser?.email ?? "";
  const actorId = sessionUser?.id ?? "";

  const { data: before, error: beforeError } = await supabase
    .from("raw_data")
    .select("*")
    .eq("id", rowId)
    .single();
  if (beforeError) throw normalizeSupabaseError(beforeError);

  const updatePayload = {
    ...sanitizeRawDataPatch(changes),
    updatedAt: { iso: new Date().toISOString(), reason: reason.trim(), actor: actorEmail },
  };

  const { data: updatedRow, error: updateError } = await supabase
    .from("raw_data")
    .update(updatePayload)
    .eq("id", rowId)
    .select("*")
    .single();
  if (updateError) throw normalizeSupabaseError(updateError);

  const { error: auditError } = await supabase.from("raw_data_audit").insert({
    raw_data_id: rowId,
    action: "edit",
    reason: reason.trim(),
    actor_id: actorId,
    actor_email: actorEmail,
    before,
    after: updatedRow,
  });
  if (auditError) throw normalizeSupabaseError(auditError);

  return enrichSingleRow(updatedRow);
}

async function logAuditEntriesForPair(beforeRows, afterRows, action, reason, actor) {
  const beforeById = new Map((beforeRows ?? []).map(row => [row.id, row]));
  const afterById = new Map((afterRows ?? []).map(row => [row.id, row]));

  const entries = [];
  afterById.forEach((afterRow, id) => {
    entries.push({
      raw_data_id: id,
      action,
      reason,
      actor_id: actor.id,
      actor_email: actor.email ?? "",
      before: beforeById.get(id) ?? null,
      after: afterRow,
    });
  });

  if (!entries.length) return;
  const { error: auditError } = await supabase.from("raw_data_audit").insert(entries);
  if (auditError) throw normalizeSupabaseError(auditError);
}

export async function voidRawDataWithAudit(rowId, reason, sessionUser) {
  if (!reason || !reason.trim()) throw new Error("Reason is required");

  const actorEmail = sessionUser?.email ?? "";
  const actorId = sessionUser?.id ?? "";

  const { data: before, error: beforeError } = await supabase
    .from("raw_data")
    .select("*")
    .eq("id", rowId)
    .single();
  if (beforeError) throw normalizeSupabaseError(beforeError);

  const voidPayload = {
    voided: true,
    void_reason: reason.trim(),
    voided_at: new Date().toISOString(),
    voided_by: actorEmail,
    updatedAt: { iso: new Date().toISOString(), reason: reason.trim(), actor: actorEmail },
  };

  const { data: updatedRow, error: updateError } = await supabase
    .from("raw_data")
    .update(voidPayload)
    .eq("id", rowId)
    .select("*")
    .single();
  if (updateError) throw normalizeSupabaseError(updateError);

  const { error: auditError } = await supabase.from("raw_data_audit").insert({
    raw_data_id: rowId,
    action: "void",
    reason: reason.trim(),
    actor_id: actorId,
    actor_email: actorEmail,
    before,
    after: updatedRow,
  });
  if (auditError) throw normalizeSupabaseError(auditError);

  return enrichSingleRow(updatedRow);
}

export async function unvoidRawDataWithAudit(rowId, reason, sessionUser) {
  if (!reason || !reason.trim()) throw new Error("Reason is required");

  const actorEmail = sessionUser?.email ?? "";
  const actorId = sessionUser?.id ?? "";

  const { data: before, error: beforeError } = await supabase
    .from("raw_data")
    .select("*")
    .eq("id", rowId)
    .single();
  if (beforeError) throw normalizeSupabaseError(beforeError);

  const unvoidPayload = {
    voided: false,
    void_reason: null,
    voided_at: null,
    voided_by: null,
    updatedAt: { iso: new Date().toISOString(), reason: reason.trim(), actor: actorEmail },
  };

  const { data: updatedRow, error: updateError } = await supabase
    .from("raw_data")
    .update(unvoidPayload)
    .eq("id", rowId)
    .select("*")
    .single();
  if (updateError) throw normalizeSupabaseError(updateError);

  const { error: auditError } = await supabase.from("raw_data_audit").insert({
    raw_data_id: rowId,
    action: "unvoid",
    reason: reason.trim(),
    actor_id: actorId,
    actor_email: actorEmail,
    before,
    after: updatedRow,
  });
  if (auditError) throw normalizeSupabaseError(auditError);

  return enrichSingleRow(updatedRow);
}

async function enrichSingleRow(row) {
  if (!row) return row;
  const enriched = await enrichRawDataRows([row]);
  return enriched?.[0] ?? row;
}

export async function publishPair({ date_real, agent_id, reason }) {
  const trimmedReason = reason?.trim();
  if (!trimmedReason) throw new Error("Reason is required");
  if (!date_real || !agent_id) throw new Error("Missing date or agent");

  const user = await requireSessionUser();
  const { data: beforeRows, error: beforeError } = await supabase
    .from("raw_data")
    .select("*")
    .eq("date_real", date_real)
    .eq("agent_id", agent_id);
  if (beforeError) throw normalizeSupabaseError(beforeError);
  if (!beforeRows?.length) throw new Error("No rows found for this leader and date");

  const updatePayload = {
    published: true,
    updatedAt: { iso: new Date().toISOString(), reason: trimmedReason, actor: user.email ?? "" },
  };

  const { data: updatedRows, error: updateError } = await supabase
    .from("raw_data")
    .update(updatePayload)
    .eq("date_real", date_real)
    .eq("agent_id", agent_id)
    .select("*");
  if (updateError) throw normalizeSupabaseError(updateError);
  if (!updatedRows?.length) throw new Error("Publish update did not modify any rows");

  const afterRows = updatedRows ?? [];
  await logAuditEntriesForPair(beforeRows, afterRows, "publish", trimmedReason, user);
  return enrichRawDataRows(afterRows);
}

export async function unpublishPair({ date_real, agent_id, reason }) {
  const trimmedReason = reason?.trim();
  if (!trimmedReason) throw new Error("Reason is required");
  if (!date_real || !agent_id) throw new Error("Missing date or agent");

  const user = await requireSessionUser();
  const { data: beforeRows, error: beforeError } = await supabase
    .from("raw_data")
    .select("*")
    .eq("date_real", date_real)
    .eq("agent_id", agent_id);
  if (beforeError) throw normalizeSupabaseError(beforeError);
  if (!beforeRows?.length) throw new Error("No rows found for this leader and date");

  const updatePayload = {
    published: false,
    updatedAt: { iso: new Date().toISOString(), reason: trimmedReason, actor: user.email ?? "" },
  };

  const { data: updatedRows, error: updateError } = await supabase
    .from("raw_data")
    .update(updatePayload)
    .eq("date_real", date_real)
    .eq("agent_id", agent_id)
    .select("*");
  if (updateError) throw normalizeSupabaseError(updateError);
  if (!updatedRows?.length) throw new Error("Unpublish update did not modify any rows");

  await logAuditEntriesForPair(beforeRows, updatedRows, "unpublish", trimmedReason, user);
  return enrichRawDataRows(updatedRows);
}
