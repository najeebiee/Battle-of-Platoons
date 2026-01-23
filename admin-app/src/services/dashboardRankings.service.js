import { listAgents } from "./agents.service";
import { listCompanies } from "./companies.service";
import { listDepotsDetailed } from "./depots.service";
import { supabase } from "./supabase";

function normalizeMode(mode) {
  const key = String(mode || "").toLowerCase();
  if (key === "depots") return "depots";
  if (key === "companies") return "companies";
  return "leaders";
}

function normalizePhotoUrl(item) {
  return item?.photoURL ?? item?.photo_url ?? "";
}

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function parseFirestoreTimestampJson(ts) {
  if (!ts) return null;
  if (typeof ts === "string") {
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const sec = ts._seconds ?? ts.seconds;
  const nsec = ts._nanoseconds ?? ts.nanoseconds ?? 0;
  if (typeof sec === "number") {
    const ms = sec * 1000 + Math.floor(nsec / 1e6);
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function getRowDate(row) {
  if (row?.date_real) return new Date(`${row.date_real}T00:00:00`);
  return parseFirestoreTimestampJson(row?.date);
}

export async function getDashboardRankings({ mode, dateFrom, dateTo } = {}) {
  const resolvedMode = normalizeMode(mode);
  const [agents, depots, companies, rawResult] = await Promise.all([
    listAgents(),
    listDepotsDetailed(),
    listCompanies(),
    supabase
      .from("raw_data")
      .select(
        `
        id,
        agent_id,
        leads,
        payins,
        sales,
        date_real,
        date,
        voided,
        agents:agents (
          id,
          name,
          photo_url,
          photoURL,
          depot_id,
          company_id,
          role
        )
      `
      ),
  ]);

  if (rawResult?.error) throw rawResult.error;

  const agentsMap = new Map((agents ?? []).map((agent) => [String(agent.id), agent]));
  const depotsMap = new Map((depots ?? []).map((depot) => [String(depot.id), depot]));
  const companiesMap = new Map((companies ?? []).map((company) => [String(company.id), company]));

  let rawRows = rawResult?.data ?? [];

  if (dateFrom && dateTo) {
    const start = new Date(`${dateFrom}T00:00:00`);
    const end = new Date(`${dateTo}T23:59:59`);
    rawRows = rawRows.filter((row) => {
      const d = getRowDate(row);
      return d && d >= start && d <= end;
    });
  }

  const grouped = new Map();
  let rows = [];

  if (resolvedMode === "leaders") {
    rawRows.forEach((row) => {
      const agentId = String(row.agent_id ?? "");
      const agent = row.agents ?? agentsMap.get(agentId) ?? {};
      if (!agentId) return;
      if (!grouped.has(agentId)) {
        grouped.set(agentId, {
          id: agentId,
          name: agent.name ?? "Unknown Leader",
          photoUrl: normalizePhotoUrl(agent),
          leads: 0,
          payins: 0,
          sales: 0,
          points: 0,
        });
      }
      const item = grouped.get(agentId);
      item.leads += toNumber(row.leads);
      item.payins += toNumber(row.payins);
      item.sales += toNumber(row.sales);
    });
    rows = Array.from(grouped.values());
  } else if (resolvedMode === "depots") {
    rawRows.forEach((row) => {
      const agentId = String(row.agent_id ?? "");
      const agent = row.agents ?? agentsMap.get(agentId) ?? {};
      const depotId = agent.depot_id ?? agent.depotId ?? "";
      const key = depotId ? String(depotId) : "";
      if (!key) return;
      const depot = depotsMap.get(key);
      if (!grouped.has(key)) {
        grouped.set(key, {
          id: key,
          name: depot?.name ?? "Unknown Depot",
          photoUrl: normalizePhotoUrl(depot),
          leads: 0,
          payins: 0,
          sales: 0,
          points: 0,
        });
      }
      const item = grouped.get(key);
      item.leads += toNumber(row.leads);
      item.payins += toNumber(row.payins);
      item.sales += toNumber(row.sales);
    });
    rows = Array.from(grouped.values());
  } else if (resolvedMode === "companies") {
    rawRows.forEach((row) => {
      const agentId = String(row.agent_id ?? "");
      const agent = row.agents ?? agentsMap.get(agentId) ?? {};
      const companyId = agent.company_id ?? agent.companyId ?? "";
      const key = companyId ? String(companyId) : "";
      if (!key) return;
      const company = companiesMap.get(key);
      if (!grouped.has(key)) {
        grouped.set(key, {
          id: key,
          name: company?.name ?? "Unknown Company",
          photoUrl: normalizePhotoUrl(company),
          leads: 0,
          payins: 0,
          sales: 0,
          points: 0,
        });
      }
      const item = grouped.get(key);
      item.leads += toNumber(row.leads);
      item.payins += toNumber(row.payins);
      item.sales += toNumber(row.sales);
    });
    rows = Array.from(grouped.values());
  }

  const totals = rows.reduce(
    (acc, row) => {
      acc.totalLeads += toNumber(row.leads);
      acc.totalSales += toNumber(row.sales);
      return acc;
    },
    { totalLeads: 0, totalSales: 0 }
  );

  const kpis = {
    leadersCount: (agents ?? []).length,
    depotsCount: (depots ?? []).length,
    companiesCount: (companies ?? []).length,
    totalLeads: totals.totalLeads,
    totalSales: totals.totalSales,
  };

  return { kpis, rows };
}
