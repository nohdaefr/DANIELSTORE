import { describe, expect, it } from "vitest";
import {
  checkSupabaseUrl,
  classifySupabaseKey,
  findPublicSecretProblem,
  isPlaceholder,
  isPrivilegedSupabaseKey,
  readPublicSupabaseEnv,
  readServiceRoleEnv,
  redactSecrets,
} from "@/lib/env-guard";

function fakeJwt(payload: object): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode(payload)}.c2lnbmF0dXJlLXBhcnQ`;
}

// Obviously fake test values (not real credentials)
const PUBLISHABLE = "sb_publishable_TESTONLY0000000000000000";
const SECRET = "sb_secret_TESTONLY000000000000000000000";
const ANON_JWT = fakeJwt({ role: "anon", iss: "test" });
const SERVICE_JWT = fakeJwt({ role: "service_role", iss: "test" });
const URL_OK = "https://abcdefghijklmnop.supabase.co";

describe("key classification", () => {
  it.each([
    [PUBLISHABLE, "publishable"],
    [SECRET, "secret"],
    [ANON_JWT, "legacy-anon"],
    [SERVICE_JWT, "legacy-service-role"],
    ["your_public_key", "unknown"],
    ["not.a.jwt", "unknown"],
  ])("%s -> %s", (key, kind) => {
    expect(classifySupabaseKey(key)).toBe(kind);
  });

  it("recognizes privileged keys", () => {
    expect(isPrivilegedSupabaseKey(SECRET)).toBe(true);
    expect(isPrivilegedSupabaseKey(SERVICE_JWT)).toBe(true);
    expect(isPrivilegedSupabaseKey(PUBLISHABLE)).toBe(false);
    expect(isPrivilegedSupabaseKey(ANON_JWT)).toBe(false);
  });

  it("detects .env.example placeholders", () => {
    for (const v of ["your_project_url", "your_public_key", "your_secret_key", "<paste here>"]) expect(isPlaceholder(v)).toBe(true);
    expect(isPlaceholder(URL_OK)).toBe(false);
    expect(isPlaceholder(PUBLISHABLE)).toBe(false);
  });
});

describe("secret keys never in NEXT_PUBLIC_ variables", () => {
  it("accepts the normal setup", () => {
    expect(
      findPublicSecretProblem({
        NEXT_PUBLIC_SUPABASE_URL: URL_OK,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: PUBLISHABLE,
        SUPABASE_SERVICE_ROLE_KEY: SECRET, // fine: not public
      }),
    ).toBeNull();
  });

  it("rejects a NEXT_PUBLIC_ variable named like a service/secret key", () => {
    expect(findPublicSecretProblem({ NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY: "x" })).toMatch(/NEXT_PUBLIC_/);
    expect(findPublicSecretProblem({ NEXT_PUBLIC_SECRET: "x" })).not.toBeNull();
  });

  it.each([SERVICE_JWT, SECRET, "sb_secret_short"])("rejects a secret value (%s) in the public key variable", (value) => {
    expect(findPublicSecretProblem({ NEXT_PUBLIC_SUPABASE_ANON_KEY: value })).not.toBeNull();
  });
});

describe("reading the public config", () => {
  it("accepts a publishable key (preferred) and a legacy anon key", () => {
    expect(readPublicSupabaseEnv({ NEXT_PUBLIC_SUPABASE_URL: URL_OK, NEXT_PUBLIC_SUPABASE_ANON_KEY: PUBLISHABLE })).toMatchObject({ ok: true, keyKind: "publishable" });
    expect(readPublicSupabaseEnv({ NEXT_PUBLIC_SUPABASE_URL: URL_OK, NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_JWT })).toMatchObject({ ok: true, keyKind: "legacy-anon" });
  });

  it("treats missing values and untouched placeholders as 'not configured'", () => {
    expect(readPublicSupabaseEnv({})).toMatchObject({ ok: false, missing: true });
    expect(readPublicSupabaseEnv({ NEXT_PUBLIC_SUPABASE_URL: "your_project_url", NEXT_PUBLIC_SUPABASE_ANON_KEY: "your_public_key" })).toMatchObject({ ok: false, missing: true });
  });

  it("refuses a secret key in the public variable", () => {
    const result = readPublicSupabaseEnv({ NEXT_PUBLIC_SUPABASE_URL: URL_OK, NEXT_PUBLIC_SUPABASE_ANON_KEY: SECRET });
    expect(result.ok).toBe(false);
  });

  it.each([
    ["http (unencrypted)", "http://abc.supabase.co"],
    ["credentials in URL", "https://user:pass@abc.supabase.co"],
    ["path", "https://abc.supabase.co/rest/v1"],
    ["not a URL", "abc.supabase.co"],
  ])("rejects a bad URL: %s", (_label, url) => {
    expect(checkSupabaseUrl(url)).not.toBeNull();
  });

  it("allows http only for a local Supabase", () => {
    expect(checkSupabaseUrl("http://127.0.0.1:54321")).toBeNull();
    expect(checkSupabaseUrl("http://localhost:54321")).toBeNull();
  });
});

describe("reading the service key", () => {
  it("accepts a secret key or legacy service_role key", () => {
    expect(readServiceRoleEnv({ SUPABASE_SERVICE_ROLE_KEY: SECRET })).toMatchObject({ ok: true, keyKind: "secret" });
    expect(readServiceRoleEnv({ SUPABASE_SERVICE_ROLE_KEY: SERVICE_JWT })).toMatchObject({ ok: true, keyKind: "legacy-service-role" });
  });

  it("missing or placeholder -> guest checkout disabled", () => {
    expect(readServiceRoleEnv({})).toMatchObject({ ok: false, missing: true });
    expect(readServiceRoleEnv({ SUPABASE_SERVICE_ROLE_KEY: "your_secret_key" })).toMatchObject({ ok: false, missing: true });
  });

  it("rejects a public key pasted into the secret variable", () => {
    expect(readServiceRoleEnv({ SUPABASE_SERVICE_ROLE_KEY: PUBLISHABLE })).toMatchObject({ ok: false, missing: false });
    expect(readServiceRoleEnv({ SUPABASE_SERVICE_ROLE_KEY: ANON_JWT })).toMatchObject({ ok: false, missing: false });
  });
});

describe("log redaction", () => {
  const env = { SUPABASE_SERVICE_ROLE_KEY: "custom-format-secret-value-123", NEXT_PUBLIC_SUPABASE_ANON_KEY: PUBLISHABLE };

  it("removes the configured key values", () => {
    const out = redactSecrets("failed with key custom-format-secret-value-123 and " + PUBLISHABLE, env);
    expect(out).not.toContain("custom-format-secret-value-123");
    expect(out).not.toContain(PUBLISHABLE);
  });

  it("removes any Supabase key, JWT or bearer token", () => {
    const text = `apikey=${SECRET} token=${SERVICE_JWT} header="Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456"`;
    const out = redactSecrets(text, {});
    expect(out).not.toContain(SECRET);
    expect(out).not.toContain(SERVICE_JWT);
    expect(out).not.toContain("abcdefghijklmnopqrstuvwxyz123456");
    expect(out).toContain("Bearer [REDACTED]");
  });

  it("leaves normal text alone", () => {
    expect(redactSecrets("PRODUCT_NOT_FOUND product 42", env)).toBe("PRODUCT_NOT_FOUND product 42");
  });
});
