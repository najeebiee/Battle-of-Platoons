import * as XLSX from "xlsx";
import { listAgents } from "./agents.service";
import { listCompanies } from "./companies.service";
import { buildDepotMaps, listDepots, resolveDepotId } from "./depots.service";
import { listPlatoons } from "./platoons.service";
import { supabase } from "./supabase";

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
    const y = value.getFullYear();
    const m = value.getMonth() + 1;
    const d = value.getDate();
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

function normalizeSourceValue(source) {
  return (source || "").toString().toLowerCase();
}

export function computeRawDataId(date_real, agent_id, source) {
  if (!date_real || !agent_id || !source) return "";
  return `${date_real}_${agent_id}_${source}`;
}

export function isPublishable(companyRow, depotRow) {
  if (!companyRow) return false;
  const companySource = normalizeSourceValue(companyRow.source);
  if (companySource !== "company") return false;
  if (companyRow.voided) return false;
  if (companyRow.approved === true) return true;

  if (!depotRow) return false;
  const depotSource = normalizeSourceValue(depotRow.source);
  if (depotSource !== "depot") return false;

  const leadsMatch = Number(companyRow.leads ?? 0) === Number(depotRow.leads ?? 0);
  const payinsMatch = Number(companyRow.payins ?? 0) === Number(depotRow.payins ?? 0);
  const salesMatch = Number(companyRow.sales ?? 0) === Number(depotRow.sales ?? 0);

  return leadsMatch && payinsMatch && salesMatch;
}

export function canEditRow(row, profile, agent) {
  if (!row || !profile?.role) return false;
  const source = normalizeSourceValue(row.source);
  const role = profile.role;
  if (role === "super_admin") return true;

  if (role === "company_admin") {
    return source === "company";
  }

  if (role === "depot_admin") {
    const profileDepotId = profile.depot_id ?? profile.depotId ?? "";
    const agentDepotId = agent?.depotId ?? agent?.depot_id ?? "";
    if (!profileDepotId || !agentDepotId) return false;
    return source === "depot" && String(profileDepotId) === String(agentDepotId);
  }

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
      source: row.source ?? "",
      voided: Boolean(row.voided),
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

export async function parseRawDataWorkbook(
  file,
  { source = "company" } = {},
  onProgress = () => {}
) {
  if (!file) throw new Error("File is required");
  const normalizedSource = source === "depot" ? "depot" : "company";
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

  progressCb(0, 0, "reading");
  const buf = await file.arrayBuffer();
  const workbook = XLSX.read(buf, { type: "array", cellDates: true });

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

  const rows = [];
  const totalRows = rawRows.length;
  progressCb(0, totalRows, "processing");
  for (let idx = 0; idx < rawRows.length; idx++) {
    const rawRow = rawRows[idx];
    const errors = [];

    const dateCell = rawRow[headerMap.date];
    const { dateReal, originalValue: originalDate, error: dateError } = parseDateCell(dateCell);
    if (dateError) errors.push(dateError);

    const leads = parseNumber(rawRow[headerMap.leads], "Leads", errors);
    const payins = parseNumber(rawRow[headerMap.payins], "Payins", errors);
    const sales = parseNumber(rawRow[headerMap.sales], "Sales", errors);

    const leader_name_input =
      headerMap.leader_name !== undefined ? rawRow[headerMap.leader_name] : "";
    const { resolvedId: resolved_agent_id, suggestions } = resolveLeaderName(
      leader_name_input,
      lookups,
      lookupMaps,
      errors
    );

    const leadsDepotInput =
      headerMap.leads_depot !== undefined ? rawRow[headerMap.leads_depot] : "";
    const salesDepotInput =
      headerMap.sales_depot !== undefined ? rawRow[headerMap.sales_depot] : "";

    const leadsDepotLabel = leadsDepotInput?.toString().trim() ?? "";
    const salesDepotLabel = salesDepotInput?.toString().trim() ?? "";

    const leadsDepotResult = resolveDepotId(leadsDepotLabel, depotMaps);
    const salesDepotResult = resolveDepotId(salesDepotLabel, depotMaps);

    if (!leadsDepotLabel) {
      errors.push("Missing Leads Depot");
    } else if (leadsDepotResult.error) {
      errors.push(`Unknown depot: ${leadsDepotLabel}`);
    }

    if (!salesDepotLabel) {
      errors.push("Missing Sales Depot");
    } else if (salesDepotResult.error) {
      errors.push(`Unknown depot: ${salesDepotLabel}`);
    }

    const date_real = dateReal ?? "";
    const computedId = computeRawDataId(date_real, resolved_agent_id, normalizedSource);

    rows.push({
      sourceRowIndex: idx,
      excelRowNumber: idx + 2, // +2 to account for header row and 1-indexing
      date_real,
      date_original: originalDate,
      leader_name_input: leader_name_input?.toString().trim() ?? "",
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
      source: normalizedSource,
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

  const duplicateStart = Date.now();
  const computedIds = Array.from(
    new Set(rows.filter(row => row.computedId).map(row => row.computedId))
  );

  const existingRows = new Map();
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
      const { data, error } = await supabase
        .from("raw_data")
        .select("id,leads_depot_id,sales_depot_id")
        .in("id", chunk);
      if (error) throw error;
      (data ?? []).forEach(item => {
        existingRows.set(item.id, {
          leads_depot_id: item.leads_depot_id ?? null,
          sales_depot_id: item.sales_depot_id ?? null,
        });
      });
      // eslint-disable-next-line no-await-in-loop
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    progressCb(totalRows, totalRows, "checking_duplicates");
  }

  const matchesDepotId = (left, right) => {
    if (!left || !right) return false;
    return String(left) === String(right);
  };

  const rowsWithDuplicates = rows.map(row => {
    const existing = row.computedId ? existingRows.get(row.computedId) : null;
    const dup_base_row = Boolean(existing);
    const dup_leads_same_depot = existing
      ? matchesDepotId(existing.leads_depot_id, row.leads_depot_id)
      : false;
    const dup_sales_same_depot = existing
      ? matchesDepotId(existing.sales_depot_id, row.sales_depot_id)
      : false;
    return {
      ...row,
      dup_base_row,
      dup_leads_same_depot,
      dup_sales_same_depot,
    };
  });

  const parseEnd = Date.now();

  return {
    rows: rowsWithDuplicates,
    meta: {
      sheetName,
      totalRows: rowsWithDuplicates.length,
      parseMs: duplicateStart - parseStart,
      duplicateCheckMs: parseEnd - duplicateStart,
    },
  };
}

export async function saveRawDataRows(validRows, { mode = "warn", source = "company" } = {}, onProgress = () => {}) {
  const batchSize = 200;
  let upsertedCount = 0;
  let insertedCount = 0;
  const errors = [];
  const now = new Date().toISOString();
  const isInsertOnly = mode === "insert_only";
  const normalizedSource = source === "depot" ? "depot" : "company";

  for (let i = 0; i < validRows.length; i += batchSize) {
    const batch = validRows
      .slice(i, i + batchSize)
      .map(row => {
        const rowSource = row.source === "depot" || row.source === "company" ? row.source : normalizedSource;
        const id = row.computedId || computeRawDataId(row.date_real, row.resolved_agent_id, rowSource);
        return {
          id,
          agent_id: row.resolved_agent_id,
          leads: row.leads,
          payins: row.payins,
          sales: row.sales,
          leads_depot_id: row.leads_depot_id ?? null,
          sales_depot_id: row.sales_depot_id ?? null,
          date_real: row.date_real,
          source: rowSource,
          date: { source: "xlsx", original: row.date_original ?? row.date_real },
          createdAt: { iso: now },
          updatedAt: { iso: now },
        };
      })
      .filter(item => item.id);

    if (isInsertOnly) {
      const { error } = await supabase.from("raw_data").insert(batch, { returning: "minimal" });
      if (error) {
        errors.push(mapWeekFinalizedMessage(error.message || "Unknown database error"));
      } else {
        insertedCount += batch.length;
      }
    } else {
      const { data, error } = await supabase.from("raw_data").upsert(batch, { onConflict: "id" }).select();
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
    "id,date_real,agent_id,leads,payins,sales,leads_depot_id,sales_depot_id,source,voided,void_reason,voided_at,voided_by,agents:agents(id,name,photo_url,depot_id,company_id,platoon_id)";

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
      "id,date_real,agent_id,leads,payins,sales,leads_depot_id,sales_depot_id,source,voided,void_reason,voided_at,voided_by"
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

export async function updateRawData(id, { leads, payins, sales }) {
  const { data, error } = await supabase
    .from("raw_data")
    .update({ leads, payins, sales })
    .eq("id", id)
    .select("id,date_real,agent_id,leads,payins,sales,voided,void_reason,voided_at,voided_by")
    .single();
  if (error) throw normalizeSupabaseError(error);

  return enrichSingleRow(data);
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
    ...changes,
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

export async function approvePair({ date_real, agent_id, reason }) {
  const trimmedReason = reason?.trim();
  if (!trimmedReason) throw new Error("Reason is required");
  if (!date_real || !agent_id) throw new Error("Missing date or agent");

  const user = await requireSessionUser();
  const { data: beforeRows, error: beforeError } = await supabase
    .from("raw_data")
    .select("*")
    .eq("date_real", date_real)
    .eq("agent_id", agent_id)
    .in("source", ["company", "depot"]);
  if (beforeError) throw normalizeSupabaseError(beforeError);
  if (!beforeRows?.length) throw new Error("No rows found for this leader and date");

  const companyRow = beforeRows.find(row => row.source === "company");
  const depotRows = beforeRows.filter(row => row.source === "depot");
  if (!companyRow) {
    throw new Error("Cannot approve because the Company row is missing for this leader/day.");
  }

  const updatePayload = {
    approved: true,
    approved_by: user.id,
    approved_at: new Date().toISOString(),
    approved_reason: trimmedReason,
  };

  const { data: updatedRows, error: updateError } = await supabase
    .from("raw_data")
    .update(updatePayload)
    .eq("id", companyRow.id)
    .eq("source", "company")
    .select("*");
  if (updateError) throw normalizeSupabaseError(updateError);
  if (!updatedRows?.length) throw new Error("Approval update did not modify any rows");

  let updatedDepotRows = [];
  if (depotRows.length) {
    const { data: depotUpdates, error: depotError } = await supabase
      .from("raw_data")
      .update(updatePayload)
      .eq("date_real", date_real)
      .eq("agent_id", agent_id)
      .eq("source", "depot")
      .select("*");

    if (!depotError) {
      updatedDepotRows = depotUpdates ?? [];
    }
  }

  const afterRows = [...updatedRows, ...updatedDepotRows];
  await logAuditEntriesForPair(beforeRows, afterRows, "approve", trimmedReason, user);
  return enrichRawDataRows(afterRows);
}

export async function unapprovePair({ date_real, agent_id, reason }) {
  const trimmedReason = reason?.trim();
  if (!trimmedReason) throw new Error("Reason is required");
  if (!date_real || !agent_id) throw new Error("Missing date or agent");

  const user = await requireSessionUser();
  const { data: beforeRows, error: beforeError } = await supabase
    .from("raw_data")
    .select("*")
    .eq("date_real", date_real)
    .eq("agent_id", agent_id)
    .in("source", ["company", "depot"]);
  if (beforeError) throw normalizeSupabaseError(beforeError);
  if (!beforeRows?.length) throw new Error("No rows found for this leader and date");

  const companyRow = beforeRows.find(row => row.source === "company");
  if (!companyRow) {
    throw new Error("Cannot unapprove because the Company row is missing for this leader/day.");
  }

  const updatePayload = {
    approved: false,
    approved_by: null,
    approved_at: null,
    approved_reason: null,
  };

  const { data: updatedRows, error: updateError } = await supabase
    .from("raw_data")
    .update(updatePayload)
    .eq("id", companyRow.id)
    .eq("source", "company")
    .select("*");
  if (updateError) throw normalizeSupabaseError(updateError);
  if (!updatedRows?.length) throw new Error("Unapprove update did not modify any rows");

  await logAuditEntriesForPair(beforeRows, updatedRows, "unapprove", trimmedReason, user);
  return enrichRawDataRows(updatedRows);
}
