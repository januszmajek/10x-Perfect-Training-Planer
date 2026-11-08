import assert from "node:assert/strict";
import test from "node:test";
import {
  createReducedGenerationConfirmation,
  digestConfirmationNonce,
  fingerprintCandidates,
  fingerprintPartialReroll,
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

void test("rejects tampered and malformed confirmation capabilities", async () => {
  const token = await createReducedGenerationConfirmation(payload, "test-secret");
  assert.ok(token);
  assert.equal(await verifyReducedGenerationConfirmation(`${token}x`, "test-secret", 1_000), null);
  assert.equal(await verifyReducedGenerationConfirmation("not-a-token", "test-secret", 1_000), null);
  assert.equal(await verifyReducedGenerationConfirmation(token, undefined, 1_000), null);
});

void test("partial re-roll fingerprints are domain-separated and bind every request list", async () => {
  const base = { candidateIds: ["c2", "c1"], keptIds: ["k1"], markedIds: ["m1"], excludedIds: ["x1"] };
  const fingerprint = await fingerprintPartialReroll(base);
  assert.match(fingerprint, /^[0-9a-f]{64}$/);
  assert.equal(fingerprint, await fingerprintPartialReroll({ ...base, candidateIds: ["c1", "c2"] }));
  assert.notEqual(fingerprint, await fingerprintCandidates(base.candidateIds));
  assert.notEqual(
    await fingerprintPartialReroll({ ...base, keptIds: [], markedIds: [], excludedIds: [] }),
    await fingerprintCandidates(base.candidateIds),
  );
  for (const changed of [
    { ...base, candidateIds: ["c1"] },
    { ...base, keptIds: ["k2"] },
    { ...base, markedIds: ["m1", "m2"] },
    { ...base, excludedIds: [] },
    { ...base, excludedIds: ["x1", "x2"] },
    // Moving an id between lists changes the fingerprint.
    { ...base, keptIds: ["k1", "m1"], markedIds: [] },
  ]) {
    assert.notEqual(await fingerprintPartialReroll(changed), fingerprint);
  }
});
