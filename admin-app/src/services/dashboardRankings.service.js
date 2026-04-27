import { listAgents, listPlatoons } from "./agents.service";
import { listCompanies } from "./companies.service";
import { listProductCenterUnits } from "./productCenterUnits.service";
import { computeTotalScore } from "./scoringEngine";
import { supabase } from "./supabase";

function normalizeMode(mode) {
  const key = String(mode || "").toLowerCase();
  if (key === "depots") return "depots";
  if (key === "companies") return "companies";
  if (key === "commanders") return "commanders";
  return "leaders";
}

function normalizeLeaderRole(roleFilter) {
  const key = String(roleFilter || "").toLowerCase();
  if (key === "member") return "member";
  if (key === "team_leader" || key === "team") return "team_leader";
  if (key === "squad") return "squad";
  return "platoon";
}

function resolveBattleType(mode, roleFilter) {
  if (mode === "depots") return "depots";
  if (mode === "commanders") return "commanders";
  if (mode === "companies") return "companies";
  const leaderRole = normalizeLeaderRole(roleFilter);
  if (leaderRole === "member") return "members";
  if (leaderRole === "squad") return "squads";
  if (leaderRole === "team_leader") return "team_leaders";
  return "platoons";
}

function normalizeAgentRole(role) {
  const key = String(role || "").toLowerCase();
  if (key === "member") return "member";
  if (key === "team_leader" || key === "team") return "team_leader";
  if (key === "squad") return "squad";
  return "platoon";
}

function normalizePhotoUrl(item) {
  return item?.photoURL ?? item?.photo_url ?? "";
}

function getMergedAgent(row, agentsMap) {
  const agentId = String(row?.agent_id ?? "");
  const mapped = agentId ? agentsMap.get(agentId) ?? {} : {};
  const joined = row?.agents ?? {};
  return { ...mapped, ...joined };
}

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function formatYmd(date) {
  return date.toISOString().slice(0, 10);
}

function toIsoWeekKey(dateValue) {
  if (!dateValue) return null;
  const ref = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(ref.getTime())) return null;
  const utcDate = new Date(Date.UTC(ref.getFullYear(), ref.getMonth(), ref.getDate()));
  const day = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((utcDate - yearStart) / 86400000 + 1) / 7);
  return `${utcDate.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

async function getActiveFormula(battleType, weekKey) {
  const { data, error } = await supabase.rpc("get_active_scoring_formula", {
    battle_type: battleType,
    week_key: weekKey,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data && data.length === 0 ? null : data;
  return row ?? null;
}

function getRowDate(row) {
  if (row?.date_real) return new Date(`${row.date_real}T00:00:00`);
  return null;
}

function rankRows(rows = [], mode = "leaders") {
  const sorted = [...rows].sort((a, b) => {
    const pointsDiff = toNumber(b.points) - toNumber(a.points);
    if (pointsDiff !== 0) return pointsDiff;

    if (mode === "depots") {
      const salesDiff = toNumber(b.sales) - toNumber(a.sales);
      if (salesDiff !== 0) return salesDiff;

      const activationDiff = toNumber(b.activation) - toNumber(a.activation);
      if (activationDiff !== 0) return activationDiff;

      return toNumber(b.leads) - toNumber(a.leads);
    }

    const activationDiff = toNumber(b.activation) - toNumber(a.activation);
    if (activationDiff !== 0) return activationDiff;

    const payinsDiff = toNumber(b.payins) - toNumber(a.payins);
    if (payinsDiff !== 0) return payinsDiff;

    const salesDiff = toNumber(b.sales) - toNumber(a.sales);
    if (salesDiff !== 0) return salesDiff;

    return toNumber(b.leads) - toNumber(a.leads);
  });

  return sorted.map((row, index) => ({ ...row, rank: index + 1 }));
}

export async function getDashboardRankings({ mode, dateFrom, dateTo, roleFilter } = {}) {
  const resolvedMode = normalizeMode(mode);
  const resolvedBattleType = resolveBattleType(resolvedMode, roleFilter);
  const resolvedEndDate = dateTo || formatYmd(new Date());
  const resolvedWeekKey = toIsoWeekKey(resolvedEndDate);

  const [agents, productCenterUnits, companies, platoons, rawResult, activeFormula] =
    await Promise.all([
      listAgents(),
      listProductCenterUnits({ onlyActive: false }),
      listCompanies(),
      listPlatoons(),
      supabase
        .from("raw_data_v2")
        .select(
          `
          id,
          agent_id,
          leads,
          payins,
          sales,
          activation,
          leads_product_center_unit_id,
          sales_product_center_unit_id,
          activation_product_center_unit_id,
          date_real,
          voided,
          agents:agents (
            id,
            name,
            photo_url,
            photoURL,
            depot_id,
            company_id,
            platoon_id,
            upline_agent_id,
            role
          )
        `
        )
        .eq("voided", false),
      getActiveFormula(resolvedBattleType, resolvedWeekKey),
    ]);

  if (rawResult?.error) throw rawResult.error;

  const agentsMap = new Map((agents ?? []).map((agent) => [String(agent.id), agent]));
  const productCenterUnitsMap = new Map(
    (productCenterUnits ?? []).map((unit) => [String(unit.id), unit])
  );
  const companiesMap = new Map((companies ?? []).map((company) => [String(company.id), company]));
  const platoonsMap = new Map((platoons ?? []).map((platoon) => [String(platoon.id), platoon]));

  let rawRows = rawResult?.data ?? [];
  if (dateFrom || dateTo) {
    const start = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
    const end = dateTo ? new Date(`${dateTo}T23:59:59`) : null;
    rawRows = rawRows.filter((row) => {
      const d = getRowDate(row);
      if (!d) return false;
      if (start && d < start) return false;
      if (end && d > end) return false;
      return true;
    });
  }

  const grouped = new Map();
  let rows = [];
  const scoringConfig = activeFormula?.config ?? null;
  const scoreRow = (row) => computeTotalScore(resolvedBattleType, row, scoringConfig);

  const leadersMode = resolvedMode === "leaders";

  if (leadersMode && roleFilter && roleFilter !== "platoon") {
    rawRows = rawRows.filter((row) => {
      const agent = getMergedAgent(row, agentsMap);
      return normalizeAgentRole(agent?.role) === normalizeLeaderRole(roleFilter);
    });
  }

  if (leadersMode && roleFilter === "platoon") {
    const NO_UPLINE_KEY = "no-upline";
    rawRows.forEach((row) => {
      const agent = getMergedAgent(row, agentsMap);
      const uplineId = agent.upline_agent_id ?? agent.uplineAgentId ?? "";
      const key = uplineId ? String(uplineId) : NO_UPLINE_KEY;

      if (!grouped.has(key)) {
        const uplineAgent = key !== NO_UPLINE_KEY ? agentsMap.get(key) : null;
        grouped.set(key, {
          id: key,
          name: uplineAgent?.name ?? (key === NO_UPLINE_KEY ? "No Upline" : "Unknown Upline"),
          photoUrl: normalizePhotoUrl(uplineAgent),
          leads: 0,
          payins: 0,
          sales: 0,
          activation: 0,
        });
      }

      const item = grouped.get(key);
      item.leads += toNumber(row.leads);
      item.payins += toNumber(row.payins);
      item.sales += toNumber(row.sales);
      item.activation += toNumber(row.activation);
    });
    rows = Array.from(grouped.values());
  } else if (leadersMode) {
    rawRows.forEach((row) => {
      const agentId = String(row.agent_id ?? "");
      const agent = getMergedAgent(row, agentsMap);
      if (!agentId) return;
      if (!grouped.has(agentId)) {
        grouped.set(agentId, {
          id: agentId,
          name: agent.name ?? "Unknown Leader",
          photoUrl: normalizePhotoUrl(agent),
          leads: 0,
          payins: 0,
          sales: 0,
          activation: 0,
        });
      }
      const item = grouped.get(agentId);
      item.leads += toNumber(row.leads);
      item.payins += toNumber(row.payins);
      item.sales += toNumber(row.sales);
      item.activation += toNumber(row.activation);
    });
    rows = Array.from(grouped.values());
  } else if (resolvedMode === "depots") {
    const ensureUnitBucket = (unitKey) => {
      if (!unitKey) return null;
      if (grouped.has(unitKey)) return grouped.get(unitKey);
      const unit = productCenterUnitsMap.get(unitKey) ?? null;
      const unitName = unit?.name || (unitKey === "unassigned" ? "Unassigned" : unitKey);
      const unitType = unit?.unit_type ?? "";
      const bucket = {
        id: unitKey,
        name: unitType ? `${unitType.toUpperCase()} - ${unitName}` : unitName,
        photoUrl: "",
        unitType,
        leads: 0,
        payins: 0,
        sales: 0,
        activation: 0,
      };
      grouped.set(unitKey, bucket);
      return bucket;
    };

    rawRows.forEach((row) => {
      const leadsKey = row.leads_product_center_unit_id
        ? String(row.leads_product_center_unit_id)
        : "unassigned";
      const salesKey = row.sales_product_center_unit_id
        ? String(row.sales_product_center_unit_id)
        : "unassigned";
      const activationKey = row.activation_product_center_unit_id
        ? String(row.activation_product_center_unit_id)
        : "unassigned";

      const leadsBucket = ensureUnitBucket(leadsKey);
      const salesBucket = ensureUnitBucket(salesKey);
      const activationBucket = ensureUnitBucket(activationKey);

      if (leadsBucket) leadsBucket.leads += toNumber(row.leads);
      if (salesBucket) salesBucket.sales += toNumber(row.sales);
      if (activationBucket) activationBucket.activation += toNumber(row.activation);
    });
    rows = Array.from(grouped.values());
  } else if (resolvedMode === "commanders") {
    rawRows.forEach((row) => {
      const agent = getMergedAgent(row, agentsMap);
      const companyId = agent.company_id ?? agent.companyId ?? "";
      const key = companyId ? String(companyId) : "";
      if (!key) return;
      const company = companiesMap.get(key);
      if (!grouped.has(key)) {
        grouped.set(key, {
          id: key,
          name: company?.name ?? "Unknown Commander",
          photoUrl: normalizePhotoUrl(company),
          leads: 0,
          payins: 0,
          sales: 0,
          activation: 0,
        });
      }
      const item = grouped.get(key);
      item.leads += toNumber(row.leads);
      item.payins += toNumber(row.payins);
      item.sales += toNumber(row.sales);
      item.activation += toNumber(row.activation);
    });
    rows = Array.from(grouped.values());
  } else if (resolvedMode === "companies") {
    rawRows.forEach((row) => {
      const agent = getMergedAgent(row, agentsMap);
      const platoonId = agent.platoon_id ?? agent.platoonId ?? "";
      const key = platoonId ? String(platoonId) : "";
      if (!key) return;
      const platoon = platoonsMap.get(key);
      if (!grouped.has(key)) {
        grouped.set(key, {
          id: key,
          name: platoon?.name ?? "Unknown Company",
          photoUrl: normalizePhotoUrl(platoon),
          leads: 0,
          payins: 0,
          sales: 0,
          activation: 0,
        });
      }
      const item = grouped.get(key);
      item.leads += toNumber(row.leads);
      item.payins += toNumber(row.payins);
      item.sales += toNumber(row.sales);
      item.activation += toNumber(row.activation);
    });
    rows = Array.from(grouped.values());
  }

  const rankedRows = rankRows(
    rows.map((row) => ({
      ...row,
      points: scoreRow(row),
    })),
    resolvedMode
  );

  const totals = rankedRows.reduce(
    (acc, row) => {
      acc.totalLeads += toNumber(row.leads);
      acc.totalPayins += toNumber(row.payins);
      acc.totalSales += toNumber(row.sales);
      acc.totalActivation += toNumber(row.activation);
      return acc;
    },
    { totalLeads: 0, totalPayins: 0, totalSales: 0, totalActivation: 0 }
  );

  const kpis = {
    leadersCount: (agents ?? []).length,
    productCentersCount: (productCenterUnits ?? []).length,
    companiesCount: (companies ?? []).length,
    totalLeads: totals.totalLeads,
    totalPayins: totals.totalPayins,
    totalSales: totals.totalSales,
    totalActivation: totals.totalActivation,
  };

  return {
    kpis,
    rows: rankedRows,
    formula: {
      data: activeFormula ?? null,
      battleType: resolvedBattleType,
      weekKey: resolvedWeekKey,
      missing: !activeFormula,
    },
  };
}
