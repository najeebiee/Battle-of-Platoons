import { ensureSessionOrThrow, supabase } from "./supabase";

export async function listCompanies() {
  const { data, error } = await supabase.from("companies").select("*").order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function upsertCompany(id, data) {
  await ensureSessionOrThrow(120);
  const payload = {
    id,
    name: data?.name ?? "",
    photoURL: (data?.photoURL ?? "").trim() || null,
  };

  const { error } = await supabase.from("companies").upsert(payload, { onConflict: "id" });
  if (error) throw error;
}
