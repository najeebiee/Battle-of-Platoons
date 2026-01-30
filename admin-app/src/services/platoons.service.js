import { ensureSessionOrThrow, supabase } from "./supabase";

export async function listPlatoons() {
  const { data, error } = await supabase.from("platoons").select("*").order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function upsertPlatoon(id, data) {
  await ensureSessionOrThrow(120);
  const payload = {
    id,
    name: data?.name ?? "",
    photoURL: (data?.photoURL ?? "").trim() || null,
  };

  const { error } = await supabase.from("platoons").upsert(payload, { onConflict: "id" });
  if (error) throw error;
}
