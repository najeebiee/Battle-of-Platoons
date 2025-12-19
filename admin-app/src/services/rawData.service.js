import * as XLSX from "xlsx";
import { listAgents } from "./agents.service";
import { listCompanies } from "./companies.service";
import { listDepots } from "./depots.service";
import { listPlatoons } from "./platoons.service";
import { supabase } from "./supabase";

const HEADER_ALIASES = {
  agent_id: ["agent_id", "agentid", "agent", "agent id"],
  leader_name: ["leader", "leader_name", "platoon_leader", "platoon leader", "name"],
  date: ["date"],
  leads: ["leads"],
  payins: ["payins", "pay ins", "pay_in", "pay in"],
  sales: ["sales"],
};

const REQUIRED_FIELDS = ["date", "leads", "payins", "sales"];

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
    .replace(/[^a-z0-9\s]+/g, "")
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

async function buildAgentLookups() {
  const agents = await listAgents();
  const byId = new Map();
  const byName = new Map();

  agents.forEach(agent => {
    byId.set(agent.id, agent);
    const normName = normalizeName(agent.name);
    if (!byName.has(normName)) byName.set(normName, []);
    byName.get(normName).push(agent);
  });

  return { byId, byName };
}

function resolveAgent(agentIdInput, leaderNameInput, lookups, errors) {
  const agentId = agentIdInput?.toString().trim();
  const leaderName = leaderNameInput?.toString().trim();

  if (agentId) {
    if (lookups.byId.has(agentId)) {
      return agentId;
    }
    errors.push("agent_id not found");
    return "";
  }

  if (leaderName) {
    const normName = normalizeName(leaderName);
    const matches = lookups.byName.get(normName) ?? [];
    if (matches.length === 1) return matches[0].id;
    if (matches.length > 1) {
      errors.push("Ambiguous leader name: matches multiple agents. Use agent_id.");
      return "";
    }
    errors.push("Leader name not found");
    return "";
  }

  errors.push("Missing agent_id or leader_name");
  return "";
}

function normalizeAgentRecord(agent = {}) {
  return {
    id: agent.id,
    name: agent.name ?? "",
    depotId: agent.depotId ?? agent.depot_id ?? "",
    companyId: agent.companyId ?? agent.company_id ?? "",
    platoonId: agent.platoonId ?? agent.platoon_id ?? "",
  };
}

async function fetchAgentsByIds(ids = []) {
  if (!ids.length) return new Map();
  const { data, error } = await supabase
    .from("agents")
    .select("id,name,photoURL,depotId,companyId,platoonId")
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

    return {
      id: row.id,
      date_real: row.date_real,
      agent_id: row.agent_id,
      leads: row.leads ?? 0,
      payins: row.payins ?? 0,
      sales: row.sales ?? 0,
      leaderName: agent.name ?? "",
      depotName,
      companyName,
      platoonName,
    };
  });
}

export async function parseRawDataWorkbook(file) {
  if (!file) throw new Error("File is required");

  const lookups = await buildAgentLookups();
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: "array", cellDates: true });

  const sheetName = workbook.SheetNames.includes("Daily Data")
    ? "Daily Data"
    : workbook.SheetNames[0];

  if (!sheetName) throw new Error("No sheets found in workbook");

  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" });
  if (!rawRows.length) throw new Error("Sheet is empty");

  const headersRaw = rawRows[0];
  const headerMap = {};
  headersRaw.forEach((header, idx) => {
    const norm = normalizeHeaderName(header);
    const key = findHeaderKey(norm);
    if (key && !(key in headerMap)) headerMap[key] = idx;
  });

  const missingRequired = REQUIRED_FIELDS.filter(f => headerMap[f] === undefined);
  if (missingRequired.length) {
    throw new Error(`Missing required columns: ${missingRequired.join(", ")}`);
  }

  const rows = rawRows.slice(1).map((rawRow, idx) => {
    const errors = [];

    const dateCell = rawRow[headerMap.date];
    const { dateReal, originalValue: originalDate, error: dateError } = parseDateCell(dateCell);
    if (dateError) errors.push(dateError);

    const leads = parseNumber(rawRow[headerMap.leads], "Leads", errors);
    const payins = parseNumber(rawRow[headerMap.payins], "Payins", errors);
    const sales = parseNumber(rawRow[headerMap.sales], "Sales", errors);

    const agent_id_input = headerMap.agent_id !== undefined ? rawRow[headerMap.agent_id] : "";
    const leader_name_input = headerMap.leader_name !== undefined ? rawRow[headerMap.leader_name] : "";

    const resolved_agent_id = resolveAgent(agent_id_input, leader_name_input, lookups, errors);

    const date_real = dateReal ?? "";
    const computed_id = `${date_real}_${resolved_agent_id}`;

    return {
      displayIndex: idx + 1,
      sourceRowIndex: idx + 2, // +2 to account for header row and 1-indexing
      date_real,
      date_original: originalDate,
      agent_id_input: agent_id_input?.toString().trim() ?? "",
      leader_name_input: leader_name_input?.toString().trim() ?? "",
      resolved_agent_id,
      computed_id,
      leads,
      payins,
      sales,
      status: errors.length ? "invalid" : "valid",
      errors,
    };
  });

  const computedIds = Array.from(
    new Set(rows.filter(row => row.date_real && row.resolved_agent_id).map(row => row.computed_id))
  );

  let existingIds = new Set();
  if (computedIds.length) {
    const { data, error } = await supabase.from("raw_data").select("id").in("id", computedIds);
    if (error) throw error;
    existingIds = new Set((data ?? []).map(item => item.id));
  }

  const rowsWithDuplicates = rows.map(row => {
    const duplicate = existingIds.has(row.computed_id);
    const warnings = duplicate ? ["Duplicate ID exists"] : [];
    return { ...row, duplicate, warnings };
  });

  return {
    rows: rowsWithDuplicates,
    meta: { sheetName, totalRows: rowsWithDuplicates.length },
  };
}

export async function saveRawDataRows(validRows, mode = "warn", onProgress = () => {}) {
  const batchSize = 200;
  let upsertedCount = 0;
  let insertedCount = 0;
  const errors = [];
  const now = new Date().toISOString();
  const isInsertOnly = mode === "insert_only";

  for (let i = 0; i < validRows.length; i += batchSize) {
    const batch = validRows.slice(i, i + batchSize).map(row => {
      const id = row.computed_id || `${row.date_real}_${row.resolved_agent_id}`;
      return {
        id,
        agent_id: row.resolved_agent_id,
        leads: row.leads,
        payins: row.payins,
        sales: row.sales,
        date_real: row.date_real,
        date: { source: "xlsx", original: row.date_original ?? row.date_real },
        createdAt: { iso: now },
        updatedAt: { iso: now },
      };
    });

    if (isInsertOnly) {
      const { error } = await supabase.from("raw_data").insert(batch, { returning: "minimal" });
      if (error) {
        errors.push(error.message || "Unknown database error");
      } else {
        insertedCount += batch.length;
      }
    } else {
      const { data, error } = await supabase.from("raw_data").upsert(batch, { onConflict: "id" }).select();
      if (error) {
        errors.push(error.message || "Unknown database error");
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

export async function listRawData({ dateFrom, dateTo, agentId, limit = 200 } = {}) {
  const baseSelect = "id,date_real,agent_id,leads,payins,sales,agents:agents(id,name,photoURL,depotId,companyId,platoonId)";

  try {
    const { data, error } = await applyRawDataFilters(
      supabase.from("raw_data").select(baseSelect),
      { dateFrom, dateTo, agentId, limit }
    );
    if (error) throw error;
    return enrichRawDataRows(data ?? []);
  } catch (joinError) {
    const { data, error } = await applyRawDataFilters(
      supabase.from("raw_data").select("id,date_real,agent_id,leads,payins,sales"),
      { dateFrom, dateTo, agentId, limit }
    );
    if (error) throw error;
    return enrichRawDataRows(data ?? []);
  }
}

export async function updateRawData(id, { leads, payins, sales }) {
  const { data, error } = await supabase
    .from("raw_data")
    .update({ leads, payins, sales })
    .eq("id", id)
    .select("id,date_real,agent_id,leads,payins,sales")
    .single();
  if (error) throw error;

  return data;
}

export async function deleteRawData(id) {
  const { error } = await supabase.from("raw_data").delete().eq("id", id);
  if (error) throw error;
}
