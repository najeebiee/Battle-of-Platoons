import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

let supabaseConfigured = false;
let supabaseConfigError = "";
let supabaseClient = null;

if (!url || !anon) {
  const missingVars = [
    !url ? "VITE_SUPABASE_URL" : null,
    !anon ? "VITE_SUPABASE_ANON_KEY" : null,
  ].filter(Boolean);
  supabaseConfigError = `Missing ${missingVars.join(" and ")} in public-view environment.`;
} else {
  supabaseConfigured = true;
  supabaseClient = createClient(url, anon);
}

export const supabase = supabaseClient;
export { supabaseConfigured, supabaseConfigError };

export function getSupabaseProjectRef() {
  if (!url) return "missing";
  try {
    return new URL(url).hostname.split(".")[0] || "unknown";
  } catch (e) {
    return "invalid-url";
  }
}
