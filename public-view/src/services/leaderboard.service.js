// public-view/src/services/leaderboard.service.js
import { supabase, supabaseConfigured } from "./supabase";

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
 * - Instead: fetch lookups separately and attach by depot_id/company_id/platoon_id.
 */

export async function getLeaderboard({
  startDate, // "YYYY-MM-DD"
  endDate, // "YYYY-MM-DD"
  groupBy = "leaders", // "leaders" | "depots" | "companies" | "platoon"
  roleFilter = null, // null | "platoon" | "squad" | "team"
  scoring = defaultScore,
}) {
  if (!supabaseConfigured || !supabase) {
    throw new Error("Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
  }

  const agentsPromise = supabase
    .from("agents")
    .select("id,name,upline_agent_id,depot_id,company_id,platoon_id,role,photo_url,photoURL");

  // 1) Fetch raw_data + agents (basic fields only) - rely on RLS for publishability
  const { data: companyRows, error: companyError } = await supabase
    .from("raw_data")
    .select(
      `
      approved,
      source,
      voided,
      id,
      leads,
      payins,
      sales,
      date_real,
      date,
      agent_id,
      agents:agents (
        id,
        name,
        photoURL,
        photo_url,
        depot_id,
        company_id,
        platoon_id,
        role,
        upline_agent_id
      )
    `
    )
    .gte("date_real", startDate)
    .lte("date_real", endDate)
    .eq("voided", false)
    .eq("source", "company");

  if (companyError) throw companyError;

  // 2) If date_real exists & is correct, above filter is enough.
  //    Keep a safety filter in JS in case date_real has time/edge cases.
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T23:59:59`);

  const isDev = Boolean(import.meta.env?.DEV);
  let warnedMissingAgentId = false;
  let warnedMissingAgentData = false;

  const companyRowsFetched = companyRows?.length ?? 0;
  const depotRowsFetched = 0;

  const filteredRows = (companyRows ?? []).filter((r) => {
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
  const [{ data: depots }, { data: companies }, { data: platoons }] =
    await Promise.all([
      supabase.from("depots").select("id,name,photoURL"),
      supabase.from("companies").select("id,name,photoURL"),
      supabase.from("platoons").select("id,name,photoURL"),
    ]);

  const depotsMap = new Map((depots ?? []).map((d) => [String(d.id), d]));
  const companiesMap = new Map((companies ?? []).map((c) => [String(c.id), c]));
  const platoonsMap = new Map((platoons ?? []).map((p) => [String(p.id), p]));

  // 4) Aggregate
  const rows = aggregateLeaderboard({
    rows: filtered,
    mode: groupBy,
    scoringFn: scoring,
    depotsMap,
    companiesMap,
    platoonsMap,
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
    debug: {
      companyRowsFetched,
      depotRowsFetched,
      publishableRowsCount: filteredRows.length,
      filteredByRangeCount: filtered.length,
      startDate,
      endDate,
      groupBy,
      roleFilter,
    },
  };
}

export async function probeRawDataVisibility() {
  if (!supabaseConfigured || !supabase) {
    return { ok: false, reason: "not_configured", count: null, error: null };
  }

  const { count, error } = await supabase
    .from("raw_data")
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
  companiesMap,
  platoonsMap,
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

    // Resolve lookup entities
    const depotId = agentData.depot_id ?? agentData.depotId ?? null;
    const companyId = agentData.company_id ?? agentData.companyId ?? null;
    const platoonId = agentData.platoon_id ?? agentData.platoonId ?? null;

    const depot = depotId ? depotsMap.get(String(depotId)) : null;
    const company = companyId ? companiesMap.get(String(companyId)) : null;
    const platoon = platoonId ? platoonsMap.get(String(platoonId)) : null;
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
    } else if (mode === "depots") {
      key = String(depotId ?? "");
      name = (depot?.name ?? key) || "(No Depot)";
      avatarUrl = depot?.photoURL ?? "";
    } else if (mode === "companies") {
      key = String(companyId ?? "");
      name = (company?.name ?? key) || "(No Commander)";
      avatarUrl = company?.photoURL ?? "";
    } else {
      // fallback to leaders
      key = agentId;
      name = agentData.name ?? "(Unnamed)";
      avatarUrl = agentData.photoURL ?? agentData.photo_url ?? "";
      platoonName = platoon?.name ?? "";
    }

    // Skip rows that can't be grouped (e.g., missing depot_id when mode=depots)
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
    depot_id: a?.depot_id ?? null,
    company_id: a?.company_id ?? null,
    platoon_id: a?.platoon_id ?? null,
    role: a?.role ?? "platoon",
    photoURL: a?.photoURL ?? a?.photo_url ?? "",
  };
}

function defaultScore(row) {
  // Simple baseline scoring:
  // - 1 pt per lead
  // - 2 pts per payin
  // - sales / 1000 (30,000 sales => 30 pts)
  return toNumber(row.leads) * 1 + toNumber(row.payins) * 2 + toNumber(row.sales) / 1000;
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
