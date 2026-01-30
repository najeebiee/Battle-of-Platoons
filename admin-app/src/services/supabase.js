import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  "https://tkqkamywlsjdkpfeljrg.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRrcWthbXl3bHNqZGtwZmVsanJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4MjU5ODEsImV4cCI6MjA4MTQwMTk4MX0.1Qiq6RlwA6FJ7VkcIh9cuFKlye-WxvD1hju1eCcnxsk",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

export async function ensureSession(minValiditySeconds = 60) {
  const { data, error } = await supabase.auth.getSession();
  if (error) return { ok: false, error };
  const session = data?.session;
  if (!session) return { ok: false, error: new Error("No active session") };

  const expiresAtMs = (session.expires_at ?? 0) * 1000;
  const remainingMs = expiresAtMs - Date.now();
  if (remainingMs > minValiditySeconds * 1000) {
    return { ok: true, session };
  }

  const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError || !refreshed?.session) {
    return { ok: false, error: refreshError || new Error("Session refresh failed") };
  }
  return { ok: true, session: refreshed.session };
}

export async function ensureSessionOrThrow(minValiditySeconds = 60) {
  const result = await ensureSession(minValiditySeconds);
  if (!result.ok) throw result.error || new Error("Session unavailable");
  return result.session;
}
