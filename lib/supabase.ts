import "server-only"; // build fails if a client component imports this file
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readPublicSupabaseEnv } from "./env-guard";

/** Thrown when .env.local is missing, incomplete or unsafe. */
export class SupabaseConfigError extends Error {
  constructor(
    message = "Supabase is not configured. Copy .env.example to .env.local and fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
  ) {
    super(message);
    this.name = "SupabaseConfigError";
  }
}

/** URL + public (publishable/anon) key. Never returns a privileged key. */
export function readPublicConfig(): { url: string; key: string } {
  const env = readPublicSupabaseEnv(process.env);
  if (!env.ok) throw new SupabaseConfigError(env.problem);
  return { url: env.url, key: env.key };
}

export const serverClientOptions = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
} as const;

/**
 * Client acting as the anonymous visitor (role "anon").
 * RLS lets it read categories and available products only.
 */
export function createAnonClient(): SupabaseClient {
  const { url, key } = readPublicConfig();
  return createClient(url, key, serverClientOptions);
}

/**
 * Client acting as a signed-in customer (role "authenticated").
 * The access token comes from Supabase Auth; the database reads the
 * user id from it via auth.uid(), so the browser can't pick a user id.
 */
export function createUserClient(accessToken: string): SupabaseClient {
  const { url, key } = readPublicConfig();
  return createClient(url, key, {
    ...serverClientOptions,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
