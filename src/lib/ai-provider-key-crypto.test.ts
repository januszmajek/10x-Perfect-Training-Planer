import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AiProviderKeyCryptoError, decryptAiProviderKey, encryptAiProviderKey } from "./ai-provider-key-crypto.ts";

const ROOT_SECRET = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";
const PLAINTEXT_KEY = "fake-openrouter-key-for-contract-tests";
const CONTEXT = {
  userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  provider: "openrouter",
  encryptionKeyVersion: 1,
} as const;

function expectGenericCryptoError(error: unknown): boolean {
  assert.ok(error instanceof AiProviderKeyCryptoError);
  assert.equal(error.message, "AI provider key cryptographic operation failed");
  assert.equal(error.cause, undefined);
  return true;
}

function tamperBase64Url(value: string): string {
  const replacement = value.at(-1) === "A" ? "B" : "A";
  return `${value.slice(0, -1)}${replacement}`;
}

void describe("AI provider key crypto V1", () => {
  void it("decodes a deterministic 32-byte root secret and round-trips plaintext", async () => {
    assert.equal(Buffer.from(Uint8Array.from({ length: 32 }, (_, index) => index)).toString("base64url"), ROOT_SECRET);

    const encrypted = await encryptAiProviderKey(PLAINTEXT_KEY, ROOT_SECRET, CONTEXT);
    const decrypted = await decryptAiProviderKey(encrypted, ROOT_SECRET, CONTEXT);

    assert.equal(decrypted, PLAINTEXT_KEY);
  });

  void it("uses a fresh IV and produces non-deterministic ciphertext", async () => {
    const first = await encryptAiProviderKey(PLAINTEXT_KEY, ROOT_SECRET, CONTEXT);
    const second = await encryptAiProviderKey(PLAINTEXT_KEY, ROOT_SECRET, CONTEXT);

    assert.notEqual(first.iv, second.iv);
    assert.notEqual(first.ciphertext, second.ciphertext);
  });

  void it("emits canonical unpadded base64url ciphertext and a 12-byte IV", async () => {
    const encrypted = await encryptAiProviderKey(PLAINTEXT_KEY, ROOT_SECRET, CONTEXT);

    assert.match(encrypted.ciphertext, /^[A-Za-z0-9_-]+$/u);
    assert.match(encrypted.iv, /^[A-Za-z0-9_-]{16}$/u);
    assert.ok(!encrypted.ciphertext.includes("="));
    assert.ok(!encrypted.iv.includes("="));
    assert.equal(Buffer.from(encrypted.iv, "base64url").byteLength, 12);
  });

  void it("rejects tampered ciphertext", async () => {
    const encrypted = await encryptAiProviderKey(PLAINTEXT_KEY, ROOT_SECRET, CONTEXT);

    await assert.rejects(
      decryptAiProviderKey({ ...encrypted, ciphertext: tamperBase64Url(encrypted.ciphertext) }, ROOT_SECRET, CONTEXT),
      expectGenericCryptoError,
    );
  });

  void it("rejects the wrong authenticated user context", async () => {
    const encrypted = await encryptAiProviderKey(PLAINTEXT_KEY, ROOT_SECRET, CONTEXT);

    await assert.rejects(
      decryptAiProviderKey(encrypted, ROOT_SECRET, {
        ...CONTEXT,
        userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      }),
      expectGenericCryptoError,
    );
  });

  void it("rejects the wrong provider context", async () => {
    const encrypted = await encryptAiProviderKey(PLAINTEXT_KEY, ROOT_SECRET, CONTEXT);

    await assert.rejects(
      decryptAiProviderKey(encrypted, ROOT_SECRET, {
        ...CONTEXT,
        provider: "unsupported",
      }),
      expectGenericCryptoError,
    );
  });

  void it("rejects malformed and padded payload encodings", async () => {
    const encrypted = await encryptAiProviderKey(PLAINTEXT_KEY, ROOT_SECRET, CONTEXT);

    await assert.rejects(
      decryptAiProviderKey({ ...encrypted, ciphertext: `${encrypted.ciphertext}=` }, ROOT_SECRET, CONTEXT),
      expectGenericCryptoError,
    );
    await assert.rejects(
      decryptAiProviderKey({ ...encrypted, iv: "not+base64url==" }, ROOT_SECRET, CONTEXT),
      expectGenericCryptoError,
    );
  });

  void it("rejects unknown encryption versions", async () => {
    const encrypted = await encryptAiProviderKey(PLAINTEXT_KEY, ROOT_SECRET, CONTEXT);
    const unknownVersion = { ...encrypted, encryptionKeyVersion: 2 };

    await assert.rejects(
      decryptAiProviderKey(unknownVersion, ROOT_SECRET, { ...CONTEXT, encryptionKeyVersion: 2 }),
      expectGenericCryptoError,
    );
  });

  void it("rejects root secrets that do not decode to 32 bytes", async () => {
    const shortRootSecret = Buffer.alloc(31, 7).toString("base64url");

    await assert.rejects(encryptAiProviderKey(PLAINTEXT_KEY, shortRootSecret, CONTEXT), expectGenericCryptoError);
  });
});
