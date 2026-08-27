export const AI_PROVIDER_KEY_MIN_LENGTH = 16;
export const AI_PROVIDER_KEY_MAX_LENGTH = 512;

const PRINTABLE_ASCII_WITHOUT_WHITESPACE = /^[!-~]+$/u;

export type AiProviderKeyValidationResult =
  | { valid: true; value: string }
  | { valid: false; reason: "invalid_type" | "invalid_length" | "invalid_characters" };

export function validateAiProviderKey(input: unknown): AiProviderKeyValidationResult {
  if (typeof input !== "string") {
    return { valid: false, reason: "invalid_type" };
  }

  const value = input.trim();

  if (value.length < AI_PROVIDER_KEY_MIN_LENGTH || value.length > AI_PROVIDER_KEY_MAX_LENGTH) {
    return { valid: false, reason: "invalid_length" };
  }

  if (!PRINTABLE_ASCII_WITHOUT_WHITESPACE.test(value)) {
    return { valid: false, reason: "invalid_characters" };
  }

  return { valid: true, value };
}
