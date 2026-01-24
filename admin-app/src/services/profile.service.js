import { supabase } from "./supabase";

export async function getMyProfile() {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) throw new Error("No authenticated user found");

  const { data, error } = await supabase
    .from("profiles")
    .select("role,depot_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error && error.code !== "PGRST116") throw error;
  if (!data) {
    return { role: "admin", depot_id: null };
  }
  return data;
}
