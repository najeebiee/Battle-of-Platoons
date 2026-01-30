import { ensureSessionOrThrow, supabase } from "./supabase";

/* ------------------------------ Agents ------------------------------ */

export async function listAgents() {
  const { data, error } = await supabase
    .from("agents")
    .select("id,name,photo_url,depot_id,company_id,platoon_id,role,upline_agent_id")
    .order("name", { ascending: true });

  if (error) throw error;
  return (data ?? []).map(normalizeAgent);
}

export async function getAgentById(id) {
  const { data, error } = await supabase.from("agents").select("*").eq("id", id).single();
  if (error) throw error;
  return normalizeAgent(data);
}

export async function upsertAgent(agent) {
  await ensureSessionOrThrow(120);
  // Accept either UI-friendly fields OR DB fields
  const payload = denormalizeAgent(agent);

  const { error } = await supabase.from("agents").upsert(payload, { onConflict: "id" });
  if (error) throw error;
}

export async function deleteAgent(id) {
  await ensureSessionOrThrow(120);
  const { error } = await supabase.from("agents").delete().eq("id", id);
  if (error) throw error;
}

/* ------------------------------ Lookups ------------------------------ */

export async function listDepots() {
  const { data, error } = await supabase.from("depots").select("*").order("name");
  if (error) throw error;
  return data ?? [];
}

export async function listCompanies() {
  const { data, error } = await supabase.from("companies").select("*").order("name");
  if (error) throw error;
  return data ?? [];
}

export async function listPlatoons() {
  const { data, error } = await supabase.from("platoons").select("*").order("name");
  if (error) throw error;
  return data ?? [];
}

// Optional: upsert lookup items (if you want an Admin UI for these)
export async function upsertDepot({ id, name, photoURL, photo_url }) {
  await ensureSessionOrThrow(120);
  const payload = { id, name, photoURL: photoURL ?? photo_url ?? null };
  const { error } = await supabase.from("depots").upsert(payload, { onConflict: "id" });
  if (error) throw error;
}

export async function upsertCompany({ id, name, photoURL, photo_url }) {
  await ensureSessionOrThrow(120);
  const payload = { id, name, photoURL: photoURL ?? photo_url ?? null };
  const { error } = await supabase.from("companies").upsert(payload, { onConflict: "id" });
  if (error) throw error;
}

export async function upsertPlatoon({ id, name, photoURL, photo_url }) {
  await ensureSessionOrThrow(120);
  const payload = { id, name, photoURL: photoURL ?? photo_url ?? null };
  const { error } = await supabase.from("platoons").upsert(payload, { onConflict: "id" });
  if (error) throw error;
}

/* ------------------------------ Mappers ------------------------------ */

function normalizeAgent(a) {
  // Your DB may have camelCase (from Firestore import) AND snake_case columns
  return {
    id: a.id,
    name: a.name ?? "",
    photoURL: a.photoURL ?? a.photo_url ?? "",

    depotId: a.depotId ?? a.depot_id ?? a.depot ?? "",
    companyId: a.companyId ?? a.company_id ?? a.company ?? "",
    platoonId: a.platoonId ?? a.platoon_id ?? a.platoon ?? "",
    role: a.role ?? "platoon",
    uplineAgentId: a.uplineAgentId ?? a.upline_agent_id ?? "",

    // keep any metadata if present
    createdAt: a.createdAt ?? null,
    updatedAt: a.updatedAt ?? null,
  };
}

function denormalizeAgent(agent) {
  return {
    id: agent.id,
    name: agent.name,
    photo_url: agent.photoURL ?? agent.photo_url ?? null,

    depot_id: agent.depotId ?? agent.depot_id ?? null,
    company_id: agent.companyId ?? agent.company_id ?? null,
    platoon_id: agent.platoonId ?? agent.platoon_id ?? null,
    role: agent.role ?? "platoon",
    upline_agent_id: agent.uplineAgentId ?? agent.upline_agent_id ?? null,

    // timestamps optional; you can also manage this in DB triggers later
    updatedAt: agent.updatedAt ?? null,
    createdAt: agent.createdAt ?? null,
  };
}
