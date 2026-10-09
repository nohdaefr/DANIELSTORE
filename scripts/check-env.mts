// npm run check:env
//
// Checks the Supabase configuration WITHOUT ever printing a key:
//   1. .env.local exists, is git-ignored, is not tracked and was never committed
//   2. each variable has the right format and kind of key
//   3. live: the public key can read the catalog but NOT orders, and cannot call create_order
//   4. live: the secret key works (read-only check), server-side
//   5. if a production build exists: no key value appears in browser files
//
// Requires Node 22.18+ (runs TypeScript directly). Use --offline to skip network checks.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import {
  ENV_NAMES,
  findPublicSecretProblem,
  readPublicSupabaseEnv,
  readServiceRoleEnv,
  redactSecrets,
} from "../lib/env-guard.ts";

const root = process.cwd();
const offline = process.argv.includes("--offline");
let failures = 0;
let warnings = 0;

const pass = (msg: string) => console.log(`  PASS  ${msg}`);
const warn = (msg: string) => (warnings++, console.log(`  WARN  ${msg}`));
const fail = (msg: string) => (failures++, console.log(`  FAIL  ${msg}`));
const info = (msg: string) => console.log(`        ${msg}`);
const safe = (text: unknown) => redactSecrets(String(text));

function git(args: string[]): { ok: boolean; out: string } {
  try {
    return { ok: true, out: execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() };
  } catch {
    return { ok: false, out: "" };
  }
}

// ------------------------------------------------------------------ 1. files
console.log("\n1. Environment files");
const envLocal = path.join(root, ".env.local");
if (fs.existsSync(envLocal)) pass(".env.local exists");
else fail(".env.local not found — copy .env.example to .env.local and fill in your values");

if (git(["rev-parse", "--is-inside-work-tree"]).ok) {
  if (git(["check-ignore", "-q", ".env.local"]).ok) pass(".env.local is ignored by Git");
  else fail(".env.local is NOT ignored by Git — add `.env*` to .gitignore");

  if (git(["ls-files", "--error-unmatch", ".env.local"]).ok) fail(".env.local is tracked by Git — run: git rm --cached .env.local, then rotate every key in it");
  else pass(".env.local is not tracked");

  const history = git(["log", "--all", "--format=%h", "--", ".env.local", ".env", ".env.production", ".env.development"]);
  if (history.out) fail(`an .env file appears in Git history (commits ${history.out.split("\n").join(", ")}) — treat those keys as leaked and rotate them`);
  else pass("no .env file was ever committed");
} else {
  warn("not a Git repository — skipped Git checks");
}

// ------------------------------------------------------------------ 2. values
console.log("\n2. Variables (values are never printed)");
const { loadedEnvFiles } = nextEnv.loadEnvConfig(root, true, { info: () => {}, error: () => {} });
info(`loaded: ${loadedEnvFiles.map((f) => f.path).join(", ") || "(none)"}`);
const env = process.env as Record<string, string | undefined>;

const publicSecret = findPublicSecretProblem(env);
if (publicSecret) fail(publicSecret);
else pass("no secret in any NEXT_PUBLIC_ variable");

const pub = readPublicSupabaseEnv(env);
if (pub.ok) {
  pass(`${ENV_NAMES.url} = ${new URL(pub.url).host}`);
  pass(`${ENV_NAMES.publicKey}: ${pub.keyKind} key (${pub.key.length} chars)`);
  if (pub.keyKind === "legacy-anon") warn("legacy anon key in use — prefer a publishable key (sb_publishable_…); legacy keys are being retired");
} else if (pub.problem !== publicSecret) {
  fail(pub.problem);
}

const svc = readServiceRoleEnv(env);
if (svc.ok) {
  pass(`${ENV_NAMES.serviceKey}: ${svc.keyKind} key (${svc.key.length} chars), server-only`);
  if (svc.keyKind === "legacy-service-role") warn("legacy service_role key in use — prefer a secret key (sb_secret_…)");
} else if (svc.missing) {
  warn(`${svc.problem} (the store and signed-in orders still work)`);
} else {
  fail(svc.problem);
}

const unexpected = Object.keys(env).filter((k) => k.startsWith("NEXT_PUBLIC_") && !Object.values(ENV_NAMES).includes(k as never));
if (unexpected.length) warn(`other NEXT_PUBLIC_ variables are set (${unexpected.join(", ")}) — make sure none hold secrets`);

// ------------------------------------------------------------------ 3/4. live checks
async function live() {
  if (!pub.ok) return info("skipped: public configuration is not valid");
  const opts = { auth: { persistSession: false, autoRefreshToken: false } };

  console.log("\n3. Connection with the PUBLIC key (what visitors can do)");
  const anon = createClient(pub.url, pub.key, opts);

  const categories = await anon.from("categories").select("id", { count: "exact", head: true });
  if (categories.error) fail(`cannot read categories: ${safe(categories.error.message)} (did you run supabase/schema.sql?)`);
  else pass(`connected; catalog readable (${categories.count ?? 0} categories)`);

  const products = await anon.from("products").select("id", { count: "exact", head: true });
  if (products.error) fail(`cannot read products: ${safe(products.error.message)}`);
  else pass(`${products.count ?? 0} available products visible`);

  const orders = await anon.from("orders").select("id").limit(1);
  if (orders.error && (orders.error.code === "42501" || /permission denied/i.test(orders.error.message))) {
    pass("orders are NOT readable with the public key (permission denied)");
  } else if (orders.error) {
    warn(`unexpected answer reading orders: ${safe(orders.error.code)} ${safe(orders.error.message)}`);
  } else {
    fail("orders ARE readable with the public key — re-run supabase/schema.sql (revoke/RLS section)");
  }

  const rpc = await anon.rpc("create_order", { p_customer: {}, p_items: [], p_idempotency_key: null });
  if (rpc.error?.code === "42501" || /permission denied/i.test(rpc.error?.message ?? "")) {
    pass("create_order cannot be called with the public key");
  } else if (rpc.error?.code === "PGRST202") {
    fail("create_order not found — run supabase/migrations/002_order_processing.sql");
  } else {
    fail(`create_order answered the public key unexpectedly (${safe(rpc.error?.code ?? "no error")}) — check its GRANTs`);
  }

  console.log("\n4. Secret key (server-side only)");
  if (!svc.ok) return info("skipped: secret key not configured");
  const admin = createClient(pub.url, svc.key, opts);
  const adminOrders = await admin.from("orders").select("id", { count: "exact", head: true }); // read-only
  if (adminOrders.error) fail(`secret key rejected: ${safe(adminOrders.error.message)}`);
  else pass(`secret key valid (server can see all ${adminOrders.count ?? 0} orders — this is why it must stay secret)`);
}

// ------------------------------------------------------------------ 5. bundle scan
function scanBuild() {
  console.log("\n5. Browser files of the last build");
  const dir = path.join(root, ".next", "static");
  if (!fs.existsSync(dir)) return info("no build found (.next/static) — run `npm run build`, then this check again");
  const secrets = svc.ok ? [svc.key] : [];
  let scanned = 0;
  const hits: string[] = [];
  const walk = (d: string) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else {
        scanned++;
        const text = fs.readFileSync(full, "utf8");
        if (secrets.some((s) => text.includes(s)) || /sb_secret_[A-Za-z0-9]/.test(text) || text.includes(ENV_NAMES.serviceKey)) {
          hits.push(path.relative(root, full));
        }
      }
    }
  };
  walk(dir);
  if (hits.length) fail(`secret material found in browser files: ${hits.slice(0, 3).join(", ")} — rotate the key and fix the code`);
  else pass(`secret key not present in any of ${scanned} browser files`);
}

if (offline) info("\n(--offline: skipping live Supabase checks)");
else
  await live().catch((error: unknown) => {
    fail(`could not reach Supabase: ${safe(error instanceof Error ? error.message : error)}`);
  });
scanBuild();

console.log(`\n${failures === 0 ? "OK" : "PROBLEMS FOUND"}: ${failures} failed, ${warnings} warnings\n`);
process.exit(failures === 0 ? 0 : 1);
