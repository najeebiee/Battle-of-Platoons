import { ensureSessionOrThrow, supabase } from "./supabase";

export async function listPublishedFormulas() {
  const { data, error } = await supabase
    .from("scoring_formulas")
    .select("*")
    .eq("status", "published");

  return { data, error };
}

export async function listAllFormulasForSuperAdmin() {
  const { data, error } = await supabase.from("scoring_formulas").select("*");
  return { data, error };
}

export async function createDraft(payload) {
  await ensureSessionOrThrow(120);
  const { data, error } = await supabase.rpc("create_draft_scoring_formula", payload);
  return { data, error };
}

export async function updateDraft(payload) {
  await ensureSessionOrThrow(120);
  const { data, error } = await supabase.rpc("update_draft_scoring_formula", payload);
  return { data, error };
}

export async function publishDraft(formula_id, reason) {
  await ensureSessionOrThrow(120);
  const { data, error } = await supabase.rpc("publish_scoring_formula", {
    formula_id,
    reason,
  });

  return { data, error };
}

export async function listAudit(formula_id) {
  const { data, error } = await supabase
    .from("scoring_formula_audit")
    .select("*")
    .eq("formula_id", formula_id);

  return { data, error };
}
