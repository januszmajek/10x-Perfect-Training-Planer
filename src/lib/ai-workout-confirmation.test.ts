import assert from "node:assert/strict";
import test from "node:test";
import {
  createReducedGenerationConfirmation,
  digestConfirmationNonce,
  fingerprintCandidates,
  verifyReducedGenerationConfirmation,
} from "./ai-workout-confirmation.ts";

const payload = {
  ownerId: "00000000-0000-0000-0000-000000000001",
  candidateFingerprint: "fingerprint",
  allowedCount: 3 as const,
  expiresAt: 2_000,
  nonce: "12345678-1234-1234-1234-123456789abc",
};

void test("signs and verifies owner-bound short-lived confirmations", async () => {
  const token = await createReducedGenerationConfirmation(payload, "test-secret");
  assert.ok(token);
  assert.deepEqual(await verifyReducedGenerationConfirmation(token, "test-secret", 1_000), payload);
  assert.equal(await verifyReducedGenerationConfirmation(token, "wrong-secret", 1_000), null);
  assert.equal(await verifyReducedGenerationConfirmation(token, "test-secret", 2_000), null);
});

void test("uses deterministic candidate fingerprints and opaque nonce digests", async () => {
  assert.equal(await fingerprintCandidates(["b", "a"]), await fingerprintCandidates(["a", "b"]));
  assert.notEqual(await digestConfirmationNonce(payload.nonce), payload.nonce);
});
