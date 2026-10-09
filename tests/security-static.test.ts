// Static checks over the source tree. They fail the test run if anyone later
// uses the privileged key in the wrong place or leaks env into client code.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isPlaceholder } from "@/lib/env-guard";

const ROOT = path.resolve(__dirname, "..");
const SOURCE_DIRS = ["app", "components", "lib", "types"];

function walk(dir: string): string[] {
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full, { withFileTypes: true }).flatMap((entry) => {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(rel);
    return /\.(ts|tsx|mts|js|jsx)$/.test(entry.name) ? [rel.split(path.sep).join("/")] : [];
  });
}

const files = SOURCE_DIRS.flatMap(walk);
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), "utf8");
const isClient = (src: string) => /^\s*["']use client["']/m.test(src.split("\n").slice(0, 5).join("\n"));

describe("privileged key usage", () => {
  it("SUPABASE_SERVICE_ROLE_KEY is read only in lib/supabase-admin.ts (and the env parser)", () => {
    const parser = "lib/env-guard.ts"; // defines readServiceRoleEnv(); reads nothing by itself
    const users = files.filter((f) => f !== parser && /process\.env\.SUPABASE_SERVICE_ROLE_KEY|readServiceRoleEnv\(/.test(read(f)));
    expect(users).toEqual(["lib/supabase-admin.ts"]);
  });

  it("every module that creates a Supabase client is server-only", () => {
    const clientMakers = files.filter((f) => /from "@supabase\/supabase-js"/.test(read(f)) && /createClient\(/.test(read(f)));
    expect(clientMakers.length).toBeGreaterThan(0);
    for (const file of clientMakers) expect(read(file), file).toMatch(/^import "server-only";/m);
  });

  it("no client component imports a server-side data module", () => {
    const serverModules = /from "@\/lib\/(supabase|supabase-admin|catalog|orders|api)"/;
    const offenders = files.filter((f) => isClient(read(f)) && serverModules.test(read(f)));
    expect(offenders).toEqual([]);
  });

  it("no client component reads process.env", () => {
    const offenders = files.filter((f) => isClient(read(f)) && /process\.env/.test(read(f)));
    expect(offenders).toEqual([]);
  });

  it("no NEXT_PUBLIC_ variable name refers to a secret anywhere in the source", () => {
    const offenders = [...files, "next.config.ts", ".env.example"].filter((f) =>
      /NEXT_PUBLIC_[A-Z_]*(SERVICE|SECRET)/.test(read(f)),
    );
    expect(offenders).toEqual([]);
  });
});

describe("env files", () => {
  it(".env.example lists exactly the three variables, with placeholder values only", () => {
    const entries = read(".env.example")
      .split(/\r?\n/)
      .filter((line) => line.trim() && !line.trim().startsWith("#"))
      .map((line) => line.split("=", 2));
    expect(entries.map(([name]) => name)).toEqual([
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
    ]);
    for (const [name, value] of entries) expect(isPlaceholder(value ?? ""), `${name} must be a placeholder`).toBe(true);
  });

  it(".gitignore ignores .env.local (and every .env* except .env.example)", () => {
    const lines = read(".gitignore").split(/\r?\n/).map((l) => l.trim());
    expect(lines).toContain(".env*");
    expect(lines).toContain("!.env.example");
    expect(lines.filter((l) => l.startsWith("!") && l.includes(".env") && l !== "!.env.example")).toEqual([]);
  });
});
