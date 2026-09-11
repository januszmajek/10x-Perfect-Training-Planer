import { execFileSync } from "node:child_process";
import { encryptAiProviderKey } from "@/lib/ai-provider-key-crypto";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing local E2E environment: ${name}`);
  return value;
}

export async function configureAiProviderKey(email: string) {
  const databaseUrl = required("SUPABASE_DB_URL");
  const userId = execFileSync("psql", [databaseUrl, "-Atqc", `select id from auth.users where email = '${email}';`], {
    encoding: "utf8",
  }).trim();
  if (!userId) throw new Error("The E2E user was not available to configure an AI key.");

  const encrypted = await encryptAiProviderKey("e2e-local-provider-key", required("AI_KEY_ENCRYPTION_KEY_V1"), {
    userId,
    provider: "openrouter",
    encryptionKeyVersion: 1,
  });
  execFileSync(
    "psql",
    [
      databaseUrl,
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      `insert into public.ai_provider_keys (user_id, ciphertext, iv, encryption_key_version)
       values ('${userId}', '${encrypted.ciphertext}', '${encrypted.iv}', ${encrypted.encryptionKeyVersion})
       on conflict (user_id) do update set ciphertext = excluded.ciphertext, iv = excluded.iv,
       encryption_key_version = excluded.encryption_key_version;`,
    ],
    { stdio: "pipe" },
  );
}
