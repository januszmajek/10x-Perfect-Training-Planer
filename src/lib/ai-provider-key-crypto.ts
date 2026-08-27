const ROOT_SECRET_BYTE_LENGTH = 32;
const IV_BYTE_LENGTH = 12;
const ENCRYPTION_KEY_VERSION = 1;
const SUPPORTED_PROVIDER = "openrouter";
const HKDF_SALT = "perfect-training-planner/ai-provider-key/v1";
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/u;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const CRYPTO_ERROR_MESSAGE = "AI provider key cryptographic operation failed";

const textEncoder = new TextEncoder();

export type AiProvider = "openrouter";

export interface AiProviderKeyCryptoContext {
  userId: string;
  provider: string;
  encryptionKeyVersion: number;
}

export interface EncryptedAiProviderKey {
  ciphertext: string;
  iv: string;
  encryptionKeyVersion: number;
}

export class AiProviderKeyCryptoError extends Error {
  constructor() {
    super(CRYPTO_ERROR_MESSAGE);
    this.name = "AiProviderKeyCryptoError";
  }
}

function toCryptoError(): AiProviderKeyCryptoError {
  return new AiProviderKeyCryptoError();
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function decodeBase64Url(value: string): Uint8Array {
  if (!value || !BASE64URL_PATTERN.test(value) || value.length % 4 === 1) {
    throw toCryptoError();
  }

  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);

  let binary: string;

  try {
    binary = atob(`${base64}${padding}`);
  } catch {
    throw toCryptoError();
  }

  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));

  if (encodeBase64Url(bytes) !== value) {
    throw toCryptoError();
  }

  return bytes;
}

function decodeRootSecret(rootSecret: string): Uint8Array {
  const decoded = decodeBase64Url(rootSecret);

  if (decoded.byteLength !== ROOT_SECRET_BYTE_LENGTH) {
    throw toCryptoError();
  }

  return decoded;
}

function normalizeContext(context: AiProviderKeyCryptoContext) {
  if (
    context.provider !== SUPPORTED_PROVIDER ||
    context.encryptionKeyVersion !== ENCRYPTION_KEY_VERSION ||
    !UUID_PATTERN.test(context.userId)
  ) {
    throw toCryptoError();
  }

  const userId = context.userId.toLowerCase();

  return {
    userId,
    provider: SUPPORTED_PROVIDER,
    encryptionKeyVersion: ENCRYPTION_KEY_VERSION,
    hkdfInfo: `user=${userId}\nprovider=${SUPPORTED_PROVIDER}`,
    additionalData: `version=${ENCRYPTION_KEY_VERSION}\nuser=${userId}\nprovider=${SUPPORTED_PROVIDER}`,
  } as const;
}

async function deriveEncryptionKey(rootSecret: string, hkdfInfo: string): Promise<CryptoKey> {
  const inputKeyMaterial = await crypto.subtle.importKey("raw", decodeRootSecret(rootSecret), "HKDF", false, [
    "deriveKey",
  ]);

  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: textEncoder.encode(HKDF_SALT),
      info: textEncoder.encode(hkdfInfo),
    },
    inputKeyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export function isValidAiProviderKeyRootSecret(rootSecret: string | undefined): boolean {
  if (!rootSecret) {
    return false;
  }

  try {
    decodeRootSecret(rootSecret);
    return true;
  } catch {
    return false;
  }
}

export async function encryptAiProviderKey(
  plaintextKey: string,
  rootSecret: string,
  context: AiProviderKeyCryptoContext,
): Promise<EncryptedAiProviderKey> {
  try {
    const normalizedContext = normalizeContext(context);
    const encryptionKey = await deriveEncryptionKey(rootSecret, normalizedContext.hkdfInfo);
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTE_LENGTH));
    const ciphertext = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData: textEncoder.encode(normalizedContext.additionalData),
      },
      encryptionKey,
      textEncoder.encode(plaintextKey),
    );

    return {
      ciphertext: encodeBase64Url(new Uint8Array(ciphertext)),
      iv: encodeBase64Url(iv),
      encryptionKeyVersion: ENCRYPTION_KEY_VERSION,
    };
  } catch {
    throw toCryptoError();
  }
}

export async function decryptAiProviderKey(
  encryptedKey: EncryptedAiProviderKey,
  rootSecret: string,
  context: AiProviderKeyCryptoContext,
): Promise<string> {
  try {
    const normalizedContext = normalizeContext(context);
    const iv = decodeBase64Url(encryptedKey.iv);

    if (iv.byteLength !== IV_BYTE_LENGTH || encryptedKey.encryptionKeyVersion !== ENCRYPTION_KEY_VERSION) {
      throw toCryptoError();
    }

    const encryptionKey = await deriveEncryptionKey(rootSecret, normalizedContext.hkdfInfo);
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData: textEncoder.encode(normalizedContext.additionalData),
      },
      encryptionKey,
      decodeBase64Url(encryptedKey.ciphertext),
    );

    return new TextDecoder("utf-8", { fatal: true }).decode(plaintext);
  } catch {
    throw toCryptoError();
  }
}
