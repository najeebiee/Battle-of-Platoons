import { ensureSessionOrThrow, supabase } from "./supabase";

function normalizeDepotName(name = "") {
  return name
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export async function listDepots() {
  const { data, error } = await supabase
    .from("depots")
    .select("id,name")
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function listDepotsDetailed() {
  const { data, error } = await supabase.from("depots").select("*").order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export function buildDepotMaps(depots = []) {
  const byId = new Map();
  const byNameNormalized = new Map();

  (depots ?? []).forEach(depot => {
    if (!depot) return;
    if (depot.id) byId.set(String(depot.id), depot);
    const normalized = normalizeDepotName(depot.name ?? "");
    if (!normalized) return;
    if (!byNameNormalized.has(normalized)) byNameNormalized.set(normalized, []);
    byNameNormalized.get(normalized).push(depot);
  });

  return { byId, byNameNormalized };
}

export function resolveDepotId(input, maps = {}) {
  const byId = maps.byId ?? new Map();
  const byNameNormalized = maps.byNameNormalized ?? new Map();
  const rawInput = input?.toString() ?? "";
  const trimmed = rawInput.trim();
  if (!trimmed) return { depot_id: null, error: null };
  if (byId.has(trimmed)) return { depot_id: trimmed, error: null };

  const normalized = normalizeDepotName(trimmed);
  const matches = byNameNormalized.get(normalized) ?? [];
  if (!matches.length) {
    return { depot_id: null, error: "Depot not found" };
  }
  if (matches.length > 1) {
    return { depot_id: null, error: "Depot name is not unique" };
  }
  return { depot_id: matches[0]?.id ?? null, error: null };
}

export async function upsertDepot(id, data) {
  await ensureSessionOrThrow(120);
  const payload = {
    id,
    name: data?.name ?? "",
    photoURL: (data?.photoURL ?? "").trim() || null,
  };

  const { error } = await supabase.from("depots").upsert(payload, { onConflict: "id" });
  if (error) throw error;
}
