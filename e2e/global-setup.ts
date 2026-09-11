import type { FullConfig } from "@playwright/test";

const required = [
  "SUPABASE_URL",
  "SUPABASE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_DB_URL",
  "AI_KEY_ENCRYPTION_KEY_V1",
  "OPENROUTER_MODEL",
  "AI_CONFIRMATION_SIGNING_SECRET",
] as const;

export default function globalSetup(_config: FullConfig) {
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length > 0) throw new Error(`Missing local E2E environment: ${missing.join(", ")}`);
}
