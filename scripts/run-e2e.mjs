import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function readLocalSupabaseEnv() {
  const result = spawnSync("pnpm", ["exec", "supabase", "status", "-o", "env"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  if (result.status !== 0) fail("Local Supabase must be running before pnpm test:e2e.");

  /** @type {Record<string, string>} */
  const values = {};
  for (const line of result.stdout.split("\n")) {
    const match = /^([A-Z_]+)=(?:"([^"]*)"|(.*))$/u.exec(line);
    if (match) values[match[1]] = match[2] || match[3] || "";
  }
  if (!values.API_URL || !values.ANON_KEY || !(values.SECRET_KEY || values.SERVICE_ROLE_KEY)) {
    fail("Local Supabase status did not provide API_URL, ANON_KEY, and an admin key.");
  }
  return values;
}

const args = process.argv.slice(2).filter((argument) => argument !== "--");
const local = args.includes("--list") ? null : readLocalSupabaseEnv();
const env = local
  ? {
      ...process.env,
      SUPABASE_URL: local.API_URL,
      SUPABASE_KEY: local.ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: Object.hasOwn(local, "SECRET_KEY") ? local.SECRET_KEY : local.SERVICE_ROLE_KEY,
      SUPABASE_DB_URL: local.DB_URL,
      OPENROUTER_MODEL: "e2e-test-model",
      AI_CONFIRMATION_SIGNING_SECRET: randomBytes(32).toString("hex"),
      AI_KEY_ENCRYPTION_KEY_V1: randomBytes(32).toString("base64url"),
    }
  : process.env;

const result = spawnSync("pnpm", ["exec", "playwright", "test", ...args], {
  cwd: process.cwd(),
  env,
  stdio: "inherit",
});
process.exit(result.status ?? 1);
