import { ensureSessionOrThrow, supabase } from "./supabase";

function todayIsoDate() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function normalizeFinalizationError(error) {
  if (!error) return new Error("Unknown error");
  const message = error.message?.toLowerCase?.() || "";
  if (message.includes("row-level security") || message.includes("permission denied")) {
    const err = new Error("Only Super Admins can finalize or reopen weeks.");
    err.code = "forbidden";
    err.cause = error;
    return err;
  }
  if (message.includes("week is finalized")) {
    const err = new Error("This week is already finalized. Reopen it before making changes.");
    err.code = "week_finalized";
    err.cause = error;
    return err;
  }
  return error;
}

function computeWeekRange(dateStr) {
  const ref = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(ref.getTime())) return { start: dateStr, end: dateStr };
  const day = ref.getUTCDay(); // Sunday = 0
  const diff = day === 0 ? 6 : day - 1; // move back to Monday

  const start = new Date(ref);
  start.setUTCDate(ref.getUTCDate() - diff);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);

  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

async function ensureWeek(dateStr) {
  await ensureSessionOrThrow(120);
  const targetDate = dateStr || todayIsoDate();
  const { error } = await supabase.rpc("ensure_week_row", { d: targetDate });
  if (error) throw normalizeFinalizationError(error);
  return targetDate;
}

async function getWeekKey(dateStr) {
  const targetDate = dateStr || todayIsoDate();
  const { data, error } = await supabase.rpc("week_key_for_date", { d: targetDate });
  if (error) throw normalizeFinalizationError(error);
  return data;
}

async function fetchWeekRow(weekKey, fallbackDate) {
  const { data, error } = await supabase
    .from("finalized_weeks")
    .select("*")
    .eq("week_key", weekKey)
    .maybeSingle();
  if (error) throw normalizeFinalizationError(error);
  if (data) return data;
  const range = computeWeekRange(fallbackDate || todayIsoDate());
  return {
    week_key: weekKey,
    start_date: range.start,
    end_date: range.end,
    status: "open",
  };
}

export async function getWeekStatusByDate(dateStr) {
  const targetDate = dateStr || todayIsoDate();
  const weekKey = await getWeekKey(targetDate);
  return fetchWeekRow(weekKey, targetDate);
}

export async function listRecentWeeks(limit = 10) {
  const safeLimit = Number(limit) || 10;
  const { data, error } = await supabase
    .from("finalized_weeks")
    .select("*")
    .order("start_date", { ascending: false })
    .limit(safeLimit);
  if (error) throw normalizeFinalizationError(error);
  return data ?? [];
}

export async function finalizeWeek(dateStr, reason) {
  await ensureSessionOrThrow(120);
  const trimmed = reason?.trim() || "";
  if (trimmed.length < 5) throw new Error("Reason must be at least 5 characters.");

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!userData?.user) throw new Error("User session not found");

  const targetDate = await ensureWeek(dateStr);
  const weekKey = await getWeekKey(targetDate);
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("finalized_weeks")
    .update({
      status: "finalized",
      finalized_at: now,
      finalized_by: userData.user.id,
      finalize_reason: trimmed,
      reopened_at: null,
      reopened_by: null,
      reopen_reason: null,
    })
    .eq("week_key", weekKey)
    .select("*")
    .single();

  if (error) throw normalizeFinalizationError(error);
  return data;
}

export async function reopenWeek(dateStr, reason) {
  await ensureSessionOrThrow(120);
  const trimmed = reason?.trim() || "";
  if (trimmed.length < 5) throw new Error("Reason must be at least 5 characters.");

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!userData?.user) throw new Error("User session not found");

  const targetDate = await ensureWeek(dateStr);
  const weekKey = await getWeekKey(targetDate);
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("finalized_weeks")
    .update({
      status: "open",
      reopened_at: now,
      reopened_by: userData.user.id,
      reopen_reason: trimmed,
    })
    .eq("week_key", weekKey)
    .select("*")
    .single();

  if (error) throw normalizeFinalizationError(error);
  return data;
}
