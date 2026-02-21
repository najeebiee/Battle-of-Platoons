import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { ensureSession, supabase } from "../services/supabase";
 
const Ctx = createContext(null);

async function validateUserAccess() {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) throw new Error("No authenticated user found");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role,agent_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profileError && profileError.code !== "PGRST116") throw profileError;
  if (!profile) throw new Error("No profile configured for this account.");

  if (profile.role === "user") {
    if (!profile.agent_id) {
      throw new Error("Your account is not linked to a participant leader yet. Contact admin.");
    }
    const { data: agent, error: agentError } = await supabase
      .from("agents")
      .select("id")
      .eq("id", profile.agent_id)
      .maybeSingle();
    if (agentError && agentError.code !== "PGRST116") throw agentError;
    if (!agent) {
      throw new Error("Your account is not linked to a participant leader yet. Contact admin.");
    }
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  const [sessionError, setSessionError] = useState("");
  const lastUserRef = useRef(null);

  useEffect(() => {
    if (user) lastUserRef.current = user;
  }, [user]);

  useEffect(() => {
    let mounted = true;
    ensureSession(120)
      .then(result => {
        if (!mounted) return;
        if (!result.ok && result.error?.message !== "No active session") {
          setSessionError("Session refresh failed. Please sign in again.");
        }
      })
      .catch(() => {});

    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      if (error) console.error(error);
      setUser(data?.session?.user ?? null);
      setBooting(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "TOKEN_REFRESH_FAILED") {
        setSessionError("Session refresh failed or was rate-limited. Please sign in again.");
        setBooting(false);
        return;
      }

      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        setSessionError("");
      }

      if (event === "SIGNED_OUT") {
        setUser(null);
      } else {
        setUser(session?.user ?? lastUserRef.current);
      }
      setBooting(false);
    });

    return () => {
      mounted = false;
      listener?.subscription?.unsubscribe();
    };
  }, []);

  async function resolveLoginEmail(identifier) {
    const input = String(identifier || "").trim();
    if (!input) throw new Error("Username is required.");

    if (input.includes("@")) return input;

    // Prefer deterministic Agent-ID mapping so login works before auth/RLS.
    const normalizedAgentId = input.toLowerCase();
    const deterministicEmail = `${normalizedAgentId}@leaders.local`;

    // Optional fallback: if public profile lookup is allowed and has explicit login_email, use it.
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("login_email")
      .eq("agent_id", input)
      .maybeSingle();

    if (profileError && profileError.code !== "PGRST116") {
      return deterministicEmail;
    }

    const configuredEmail = String(profile?.login_email ?? "").trim();
    return configuredEmail || deterministicEmail;
  }

  async function login(identifier, password) {
    setSessionError("");
    const email = await resolveLoginEmail(identifier);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    try {
      await validateUserAccess();
    } catch (accessError) {
      await supabase.auth.signOut();
      throw accessError;
    }
  }

  async function logout() {
    setSessionError("");
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }

  const value = {
    user,
    booting,
    sessionError,
    clearSessionError: () => setSessionError(""),
    login,
    logout,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(Ctx);
}
