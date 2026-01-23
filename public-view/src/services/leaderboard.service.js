// public-view/src/services/leaderboard.service.js
import { supabase, supabaseConfigured } from "./supabase";
import { getActiveFormula } from "./scoringFormula.service";
import { computeTotalScore } from "./scoringEngine";

/**
 * Battle of Platoons - Leaderboard Service (Supabase)
 *
 * Contract:
 * getLeaderboard({ startDate, endDate, groupBy }) returns:
 * {
 *   metrics: { entitiesCount, totalLeads, totalPayins, totalSales },
 *   rows: [{ key, name, avatarUrl, leads, payins, sales, points, rank, platoon? }]
 * }
 *
 * Notes:
 * - Public visibility is governed by Supabase RLS; do not add publishable logic in the frontend.
 * - We intentionally DO NOT rely on PostgREST nested joins for depots/companies/platoons
 *   because those return null unless FK relationships are properly defined in Postgres.
 * - Instead: fetch lookups separately and attach by company_id/platoon_id.
 */

export async function listTeams() {
  return supabase.from("platoons").select("id,name,photoURL,photo_url").order("name");
}

export async function listCommanders() {
  return supabase.from("companies").select("id,name,photoURL,photo_url").order("name");
}

export async function getLeaderboard({
  startDate, // "YYYY-MM-DD"
  endDate, // "YYYY-MM-DD"
  groupBy = "leaders", // "leaders" | "depots" | "commanders" | "teams" | "platoon"
  roleFilter = null, // null | "platoon" | "squad" | "team"
  battleType = null, // override battle type passed to scoring formula RPC
  weekKey = null,
}) {
  if (!supabaseConfigured || !supabase) {
    throw new Error("Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
  }

  const resolvedBattleType = normalizeBattleType(battleType ?? groupBy);
  const resolvedWeekKey = weekKey || toIsoWeekKey(endDate);
  const formulaPromise = getActiveFormula(resolvedBattleType, resolvedWeekKey);
  const agentsPromise = supabase
    .from("agents")
    .select("id,name,upline_agent_id,company_id,platoon_id,role,photo_url,photoURL");

  // 1) Fetch publishable rows + agents (basic fields only) - rely on RLS for visibility
  const { data: publishableRows, error: publishableError } = await supabase
    .from("public.publishable_raw_data")
    .select(
      `
      id,
      leads,
      payins,
      sales,
      leads_depot_id,
      sales_depot_id,
      date_real,
      date,
      agent_id,
      agents:agents (
        id,
        name,
        photoURL,
        photo_url,
        company_id,
        platoon_id,
        role,
        upline_agent_id
      )
    `
    )
    .gte("date_real", startDate)
    .lte("date_real", endDate);

  if (publishableError) throw publishableError;

  // 2) If date_real exists & is correct, above filter is enough.
  //    Keep a safety filter in JS in case date_real has time/edge cases.
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T23:59:59`);

  const isDev = Boolean(import.meta.env?.DEV);
  let warnedMissingAgentId = false;
  let warnedMissingAgentData = false;

  const publishableRowsFetched = publishableRows?.length ?? 0;

  const filteredRows = (publishableRows ?? []).filter((r) => {
    if (isDev) {
      if (!r?.agent_id && !warnedMissingAgentId) {
        console.warn("[Leaderboard] Missing agent_id in raw_data row", r?.id ?? r);
        warnedMissingAgentId = true;
      } else if (r?.agent_id && !r?.agents && !warnedMissingAgentData) {
        console.warn("[Leaderboard] Missing agents join data for agent_id", r.agent_id);
        warnedMissingAgentData = true;
      }
    }
    return true;
  });

  let filtered = filteredRows;
  if (startDate && endDate) {
    filtered = filteredRows.filter((r) => {
      const d = getRowDate(r);
      return d && d >= start && d <= end;
    });
  }

  const { data: agentsList, error: agentsError } = await agentsPromise;
  if (agentsError) throw agentsError;
  const normalizedAgents = (agentsList ?? []).map(normalizeAgent);
  const agentsMap = new Map(normalizedAgents.map((a) => [String(a.id), a]));

  if (groupBy === "leaders" && roleFilter) {
    filtered = filtered.filter((r) => {
      const agentId = String(r?.agent_id ?? r?.agents?.id ?? "");
      const role = r?.agents?.role ?? agentsMap.get(agentId)?.role ?? "platoon";
      return role === roleFilter;
    });
  }

  // 3) Fetch lookups in parallel (for names/logos + platoon display)
  const [{ data: depots }, { data: commanders }, { data: teams }] = await Promise.all([
    supabase.from("depots").select("id,name,photoURL,photo_url").order("name"),
    listCommanders(),
    listTeams(),
  ]);

  const depotsMap = new Map((depots ?? []).map((d) => [String(d.id), d]));
  const commandersMap = new Map((commanders ?? []).map((c) => [String(c.id), c]));
  const teamsMap = new Map((teams ?? []).map((p) => [String(p.id), p]));

  const { data: activeFormula, error: formulaError } = await formulaPromise;
  if (formulaError) throw formulaError;

  const resolvedFormula = activeFormula ?? null;

  const scoringConfig = resolvedFormula?.config ?? null;
  const scoringFn = (row) => computeTotalScore(resolvedBattleType, row, scoringConfig);

  // 4) Aggregate
  const rows = aggregateLeaderboard({
    rows: filtered,
    mode: normalizeGroupBy(groupBy),
    scoringFn,
    depotsMap,
    commandersMap,
    teamsMap,
    agentsMap,
  });

  // 5) Metrics for header cards
  const metrics = {
    entitiesCount: rows.length,
    totalLeads: rows.reduce((s, r) => s + toNumber(r.leads), 0),
    totalPayins: rows.reduce((s, r) => s + toNumber(r.payins), 0),
    totalSales: rows.reduce((s, r) => s + toNumber(r.sales), 0),
  };

  return {
    metrics,
    rows,
    formula: {
      data: resolvedFormula ?? null,
      battleType: resolvedBattleType,
      weekKey: resolvedWeekKey,
      missing: !resolvedFormula,
      fallback: null,
    },
    debug: {
      publishableRowsFetched,
      publishableRowsCount: filteredRows.length,
      filteredByRangeCount: filtered.length,
      startDate,
      endDate,
      groupBy,
      roleFilter,
      battleType: resolvedBattleType,
      weekKey: resolvedWeekKey,
      formulaMissing: !resolvedFormula,
    },
  };
}

export async function probeRawDataVisibility() {
  if (!supabaseConfigured || !supabase) {
    return { ok: false, reason: "not_configured", count: null, error: null };
  }

  const { count, error } = await supabase
    .from("public.publishable_raw_data")
    .select("id", { count: "exact", head: true });

  if (error) {
    return { ok: false, count: null, error };
  }

  return { ok: true, count: count ?? 0, error: null };
}

/* ------------------------------ Aggregation ------------------------------ */

function aggregateLeaderboard({
  rows,
  mode,
  scoringFn,
  depotsMap,
  commandersMap,
  teamsMap,
  agentsMap,
}) {
  if (mode === "platoon") {
    return aggregateUplines({ rows, scoringFn, agentsMap });
  }

  const map = new Map();

  for (const r of rows) {
    const joinedAgent = r.agents || {};
    const leads = toNumber(r.leads);
    const payins = toNumber(r.payins);
    const sales = toNumber(r.sales);

    const agentId = String(r.agent_id ?? joinedAgent.id ?? "");
    const mappedAgent = agentId && agentsMap ? agentsMap.get(agentId) : null;
    const agentData = { ...mappedAgent, ...joinedAgent };

    const leadsDepotId = r.leads_depot_id ?? null;
    const salesDepotId = r.sales_depot_id ?? null;
    const companyId = agentData.company_id ?? agentData.companyId ?? null;
    const platoonId = agentData.platoon_id ?? agentData.platoonId ?? null;

    const company = companyId ? commandersMap.get(String(companyId)) : null;
    const platoon = platoonId ? teamsMap.get(String(platoonId)) : null;
    const uplineId = agentData.uplineId ?? agentData.upline_agent_id ?? "";
    const upline = uplineId ? agentsMap?.get(String(uplineId)) : null;

    // Determine grouping key + display name + avatar
    let key = "";
    let name = "";
    let avatarUrl = "";
    let platoonName = "";
    const uplineName = upline?.name ?? "";

    if (mode === "leaders") {
      key = agentId;
      name = agentData.name ?? "(Unnamed)";
      avatarUrl = agentData.photoURL ?? agentData.photo_url ?? "";
      platoonName = platoon?.name ?? ""; // show platoon label in UI for leaders
    } else if (mode === "commanders") {
      key = String(companyId ?? "");
      name = (company?.name ?? key) || "(No Company)";
      avatarUrl = company?.photoURL ?? company?.photo_url ?? "";
    } else if (mode === "teams") {
      key = String(platoonId ?? "");
      name = (platoon?.name ?? key) || "(No Team)";
      avatarUrl = platoon?.photoURL ?? platoon?.photo_url ?? "";
    } else {
      // fallback to leaders
      key = agentId;
      name = agentData.name ?? "(Unnamed)";
      avatarUrl = agentData.photoURL ?? agentData.photo_url ?? "";
      platoonName = platoon?.name ?? "";
    }

    if (mode === "depots") {
      const ensureDepotBucket = (depotKey) => {
        if (!depotKey) return null;
        if (map.has(depotKey)) return map.get(depotKey);
        const depot = depotsMap.get(depotKey) ?? null;
        const depotName = depot?.name || (depotKey === "unassigned" ? "Unassigned" : depotKey);
        const bucket = {
          key: depotKey,
          name: depotName,
          avatarUrl: depot?.photoURL ?? depot?.photo_url ?? "",
          platoon: "",
          leads: 0,
          payins: 0,
          sales: 0,
          points: 0,
          rank: 0,
          uplineName: "",
        };
        map.set(depotKey, bucket);
        return bucket;
      };

      const leadsKey = leadsDepotId ? String(leadsDepotId) : "unassigned";
      const salesKey = salesDepotId ? String(salesDepotId) : "unassigned";

      const leadsBucket = ensureDepotBucket(leadsKey);
      const salesBucket = ensureDepotBucket(salesKey);

      if (leadsBucket) {
        leadsBucket.leads += leads;
      }
      if (salesBucket) {
        salesBucket.payins += payins;
        salesBucket.sales += sales;
      }

      continue;
    }

    if (!key) continue;

    if (!map.has(key)) {
      map.set(key, {
        key,
        name,
        avatarUrl,
        platoon: mode === "leaders" ? platoonName : "",
        leads: 0,
        payins: 0,
        sales: 0,
        points: 0,
        rank: 0,
        uplineName: mode === "leaders" ? uplineName : "",
      });
    }

    const item = map.get(key);
    item.leads += leads;
    item.payins += payins;
    item.sales += sales;
    if (mode === "leaders" && platoonName && !item.platoon) {
      item.platoon = platoonName;
    }
    if (mode === "leaders" && uplineName && !item.uplineName) {
      item.uplineName = uplineName;
    }
  }

  const result = Array.from(map.values()).map((x) => ({
    ...x,
    points: scoringFn(x),
  }));

  result.sort(
    (a, b) =>
      b.points - a.points || b.sales - a.sales || b.leads - a.leads || b.payins - a.payins
  );

  for (let i = 0; i < result.length; i++) result[i].rank = i + 1;

  return result;
}

/* ------------------------------ Helpers ------------------------------ */

/**
 * Platoon tab: aggregate all publishable leader rows under their upline_agent_id.
 * This groups all downlines for the same upline into a single row and sums
 * leads, payins, sales, then reuses the standard scoringFn for points.
 */
function aggregateUplines({ rows, scoringFn, agentsMap }) {
  const NO_UPLINE_KEY = "no-upline";
  const totalsByUpline = new Map();

  for (const r of rows) {
    const joinedAgent = r.agents || {};
    const agentId = String(r.agent_id ?? joinedAgent.id ?? "");
    const mappedAgent = agentId && agentsMap ? agentsMap.get(agentId) : null;
    const agentData = { ...mappedAgent, ...joinedAgent };

    const leads = toNumber(r.leads);
    const payins = toNumber(r.payins);
    const sales = toNumber(r.sales);

    const uplineIdRaw = agentData.uplineId ?? agentData.upline_agent_id ?? "";
    const uplineKey = uplineIdRaw ? String(uplineIdRaw) : NO_UPLINE_KEY;

    if (!totalsByUpline.has(uplineKey)) {
      totalsByUpline.set(uplineKey, { leads: 0, payins: 0, sales: 0 });
    }

    const bucket = totalsByUpline.get(uplineKey);
    bucket.leads += leads;
    bucket.payins += payins;
    bucket.sales += sales;
  }

  const result = Array.from(totalsByUpline.entries()).map(([uplineKey, totals]) => {
    const uplineAgent = uplineKey !== NO_UPLINE_KEY ? agentsMap?.get(String(uplineKey)) : null;
    const name =
      uplineAgent?.name ?? (uplineKey === NO_UPLINE_KEY ? "No Upline" : "Unknown Upline");
    const avatarUrl = uplineAgent?.photoURL ?? uplineAgent?.photo_url ?? "";
    const row = {
      key: uplineKey,
      name,
      avatarUrl,
      platoon: "",
      leads: totals.leads,
      payins: totals.payins,
      sales: totals.sales,
    };

    return {
      ...row,
      points: scoringFn(row),
    };
  });

  result.sort(
    (a, b) =>
      b.points - a.points || b.sales - a.sales || b.leads - a.leads || b.payins - a.payins
  );

  for (let i = 0; i < result.length; i++) result[i].rank = i + 1;

  return result;
}

function normalizeAgent(a) {
  return {
    id: a?.id ?? "",
    name: a?.name ?? "",
    uplineId: a?.uplineId ?? a?.upline_agent_id ?? "",
    company_id: a?.company_id ?? null,
    platoon_id: a?.platoon_id ?? null,
    role: a?.role ?? "platoon",
    photoURL: a?.photoURL ?? a?.photo_url ?? "",
  };
}

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Prefer date_real (date) if present.
 * Fallback to Firestore-exported timestamp JSON in `date`.
 */
function getRowDate(r) {
  if (r?.date_real) {
    // Supabase date is "YYYY-MM-DD"
    return new Date(`${r.date_real}T00:00:00`);
  }
  return parseFirestoreTimestampJson(r?.date);
}

function parseFirestoreTimestampJson(ts) {
  if (!ts) return null;

  // Sometimes already a string
  if (typeof ts === "string") {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
  }

  // Firestore export style: { _seconds, _nanoseconds }
  const sec = ts._seconds ?? ts.seconds;
  const nsec = ts._nanoseconds ?? ts.nanoseconds ?? 0;

  if (typeof sec === "number") {
    const ms = sec * 1000 + Math.floor(nsec / 1e6);
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }

  return null;
}

function normalizeBattleType(input) {
  const key = String(input || "").toLowerCase();
  if (key === "depots") return "depots";
  if (key === "companies") return "companies";
  if (key === "teams") return "teams";
  if (key === "commanders") return "commanders";
  if (key === "platoon" || key === "platoons") return "platoons";
  if (key === "leaders") return "leaders";
  return key || "leaders";
}

function normalizeGroupBy(input) {
  if (input === "companies") return "teams";
  return input;
}

function toIsoWeekKey(dateStr) {
  if (!dateStr) return null;
  const ref = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(ref.getTime())) return null;

  const utcDate = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate()));
  const day = utcDate.getUTCDay() || 7; // Monday=1, Sunday=7
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);

  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((utcDate - yearStart) / 86400000 + 1) / 7);

  return `${utcDate.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}
