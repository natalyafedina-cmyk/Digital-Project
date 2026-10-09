import { createClient as createSupabaseClient } from "@supabase/supabase-js";

let recoveryClient: ReturnType<typeof createSupabaseClient> | null = null;

export function createRecoveryClient() {
  if (recoveryClient) return recoveryClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase env variables are missing.");
  }

  recoveryClient = createSupabaseClient(url, key, {
    auth: {
      flowType: "implicit",
      detectSessionInUrl: false,
      persistSession: true,
      autoRefreshToken: true,
      storageKey: "lunik-password-recovery",
    },
  });

  return recoveryClient;
}
