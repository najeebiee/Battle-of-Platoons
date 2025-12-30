// public-view/src/services/leaderboard.service.js
import { supabase } from "./supabase";

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
 * - We intentionally DO NOT rely on PostgREST nested joins for depots/companies/platoons
 *   because those return null unless FK relationships are properly defined in Postgres.
 * - Instead: fetch lookups separately and attach by depotId/companyId/platoonId.
 */

export async function getLeaderboard({
  startDate, // "YYYY-MM-DD"
  endDate, // "YYYY-MM-DD"
  groupBy = "leaders", // "leaders" | "depots" | "companies"
  roleFilter = null, // null | "platoon" | "squad"
  scoring = defaultScore,
}) {
  // 1) Fetch raw_data + agents (basic fields only)
  const { data: rawRows, error } = await supabase
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
      agentId,
      agents:agents (
        id,
        name,
        photoURL,
        depotId,
        companyId,
        platoonId,
        role
      )
    `
    )
    .gte("date_real", startDate)
    .lte("date_real", endDate)
    .eq("voided", false)
    .eq("source", "company");

  if (error) throw error;

  // 2) If date_real exists & is correct, above filter is enough.
  //    Keep a safety filter in JS in case date_real has time/edge cases.
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T23:59:59`);

  const publishableRows = (rawRows ?? []).filter((r) => {
    const isCompany = (r?.source ?? "company") === "company";
    const isNotVoided = r?.voided === false || r?.voided === null || r?.voided === undefined;
    const matchedOrApproved = r?.approved === true || r?.matched === true || r?.publishable === true;
    const hasMatchedOrPublishFlag = r?.matched !== undefined || r?.publishable !== undefined;

    // Rely on RLS to return only publishable rows, but hard-block if explicit flags say otherwise.
    if (!isCompany || !isNotVoided) return false;
    if (matchedOrApproved) return true;
    if (hasMatchedOrPublishFlag) return false;
    return true; // Backend should have filtered already; keep to avoid hiding matched rows without flags.
  });

  let filtered = publishableRows.filter((r) => {
    const d = getRowDate(r);
    return d && d >= start && d <= end;
  });

  if (groupBy === "leaders" && roleFilter) {
    filtered = filtered.filter((r) => {
      const role = r?.agents?.role ?? "platoon";
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
  });

  // 5) Metrics for header cards
  const metrics = {
    entitiesCount: rows.length,
    totalLeads: rows.reduce((s, r) => s + toNumber(r.leads), 0),
    totalPayins: rows.reduce((s, r) => s + toNumber(r.payins), 0),
    totalSales: rows.reduce((s, r) => s + toNumber(r.sales), 0),
  };

  return { metrics, rows };
}

/* ------------------------------ Aggregation ------------------------------ */

function aggregateLeaderboard({
  rows,
  mode,
  scoringFn,
  depotsMap,
  companiesMap,
  platoonsMap,
}) {
  const map = new Map();

  for (const r of rows) {
    const a = r.agents || {};
    const leads = toNumber(r.leads);
    const payins = toNumber(r.payins);
    const sales = toNumber(r.sales);

    const agentId = String(r.agent_id ?? r.agentId ?? a.id ?? "");

    // Resolve lookup entities
    const depot = a.depotId ? depotsMap.get(String(a.depotId)) : null;
    const company = a.companyId ? companiesMap.get(String(a.companyId)) : null;
    const platoon = a.platoonId ? platoonsMap.get(String(a.platoonId)) : null;

    // Determine grouping key + display name + avatar
    let key = "";
    let name = "";
    let avatarUrl = "";
    let platoonName = "";

    if (mode === "leaders") {
      key = agentId;
      name = a.name ?? "(Unnamed)";
      avatarUrl = a.photoURL ?? "";
      platoonName = platoon?.name ?? ""; // show platoon label in UI for leaders
    } else if (mode === "depots") {
      key = String(a.depotId ?? "");
      name = (depot?.name ?? key) || "(No Depot)";
      avatarUrl = depot?.photoURL ?? "";
    } else if (mode === "companies") {
      key = String(a.companyId ?? "");
      name = (company?.name ?? key) || "(No Commander)";
      avatarUrl = company?.photoURL ?? "";
    } else {
      // fallback to leaders
      key = agentId;
      name = a.name ?? "(Unnamed)";
      avatarUrl = a.photoURL ?? "";
      platoonName = platoon?.name ?? "";
    }

    // Skip rows that can't be grouped (e.g., missing depotId when mode=depots)
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
      });
    }

    const item = map.get(key);
    item.leads += leads;
    item.payins += payins;
    item.sales += sales;
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
