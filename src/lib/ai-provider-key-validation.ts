export const AI_PROVIDER_KEY_MAX_LENGTH = 512;

export type AiProviderKeyValidationResult =
  | { valid: true; value: string }
  | { valid: false; reason: "invalid_type" | "invalid_length" };

export function validateAiProviderKey(input: unknown): AiProviderKeyValidationResult {
  if (typeof input !== "string") {
    return { valid: false, reason: "invalid_type" };
  }

  if (input.length === 0 || input.length > AI_PROVIDER_KEY_MAX_LENGTH) {
    return { valid: false, reason: "invalid_length" };
  }

  return { valid: true, value: input };
}
