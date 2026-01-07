import { supabase } from "./supabase";

const SCORING_TIMESTAMP_COLUMNS = ["created_at", "timestamp", "at"];
const SCORING_ACTION_COLUMNS = ["action", "event"];
const SCORING_ACTOR_COLUMNS = ["actor_id", "actor_uuid", "user_id", "actor"];

function isMissingColumn(error, column) {
  if (!error?.message || !column) return false;
  const message = error.message.toLowerCase();
  return message.includes("does not exist") && message.includes(column.toLowerCase());
}

export async function listRawDataAudit({ fromTs, toTs, actorId, action, limit = 50, offset = 0 }) {
  let query = supabase.from("raw_data_audit").select("*", { count: "exact" });

  if (fromTs) query = query.gte("created_at", fromTs);
  if (toTs) query = query.lte("created_at", toTs);
  if (action) query = query.eq("action", action);
  if (actorId) query = query.eq("actor_id", actorId);

  query = query.order("created_at", { ascending: false }).range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  return { data: data ?? [], error, count };
}

export async function listScoringFormulaAudit({ fromTs, toTs, actorId, action, limit = 50, offset = 0 }) {
  let timestampIndex = 0;
  let actionIndex = action ? 0 : -1;
  let actorIndex = actorId ? 0 : -1;
  let attempts = 0;
  let lastError = null;

  while (attempts < 12) {
    attempts += 1;
    const timestampColumn =
      timestampIndex >= 0 && timestampIndex < SCORING_TIMESTAMP_COLUMNS.length
        ? SCORING_TIMESTAMP_COLUMNS[timestampIndex]
        : null;
    const actionColumn =
      actionIndex >= 0 && actionIndex < SCORING_ACTION_COLUMNS.length
        ? SCORING_ACTION_COLUMNS[actionIndex]
        : null;
    const actorColumn =
      actorIndex >= 0 && actorIndex < SCORING_ACTOR_COLUMNS.length
        ? SCORING_ACTOR_COLUMNS[actorIndex]
        : null;

    let query = supabase.from("scoring_formula_audit").select("*", { count: "exact" });

    if (timestampColumn) {
      if (fromTs) query = query.gte(timestampColumn, fromTs);
      if (toTs) query = query.lte(timestampColumn, toTs);
      query = query.order(timestampColumn, { ascending: false });
    }

    if (actionColumn && action) query = query.eq(actionColumn, action);
    if (actorColumn && actorId) query = query.eq(actorColumn, actorId);

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (!error) return { data: data ?? [], error: null, count };

    lastError = error;

    if (isMissingColumn(error, timestampColumn)) {
      if (timestampIndex < SCORING_TIMESTAMP_COLUMNS.length - 1) {
        timestampIndex += 1;
      } else {
        timestampIndex = SCORING_TIMESTAMP_COLUMNS.length;
      }
      continue;
    }

    if (isMissingColumn(error, actionColumn)) {
      if (actionIndex < SCORING_ACTION_COLUMNS.length - 1) {
        actionIndex += 1;
      } else {
        actionIndex = SCORING_ACTION_COLUMNS.length;
      }
      continue;
    }

    if (isMissingColumn(error, actorColumn)) {
      if (actorIndex < SCORING_ACTOR_COLUMNS.length - 1) {
        actorIndex += 1;
      } else {
        actorIndex = SCORING_ACTOR_COLUMNS.length;
      }
      continue;
    }

    return { data: [], error, count: null };
  }

  return { data: [], error: lastError, count: null };
}

export async function listFinalizedWeeks({ limit = 50, offset = 0 }) {
  const { data, error, count } = await supabase
    .from("finalized_weeks")
    .select("*", { count: "exact" })
    .order("start_date", { ascending: false })
    .range(offset, offset + limit - 1);

  return { data: data ?? [], error, count };
}

export async function getProfilesByIds(userIds = []) {
  if (!Array.isArray(userIds) || userIds.length === 0) return [];
  const { data, error } = await supabase.rpc("get_user_emails_super_admin", {
  user_ids: userIds,
});
  if (error) return [];
  return data ?? [];
}
