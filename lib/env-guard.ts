// Environment variables: parsing, validation and secret hygiene.
//
// The ONLY three variables this app uses:
//   NEXT_PUBLIC_SUPABASE_URL       public  — project URL
//   NEXT_PUBLIC_SUPABASE_ANON_KEY  public  — publishable key (sb_publishable_…) or legacy anon JWT
//   SUPABASE_SERVICE_ROLE_KEY      SECRET  — secret key (sb_secret_…) or legacy service_role JWT
//
// Anything named NEXT_PUBLIC_* is inlined into the JavaScript sent to every
// browser, so secrets must never use that prefix. This module has no imports
// so it can be used by next.config.ts, server modules, tests and scripts.

type Env = Record<string, string | undefined>;

export const ENV_NAMES = {
  url: "NEXT_PUBLIC_SUPABASE_URL",
  publicKey: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  serviceKey: "SUPABASE_SERVICE_ROLE_KEY",
} as const;

export type SupabaseKeyKind = "publishable" | "secret" | "legacy-anon" | "legacy-service-role" | "unknown";

function jwtRole(key: string): string | null {
  const parts = key.split(".");
  if (parts.length !== 3) return null;
  try {
    const json = Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const payload: unknown = JSON.parse(json);
    return typeof payload === "object" && payload !== null && "role" in payload
      ? String((payload as { role: unknown }).role)
      : null;
  } catch {
    return null;
  }
}

export function classifySupabaseKey(key: string): SupabaseKeyKind {
  const trimmed = key.trim();
  if (/^sb_publishable_[A-Za-z0-9_-]{8,}$/.test(trimmed)) return "publishable";
  if (/^sb_secret_[A-Za-z0-9_-]{8,}$/.test(trimmed)) return "secret";
  const role = jwtRole(trimmed);
  if (role === "anon") return "legacy-anon";
  if (role === "service_role") return "legacy-service-role";
  return "unknown";
}

/** True for Supabase keys that bypass RLS (legacy service_role JWT or sb_secret_ key). */
export function isPrivilegedSupabaseKey(key: string): boolean {
  const kind = classifySupabaseKey(key);
  return kind === "secret" || kind === "legacy-service-role" || key.trim().startsWith("sb_secret_");
}

/** Values copied unchanged from .env.example ("your_project_url", "<…>", …). */
export function isPlaceholder(value: string): boolean {
  return /^your[_-]|^<.*>$|^changeme$|^x+$/i.test(value.trim());
}

/** Returns a problem description, or null if the environment is safe. */
export function findPublicSecretProblem(env: Env): string | null {
  for (const [name, value] of Object.entries(env)) {
    if (!name.startsWith("NEXT_PUBLIC_") || !value) continue;
    if (/SERVICE_ROLE|SECRET/i.test(name)) {
      return `${name}: secret keys must never use the NEXT_PUBLIC_ prefix (it is sent to every browser). Use ${ENV_NAMES.serviceKey}.`;
    }
    if (isPrivilegedSupabaseKey(value)) {
      return `${name} contains a secret/service_role key. Public variables may only hold the publishable (or anon) key.`;
    }
  }
  return null;
}

export function assertNoPublicSecrets(env: Env = process.env): void {
  const problem = findPublicSecretProblem(env);
  if (problem) throw new Error(problem);
}

/** null if the URL is acceptable; HTTPS required except for a local Supabase (localhost). */
export function checkSupabaseUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return `${ENV_NAMES.url} is not a valid URL`;
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    return `${ENV_NAMES.url} must use https:// (keys would otherwise travel unencrypted)`;
  }
  if (url.username || url.password) return `${ENV_NAMES.url} must not contain credentials`;
  if (url.pathname !== "/" || url.search || url.hash) {
    return `${ENV_NAMES.url} must be the project URL only, e.g. https://<ref>.supabase.co`;
  }
  return null;
}

export type PublicSupabaseEnv =
  | { ok: true; url: string; key: string; keyKind: "publishable" | "legacy-anon" }
  | { ok: false; problem: string; missing: boolean };

export function readPublicSupabaseEnv(env: Env = process.env): PublicSupabaseEnv {
  const publicSecret = findPublicSecretProblem(env);
  if (publicSecret) return { ok: false, problem: publicSecret, missing: false };

  const url = env[ENV_NAMES.url]?.trim().replace(/\/+$/, "") ?? "";
  const key = env[ENV_NAMES.publicKey]?.trim() ?? "";
  if (!url || !key || isPlaceholder(url) || isPlaceholder(key)) {
    return {
      ok: false,
      missing: true,
      problem: `${ENV_NAMES.url} and ${ENV_NAMES.publicKey} are not set (copy .env.example to .env.local and fill them in)`,
    };
  }
  const urlProblem = checkSupabaseUrl(url);
  if (urlProblem) return { ok: false, problem: urlProblem, missing: false };

  const kind = classifySupabaseKey(key);
  if (kind !== "publishable" && kind !== "legacy-anon") {
    return {
      ok: false,
      missing: false,
      problem: `${ENV_NAMES.publicKey} must be a publishable key (sb_publishable_…) or the legacy anon key`,
    };
  }
  return { ok: true, url, key, keyKind: kind };
}

export type ServiceRoleEnv =
  | { ok: true; key: string; keyKind: "secret" | "legacy-service-role" }
  | { ok: false; problem: string; missing: boolean };

export function readServiceRoleEnv(env: Env = process.env): ServiceRoleEnv {
  const key = env[ENV_NAMES.serviceKey]?.trim() ?? "";
  if (!key || isPlaceholder(key)) {
    return { ok: false, missing: true, problem: `${ENV_NAMES.serviceKey} is not set; guest checkout is disabled` };
  }
  const kind = classifySupabaseKey(key);
  if (kind !== "secret" && kind !== "legacy-service-role") {
    return {
      ok: false,
      missing: false,
      problem: `${ENV_NAMES.serviceKey} is not a secret key (expected sb_secret_… or the legacy service_role key)`,
    };
  }
  if (key === env[ENV_NAMES.publicKey]?.trim()) {
    return { ok: false, missing: false, problem: `${ENV_NAMES.serviceKey} must differ from the public key` };
  }
  return { ok: true, key, keyKind: kind };
}

// ---------------------------------------------------------------------
// Log redaction: keys and tokens must never reach logs
// ---------------------------------------------------------------------
const TOKEN_PATTERNS = [
  /sb_(secret|publishable)_[A-Za-z0-9_-]+/g, // new Supabase keys
  /eyJ[A-Za-z0-9_-]{5,}\.eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]+/g, // any JWT (legacy keys, user access tokens)
  /(Bearer\s+)[A-Za-z0-9._~+/=-]{16,}/gi,
];

export function redactSecrets(text: string, env: Env = process.env): string {
  let out = text;
  for (const name of [ENV_NAMES.serviceKey, ENV_NAMES.publicKey]) {
    const value = env[name]?.trim();
    if (value && value.length >= 8) out = out.split(value).join("[REDACTED]");
  }
  for (const pattern of TOKEN_PATTERNS) {
    out = out.replace(pattern, (_match, bearer?: string) =>
      typeof bearer === "string" && /^Bearer/i.test(bearer) ? `${bearer}[REDACTED]` : "[REDACTED]",
    );
  }
  return out;
}
