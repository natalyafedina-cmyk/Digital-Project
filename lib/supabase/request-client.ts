import { createClient } from "@supabase/supabase-js";
// Reuse the current browser session's bearer token. No new auth/session mechanism.
export async function authenticatedRequestClient(request: Request) {
  const match = request.headers.get("authorization")?.match(/^Bearer (.+)$/i);
  if (!match) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Учебный контекст недоступен.");
  const client = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${match[1]}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.auth.getUser(match[1]);
  return !error && data.user ? client : null;
}
