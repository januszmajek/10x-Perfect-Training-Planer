import { AI_KEY_ENCRYPTION_KEY_V1 } from "astro:env/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  decryptAiProviderKey,
  encryptAiProviderKey,
  isValidAiProviderKeyRootSecret,
  type EncryptedAiProviderKey,
} from "@/lib/ai-provider-key-crypto";
import { validateAiProviderKey } from "@/lib/ai-provider-key-validation";
import type { Database } from "@/types/database.types";

const PROVIDER = "openrouter";
const CURRENT_ENCRYPTION_KEY_VERSION = 1;

type CredentialClient = SupabaseClient<Database>;
type AiProviderKeyFailureReason =
  | "invalid_input"
  | "unavailable_encryption"
  | "unauthenticated"
  | "persistence_failure"
  | "not_configured";
type AiProviderKeyResult<T> = { ok: true; data: T } | { ok: false; reason: AiProviderKeyFailureReason };

export interface MaskedAiProviderKey {
  provider: "openrouter";
  keyHint: string;
  updatedAt: string;
}

function getRootSecret(version: number): string | null {
  if (version !== CURRENT_ENCRYPTION_KEY_VERSION || !isValidAiProviderKeyRootSecret(AI_KEY_ENCRYPTION_KEY_V1)) {
    return null;
  }

  return AI_KEY_ENCRYPTION_KEY_V1 ?? null;
}

export function isAiProviderKeyEncryptionAvailable(): boolean {
  return getRootSecret(CURRENT_ENCRYPTION_KEY_VERSION) !== null;
}

export async function getMaskedAiProviderKey(
  supabase: CredentialClient,
  userId: string | null,
): Promise<AiProviderKeyResult<MaskedAiProviderKey | null>> {
  if (!userId) {
    return { ok: false, reason: "unauthenticated" };
  }

  const { data, error } = await supabase
    .from("ai_provider_keys")
    .select("provider,key_hint,updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return { ok: false, reason: "persistence_failure" };
  }

  if (!data) {
    return { ok: true, data: null };
  }

  return {
    ok: true,
    data: {
      provider: data.provider,
      keyHint: data.key_hint,
      updatedAt: data.updated_at,
    },
  };
}

export async function saveAiProviderKey(
  supabase: CredentialClient,
  userId: string | null,
  input: unknown,
): Promise<AiProviderKeyResult<undefined>> {
  if (!userId) {
    return { ok: false, reason: "unauthenticated" };
  }

  const validation = validateAiProviderKey(input);

  if (!validation.valid) {
    return { ok: false, reason: "invalid_input" };
  }

  const rootSecret = getRootSecret(CURRENT_ENCRYPTION_KEY_VERSION);

  if (!rootSecret) {
    return { ok: false, reason: "unavailable_encryption" };
  }

  let encrypted: EncryptedAiProviderKey;

  try {
    encrypted = await encryptAiProviderKey(validation.value, rootSecret, {
      userId,
      provider: PROVIDER,
      encryptionKeyVersion: CURRENT_ENCRYPTION_KEY_VERSION,
    });

    const verifiedPlaintext = await decryptAiProviderKey(encrypted, rootSecret, {
      userId,
      provider: PROVIDER,
      encryptionKeyVersion: CURRENT_ENCRYPTION_KEY_VERSION,
    });

    if (verifiedPlaintext !== validation.value) {
      return { ok: false, reason: "unavailable_encryption" };
    }
  } catch {
    return { ok: false, reason: "unavailable_encryption" };
  }

  const { error } = await supabase.from("ai_provider_keys").upsert(
    {
      user_id: userId,
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      key_hint: validation.value.slice(-4),
      encryption_key_version: encrypted.encryptionKeyVersion,
    },
    { onConflict: "user_id" },
  );

  if (error) {
    return { ok: false, reason: "persistence_failure" };
  }

  return { ok: true, data: undefined };
}

export async function removeAiProviderKey(
  supabase: CredentialClient,
  userId: string | null,
): Promise<AiProviderKeyResult<undefined>> {
  if (!userId) {
    return { ok: false, reason: "unauthenticated" };
  }

  const { error } = await supabase.from("ai_provider_keys").delete().eq("user_id", userId);

  if (error) {
    return { ok: false, reason: "persistence_failure" };
  }

  return { ok: true, data: undefined };
}

export async function decryptOwnedAiProviderKey(
  supabase: CredentialClient,
  userId: string | null,
): Promise<AiProviderKeyResult<string>> {
  if (!userId) {
    return { ok: false, reason: "unauthenticated" };
  }

  const { data, error } = await supabase
    .from("ai_provider_keys")
    .select("provider,ciphertext,iv,encryption_key_version")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return { ok: false, reason: "persistence_failure" };
  }

  if (!data) {
    return { ok: false, reason: "not_configured" };
  }

  const rootSecret = getRootSecret(data.encryption_key_version);

  if (!rootSecret) {
    return { ok: false, reason: "unavailable_encryption" };
  }

  try {
    const plaintextKey = await decryptAiProviderKey(
      {
        ciphertext: data.ciphertext,
        iv: data.iv,
        encryptionKeyVersion: data.encryption_key_version,
      },
      rootSecret,
      {
        userId,
        provider: data.provider,
        encryptionKeyVersion: data.encryption_key_version,
      },
    );

    return { ok: true, data: plaintextKey };
  } catch {
    return { ok: false, reason: "unavailable_encryption" };
  }
}
