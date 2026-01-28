import { supabase } from "./supabase";

const SCORING_TIMESTAMP_COLUMNS = ["created_at", "timestamp", "at"];
const SCORING_ACTION_COLUMNS = ["action", "event"];
const SCORING_ACTOR_COLUMNS = ["actor_id", "actor_uuid", "user_id", "actor"];

function isUuid(value) {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.toString()
  );
}

function isMissingColumn(error, column) {
  if (!error?.message || !column) return false;
  const message = error.message.toLowerCase();
  return message.includes("does not exist") && message.includes(column.toLowerCase());
}

function isRangeError(error) {
  if (!error) return false;
  if (error.code?.toString?.() === "416") return true;
  const message = error.message?.toLowerCase?.() ?? "";
  return message.includes("range not satisfiable");
}

export async function listRawDataAudit({ fromTs, toTs, actorId, action, from = 0, to = 49 }) {
  let dataQuery = supabase.from("raw_data_audit").select("*", { count: "exact" });
  let countQuery = supabase.from("raw_data_audit").select("*", { count: "exact", head: true });

  if (fromTs) {
    dataQuery = dataQuery.gte("created_at", fromTs);
    countQuery = countQuery.gte("created_at", fromTs);
  }
  if (toTs) {
    dataQuery = dataQuery.lte("created_at", toTs);
    countQuery = countQuery.lte("created_at", toTs);
  }
  if (action) {
    dataQuery = dataQuery.eq("action", action);
    countQuery = countQuery.eq("action", action);
  }
  if (actorId) {
    dataQuery = dataQuery.eq("actor_id", actorId);
    countQuery = countQuery.eq("actor_id", actorId);
  }

  const countResult = await countQuery;
  if (countResult.error) return { data: [], error: countResult.error, count: null };
  const total = countResult.count ?? 0;
  if (from >= total) return { data: [], error: null, count: total };

  dataQuery = dataQuery.order("created_at", { ascending: false }).range(from, to);

  const { data, error, count } = await dataQuery;
  if (error && isRangeError(error)) return { data: [], error: null, count: total };
  return { data: data ?? [], error, count: count ?? total };
}

export async function listScoringFormulaAudit({ fromTs, toTs, actorId, action, from = 0, to = 49 }) {
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

    let dataQuery = supabase.from("scoring_formula_audit").select("*", { count: "exact" });
    let countQuery = supabase.from("scoring_formula_audit").select("*", { count: "exact", head: true });

    if (timestampColumn) {
      if (fromTs) {
        dataQuery = dataQuery.gte(timestampColumn, fromTs);
        countQuery = countQuery.gte(timestampColumn, fromTs);
      }
      if (toTs) {
        dataQuery = dataQuery.lte(timestampColumn, toTs);
        countQuery = countQuery.lte(timestampColumn, toTs);
      }
      dataQuery = dataQuery.order(timestampColumn, { ascending: false });
    }

    if (actionColumn && action) {
      dataQuery = dataQuery.eq(actionColumn, action);
      countQuery = countQuery.eq(actionColumn, action);
    }
    if (actorColumn && actorId) {
      dataQuery = dataQuery.eq(actorColumn, actorId);
      countQuery = countQuery.eq(actorColumn, actorId);
    }

    const countResult = await countQuery;
    if (countResult.error) {
      lastError = countResult.error;

      if (isMissingColumn(countResult.error, timestampColumn)) {
        if (timestampIndex < SCORING_TIMESTAMP_COLUMNS.length - 1) {
          timestampIndex += 1;
        } else {
          timestampIndex = SCORING_TIMESTAMP_COLUMNS.length;
        }
        continue;
      }

      if (isMissingColumn(countResult.error, actionColumn)) {
        if (actionIndex < SCORING_ACTION_COLUMNS.length - 1) {
          actionIndex += 1;
        } else {
          actionIndex = SCORING_ACTION_COLUMNS.length;
        }
        continue;
      }

      if (isMissingColumn(countResult.error, actorColumn)) {
        if (actorIndex < SCORING_ACTOR_COLUMNS.length - 1) {
          actorIndex += 1;
        } else {
          actorIndex = SCORING_ACTOR_COLUMNS.length;
        }
        continue;
      }

      return { data: [], error: countResult.error, count: null };
    }

    const total = countResult.count ?? 0;
    if (from >= total) return { data: [], error: null, count: total };

    dataQuery = dataQuery.range(from, to);

    const { data, error, count } = await dataQuery;
    if (!error) return { data: data ?? [], error: null, count: count ?? total };

    lastError = error;

    if (isRangeError(error)) return { data: [], error: null, count: total };

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

export async function listFinalizedWeeks({ from = 0, to = 49 }) {
  const countResult = await supabase
    .from("finalized_weeks")
    .select("*", { count: "exact", head: true });

  if (countResult.error) return { data: [], error: countResult.error, count: null };
  const total = countResult.count ?? 0;
  if (from >= total) return { data: [], error: null, count: total };

  const { data, error, count } = await supabase
    .from("finalized_weeks")
    .select("*", { count: "exact" })
    .order("start_date", { ascending: false })
    .range(from, to);

  if (error && isRangeError(error)) return { data: [], error: null, count: total };
  return { data: data ?? [], error, count: count ?? total };
}

export async function getProfilesByIds(userIds = []) {
  if (!Array.isArray(userIds) || userIds.length === 0) return [];
  const uniqueIds = Array.from(new Set(userIds.map(id => id?.toString?.() ?? "").filter(isUuid)));
  if (!uniqueIds.length) return [];
  const { data, error } = await supabase.rpc("get_user_emails_super_admin_json", {
  payload: { user_ids: uniqueIds },
});
  if (error) return [];
  return (data ?? []).map(row => ({
    id: row?.user_id ?? row?.id ?? null,
    email: row?.email ?? null,
  }));
}
