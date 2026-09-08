const encoder = new TextEncoder();

export interface ReducedGenerationConfirmation {
  ownerId: string;
  candidateFingerprint: string;
  allowedCount: 3 | 4;
  expiresAt: number;
  nonce: string;
}

function base64Url(bytes: Uint8Array): string {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (value.length % 4)) % 4);
    return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

async function hmac(secret: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
}

export async function digestConfirmationNonce(nonce: string): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(nonce))))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function fingerprintCandidates(ids: readonly string[]): Promise<string> {
  return digestConfirmationNonce([...ids].sort().join("\n"));
}

export async function createReducedGenerationConfirmation(
  payload: ReducedGenerationConfirmation,
  secret: string | undefined,
): Promise<string | null> {
  if (!secret?.trim()) return null;
  const body = base64Url(encoder.encode(JSON.stringify(payload)));
  return `${body}.${base64Url(await hmac(secret, body))}`;
}

export async function verifyReducedGenerationConfirmation(
  token: string,
  secret: string | undefined,
  now = Date.now(),
): Promise<ReducedGenerationConfirmation | null> {
  if (!secret?.trim()) return null;
  const [body, signature, ...extra] = token.split(".");
  if (!body || !signature || extra.length || !fromBase64Url(signature)) return null;
  const expected = base64Url(await hmac(secret, body));
  if (signature.length !== expected.length) return null;
  let difference = 0;
  for (let index = 0; index < signature.length; index += 1)
    difference |= signature.charCodeAt(index) ^ expected.charCodeAt(index);
  if (difference !== 0) return null;
  try {
    const decoded = new TextDecoder().decode(fromBase64Url(body));
    const value: unknown = JSON.parse(decoded);
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    const payload = value as Record<string, unknown>;
    if (
      typeof payload.ownerId !== "string" ||
      typeof payload.candidateFingerprint !== "string" ||
      (payload.allowedCount !== 3 && payload.allowedCount !== 4) ||
      !Number.isSafeInteger(payload.expiresAt) ||
      payload.expiresAt <= now ||
      typeof payload.nonce !== "string" ||
      payload.nonce.length < 16
    ) {
      return null;
    }
    return payload as ReducedGenerationConfirmation;
  } catch {
    return null;
  }
}
