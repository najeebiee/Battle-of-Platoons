import { supabase } from "./supabase";

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
  const { data, error } = await supabase.rpc("create_scoring_formula_draft", payload);
  return { data, error };
}

export async function updateDraft(payload) {
  const { data, error } = await supabase.rpc("update_scoring_formula_draft", payload);
  return { data, error };
}

export async function publishDraft(formula_id, reason) {
  const { data, error } = await supabase.rpc("publish_scoring_formula_draft", {
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
