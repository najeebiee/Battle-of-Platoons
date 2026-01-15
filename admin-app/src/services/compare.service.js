import { listAgents } from "./agents.service";
import { listDepots } from "./depots.service";
import { isPublishable } from "./rawData.service";
import { supabase } from "./supabase";

function computeStatus(entry) {
  if (entry.company && entry.depot) {
    const matched =
      entry.company.leads === entry.depot.leads &&
      entry.company.payins === entry.depot.payins &&
      entry.company.sales === entry.depot.sales;
    return matched ? "matched" : "mismatch";
  }
  if (entry.company && !entry.depot) return "missing_depot";
  if (!entry.company && entry.depot) return "missing_company";
  return "missing_company";
}

function computeDelta(company, depot) {
  if (!company || !depot) return null;
  const leadsDepotMismatch =
    company.leads_depot_id && depot.leads_depot_id
      ? String(company.leads_depot_id) !== String(depot.leads_depot_id)
      : false;
  const salesDepotMismatch =
    company.sales_depot_id && depot.sales_depot_id
      ? String(company.sales_depot_id) !== String(depot.sales_depot_id)
      : false;
  return {
    leadsDiff: (company.leads ?? 0) - (depot.leads ?? 0),
    payinsDiff: (company.payins ?? 0) - (depot.payins ?? 0),
    salesDiff: (company.sales ?? 0) - (depot.sales ?? 0),
    leadsDepotMismatch,
    salesDepotMismatch,
  };
}

export async function listCompareRows({ dateFrom, dateTo, agentId, status } = {}) {
  let query = supabase
    .from("raw_data")
    .select(
      "id,agent_id,date_real,leads,payins,sales,leads_depot_id,sales_depot_id,source,voided,approved"
    )
    .eq("voided", false)
    .in("source", ["company", "depot"]);

  if (dateFrom) query = query.gte("date_real", dateFrom);
  if (dateTo) query = query.lte("date_real", dateTo);
  if (agentId) query = query.eq("agent_id", agentId);

  const { data, error } = await query.order("date_real", { ascending: false });
  if (error) throw error;

  const depots = await listDepots();
  const depotNames = new Map((depots ?? []).map(depot => [String(depot.id), depot.name]));

  const entries = new Map();
  (data ?? []).forEach(row => {
    if (!row.agent_id || !row.date_real) return;
    const key = `${row.date_real}_${row.agent_id}`;
    if (!entries.has(key)) {
      entries.set(key, {
        key,
        date_real: row.date_real,
        agent_id: row.agent_id,
        company: null,
        depot: null,
      });
    }

    const entry = entries.get(key);
    const payload = {
      leads: Number(row.leads ?? 0) || 0,
      payins: Number(row.payins ?? 0) || 0,
      sales: Number(row.sales ?? 0) || 0,
      leads_depot_id: row.leads_depot_id ?? null,
      sales_depot_id: row.sales_depot_id ?? null,
      leadsDepotName: row.leads_depot_id ? depotNames.get(String(row.leads_depot_id)) ?? "" : "",
      salesDepotName: row.sales_depot_id ? depotNames.get(String(row.sales_depot_id)) ?? "" : "",
      approved: Boolean(row.approved),
      source: row.source,
      voided: Boolean(row.voided),
    };
    if (row.source === "company") entry.company = payload;
    if (row.source === "depot") entry.depot = payload;
  });

  const agents = await listAgents();
  const agentsById = new Map(agents.map(agent => [agent.id, agent]));

  let rows = Array.from(entries.values()).map(entry => {
    const agent = agentsById.get(entry.agent_id);
    const statusValue = computeStatus(entry);
    const approvedCompany = Boolean(entry.company?.approved);
    const matched = statusValue === "matched";
    const publishable = isPublishable(entry.company, entry.depot);
    return {
      ...entry,
      leader_name: agent?.name ?? "(Restricted)",
      status: statusValue,
      delta: computeDelta(entry.company, entry.depot),
      restricted: !agent,
      restricted_agent_id: agent ? null : entry.agent_id,
      approved: approvedCompany,
      publishable,
      matched,
    };
  });

  if (status) {
    rows = rows.filter(row => row.status === status);
  }

  return { rows };
}
