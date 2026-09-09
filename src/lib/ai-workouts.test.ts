import assert from "node:assert/strict";
import test from "node:test";
import {
  generateColdStartAiWorkout,
  generateHistoryAwareAiWorkout,
  saveAiPlannedWorkout,
  type AiWorkoutGenerationDependencies,
} from "./ai-workouts.ts";
import { aiGenerationFailureResponse } from "./ai-workout-api.ts";
import { createReducedGenerationConfirmation, fingerprintCandidates } from "./ai-workout-confirmation.ts";
import type { CatalogueExercise } from "./manual-workout-builder.ts";

const USER_ID = "00000000-0000-0000-0000-000000000001";
const IDS = Array.from({ length: 5 }, (_, index) => `00000000-0000-0000-0000-${String(index + 1).padStart(12, "0")}`);
const catalogue: CatalogueExercise[] = [
  {
    id: IDS[0],
    name: "Bench Press",
    equipment: "barbell",
    movementPattern: "push",
    muscles: [{ code: "chest", name: "Chest", category: "upper_body", role: "primary", recoveryHours: 48 }],
  },
  {
    id: IDS[1],
    name: "Cable Row",
    equipment: "cable",
    movementPattern: "pull",
    muscles: [{ code: "lats", name: "Lats", category: "upper_body", role: "primary", recoveryHours: 72 }],
  },
  {
    id: IDS[2],
    name: "Squat",
    equipment: "barbell",
    movementPattern: null,
    muscles: [{ code: "quads", name: "Quads", category: "lower_body", role: "primary", recoveryHours: 72 }],
  },
  {
    id: IDS[3],
    name: "Plank",
    equipment: "bodyweight",
    movementPattern: null,
    muscles: [{ code: "core", name: "Core", category: "core", role: "primary", recoveryHours: 48 }],
  },
  {
    id: IDS[4],
    name: "Lunge",
    equipment: "dumbbell",
    movementPattern: null,
    muscles: [{ code: "glutes", name: "Glutes", category: "lower_body", role: "primary", recoveryHours: 72 }],
  },
];

const proposal = { exercises: catalogue.map(({ id }) => ({ exerciseId: id, sets: 3, reps: 10 })) };

function dependencies(overrides: Partial<AiWorkoutGenerationDependencies> = {}): AiWorkoutGenerationDependencies {
  return {
    loadColdStartEligibility: () => Promise.resolve({ ok: true, data: "eligible" }),
    decryptOwnedAiProviderKey: () => Promise.resolve({ ok: true, data: "private-key" }),
    loadWorkoutCatalogue: () => Promise.resolve({ ok: true, data: catalogue }),
    buildColdStartWorkoutPrompt: () => ({ ok: true, data: { system: "system", user: "catalogue" } }),
    requestOpenRouterWorkout: () => Promise.resolve({ ok: true, data: { content: "provider-content" } }),
    parseAiWorkoutProposalJson: () => ({ ok: true, data: proposal }),
    ...overrides,
  } satisfies AiWorkoutGenerationDependencies;
}

void test("stops before credential or provider use for completed-history accounts", async () => {
  let providerCalls = 0;
  const result = await generateColdStartAiWorkout(
    {} as never,
    USER_ID,
    "provider/model",
    dependencies({
      loadColdStartEligibility: () => Promise.resolve({ ok: true, data: "history_aware_not_available" }),
      decryptOwnedAiProviderKey: () => Promise.reject(new Error("must not decrypt")),
      requestOpenRouterWorkout: () => {
        providerCalls += 1;
        return Promise.reject(new Error("must not call provider"));
      },
    }),
  );

  assert.deepEqual(result, {
    ok: false,
    code: "history_aware_not_available",
    internal: { layer: "service", technicalCode: "COMPLETED_HISTORY_EXISTS" },
  });
  assert.equal(providerCalls, 0);
});

void test("returns only a validated proposal after cold-start prerequisites succeed", async () => {
  const result = await generateColdStartAiWorkout({} as never, USER_ID, " provider/model ", dependencies());
  assert.deepEqual(result, {
    ok: true,
    data: { proposal, metadata: { kind: "cold_start", exerciseCount: proposal.exercises.length } },
  });
});

void test("records history-aware proposal lineage for initial generation and re-rolls", async () => {
  const calls: [string, unknown][] = [];
  const client = {
    rpc: (name: string, args: unknown) => {
      calls.push([name, args]);
      return Promise.resolve({ data: [{ proposal_id: IDS[0], lineage_id: IDS[1] }], error: null });
    },
  };
  const recommendation = {
    decision: { kind: "normal", requestedExerciseCount: { min: 5, max: 7 } },
    readyCandidates: catalogue,
    shortlist: catalogue,
    feasibleCoverage: ["lower_body", "core", "upper_body_push", "upper_body_pull"],
  } as never;
  const result = await generateHistoryAwareAiWorkout(
    client as never,
    USER_ID,
    "provider/model",
    { version: 1 },
    dependencies({
      loadHistoryAwareAiProfile: () =>
        Promise.resolve({
          ok: true,
          data: {
            completions: [
              {
                exerciseId: IDS[0],
                completedCount: 1,
                lastCompletedAt: "2025-01-01T00:00:00.000Z",
                inLastCompletedWorkout: false,
              },
            ],
            preferences: new Map(),
          },
        }),
      recommendHistoryAwareWorkout: () => recommendation,
      buildHistoryAwareWorkoutPrompt: () => ({ ok: true, data: { system: "system", user: "shortlist" } }),
      parseHistoryAwareAiWorkoutProposalJson: () => ({ ok: true, data: proposal }),
    }),
  );

  assert.equal(result.ok, true);
  const reroll = await generateHistoryAwareAiWorkout(
    client as never,
    USER_ID,
    "provider/model",
    { version: 1, priorProposalId: IDS[1] },
    dependencies({
      loadHistoryAwareAiProfile: () =>
        Promise.resolve({
          ok: true,
          data: {
            completions: [
              {
                exerciseId: IDS[0],
                completedCount: 1,
                lastCompletedAt: "2025-01-01T00:00:00.000Z",
                inLastCompletedWorkout: false,
              },
            ],
            preferences: new Map(),
          },
        }),
      recommendHistoryAwareWorkout: () => recommendation,
      buildHistoryAwareWorkoutPrompt: () => ({ ok: true, data: { system: "system", user: "shortlist" } }),
      parseHistoryAwareAiWorkoutProposalJson: () => ({ ok: true, data: proposal }),
    }),
  );
  assert.equal(reroll.ok, true);
  assert.deepEqual(calls, [
    ["record_ai_workout_proposal", { p_exercise_ids: IDS, p_rerolled_from_proposal_id: null }],
    ["record_ai_workout_proposal", { p_exercise_ids: IDS, p_rerolled_from_proposal_id: IDS[1] }],
  ]);
});

void test("requires a fresh owner-bound confirmation before reduced provider use", async () => {
  const calls: [string, unknown][] = [];
  let providerCalls = 0;
  let confirmationConsumed = false;
  const reducedCatalogue = catalogue.slice(0, 3);
  const recommendation = {
    decision: { kind: "reduced_confirmation_required", availableExerciseCount: 3 as const },
    readyCandidates: reducedCatalogue,
    shortlist: reducedCatalogue,
    feasibleCoverage: ["upper_body_push", "upper_body_pull", "lower_body"],
  } as never;
  const client = {
    rpc: (name: string, args: unknown) => {
      calls.push([name, args]);
      if (name === "consume_ai_reduced_generation_confirmation") {
        if (confirmationConsumed) return Promise.resolve({ data: null, error: { code: "P0001" } });
        confirmationConsumed = true;
        return Promise.resolve({ data: null, error: null });
      }
      return Promise.resolve(
        name === "record_ai_workout_proposal"
          ? { data: [{ proposal_id: IDS[3], lineage_id: IDS[4] }], error: null }
          : { data: null, error: null },
      );
    },
  };
  const now = new Date(1_000);
  const token = await createReducedGenerationConfirmation(
    {
      ownerId: USER_ID,
      candidateFingerprint: await fingerprintCandidates(reducedCatalogue.map(({ id }) => id)),
      allowedCount: 3,
      expiresAt: 2_000,
      nonce: "12345678-1234-1234-1234-123456789abc",
    },
    "confirmation-secret",
  );
  assert.ok(token);
  const historyDependencies = dependencies({
    loadHistoryAwareAiProfile: () =>
      Promise.resolve({
        ok: true as const,
        data: {
          completions: [
            {
              exerciseId: IDS[0],
              completedCount: 1,
              lastCompletedAt: now.toISOString(),
              inLastCompletedWorkout: false,
            },
          ],
          preferences: new Map(),
        },
      }),
    recommendHistoryAwareWorkout: () => recommendation,
    buildHistoryAwareWorkoutPrompt: () => ({ ok: true as const, data: { system: "system", user: "shortlist" } }),
    parseHistoryAwareAiWorkoutProposalJson: () => ({
      ok: true as const,
      data: { exercises: proposal.exercises.slice(0, 3) },
    }),
    requestOpenRouterWorkout: () => {
      providerCalls += 1;
      return Promise.resolve({ ok: true as const, data: { content: "provider-content" } });
    },
    confirmationSecret: "confirmation-secret",
    now: () => now,
  });

  const initial = await generateHistoryAwareAiWorkout(
    client as never,
    USER_ID,
    "provider/model",
    { version: 1 },
    historyDependencies,
  );
  assert.equal(initial.ok, false);
  assert.equal(initial.code, "confirmation_required");
  assert.equal(providerCalls, 0);

  const confirmed = await generateHistoryAwareAiWorkout(
    client as never,
    USER_ID,
    "provider/model",
    { version: 1, confirmationToken: token },
    historyDependencies,
  );
  assert.equal(confirmed.ok, true);
  assert.equal(providerCalls, 1);
  assert.equal(calls.filter(([name]) => name === "consume_ai_reduced_generation_confirmation").length, 1);

  const replay = await generateHistoryAwareAiWorkout(
    client as never,
    USER_ID,
    "provider/model",
    { version: 1, confirmationToken: token },
    historyDependencies,
  );
  assert.equal(replay.ok, false);
  assert.equal(replay.code, "stale_confirmation");
  assert.equal(providerCalls, 1);

  const otherOwnerToken = await createReducedGenerationConfirmation(
    {
      ownerId: "00000000-0000-0000-0000-000000000002",
      candidateFingerprint: await fingerprintCandidates(reducedCatalogue.map(({ id }) => id)),
      allowedCount: 3,
      expiresAt: 2_000,
      nonce: "12345678-1234-1234-1234-123456789abd",
    },
    "confirmation-secret",
  );
  assert.ok(otherOwnerToken);
  const crossOwner = await generateHistoryAwareAiWorkout(
    client as never,
    USER_ID,
    "provider/model",
    { version: 1, confirmationToken: otherOwnerToken },
    historyDependencies,
  );
  assert.equal(crossOwner.ok, false);
  assert.equal(crossOwner.code, "stale_confirmation");
  assert.equal(providerCalls, 1);
});

void test("rejects a reduced token when recomputation finds five ready candidates", async () => {
  let providerCalls = 0;
  const recommendation = {
    decision: { kind: "normal", requestedExerciseCount: { min: 5, max: 7 } },
    readyCandidates: catalogue,
    shortlist: catalogue,
    feasibleCoverage: ["lower_body", "core", "upper_body_push", "upper_body_pull"],
  } as never;
  const result = await generateHistoryAwareAiWorkout(
    { rpc: () => Promise.resolve({ data: null, error: null }) } as never,
    USER_ID,
    "provider/model",
    { version: 1, confirmationToken: "stale-token" },
    dependencies({
      loadHistoryAwareAiProfile: () =>
        Promise.resolve({
          ok: true as const,
          data: {
            completions: [
              {
                exerciseId: IDS[0],
                completedCount: 1,
                lastCompletedAt: "2025-01-01T00:00:00.000Z",
                inLastCompletedWorkout: false,
              },
            ],
            preferences: new Map(),
          },
        }),
      recommendHistoryAwareWorkout: () => recommendation,
      buildHistoryAwareWorkoutPrompt: () => ({ ok: true as const, data: { system: "system", user: "shortlist" } }),
      parseHistoryAwareAiWorkoutProposalJson: () => ({ ok: true as const, data: proposal }),
      requestOpenRouterWorkout: () => {
        providerCalls += 1;
        return Promise.resolve({ ok: true as const, data: { content: "provider-content" } });
      },
    }),
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, "stale_confirmation");
  assert.equal(providerCalls, 0);
});

void test("short-circuits missing model, credential, and catalogue prerequisites before provider use", async () => {
  let providerCalls = 0;
  const provider = () => {
    providerCalls += 1;
    return Promise.resolve({ ok: true as const, data: { content: "provider-content" } });
  };

  const missingModel = await generateColdStartAiWorkout(
    {} as never,
    USER_ID,
    undefined,
    dependencies({ requestOpenRouterWorkout: provider }),
  );
  assert.equal(missingModel.ok, false);
  assert.equal(missingModel.code, "model_not_configured");

  const missingKey = await generateColdStartAiWorkout(
    {} as never,
    USER_ID,
    "provider/model",
    dependencies({
      decryptOwnedAiProviderKey: () => Promise.resolve({ ok: false, reason: "not_configured" }),
      requestOpenRouterWorkout: provider,
    }),
  );
  if (!missingKey.ok) assert.equal(missingKey.code, "key_not_configured");

  const catalogueFailure = await generateColdStartAiWorkout(
    {} as never,
    USER_ID,
    "provider/model",
    dependencies({
      loadWorkoutCatalogue: () =>
        Promise.resolve({
          ok: false,
          code: "persistence_failed",
          internal: { layer: "database", technicalCode: "DB_FAILURE" },
        }),
      requestOpenRouterWorkout: provider,
    }),
  );
  assert.equal(catalogueFailure.ok, false);
  assert.equal(catalogueFailure.code, "persistence_failed");
  assert.equal(providerCalls, 0);
});

void test("maps missing, unavailable, rejected, provider, and invalid-output cases to browser-safe codes", async () => {
  const cases: [string, Partial<AiWorkoutGenerationDependencies>, string][] = [
    [
      "unavailable encryption",
      { decryptOwnedAiProviderKey: () => Promise.resolve({ ok: false, reason: "unavailable_encryption" }) },
      "key_encryption_unavailable",
    ],
    [
      "rejected credential",
      { requestOpenRouterWorkout: () => Promise.resolve({ ok: false as const, code: "invalid_credential" }) },
      "key_rejected",
    ],
    [
      "rate limit",
      { requestOpenRouterWorkout: () => Promise.resolve({ ok: false as const, code: "rate_limited" }) },
      "rate_limited",
    ],
    [
      "timeout",
      { requestOpenRouterWorkout: () => Promise.resolve({ ok: false as const, code: "timeout" }) },
      "timeout",
    ],
    [
      "provider failure",
      { requestOpenRouterWorkout: () => Promise.resolve({ ok: false as const, code: "network_failure" }) },
      "provider_unavailable",
    ],
    [
      "invalid output",
      { parseAiWorkoutProposalJson: () => ({ ok: false, code: "invalid_proposal" }) },
      "invalid_output",
    ],
  ];

  for (const [name, overrides, expectedCode] of cases) {
    await test(name, async () => {
      const result = await generateColdStartAiWorkout({} as never, USER_ID, "provider/model", dependencies(overrides));
      assert.equal(result.ok, false);
      assert.equal(result.code, expectedCode);
    });
  }
});

function saveRequest(replaceExisting = false, proposalId: string | null = null) {
  return {
    version: 1 as const,
    replaceExisting,
    expectedWorkoutId: replaceExisting ? IDS[0] : null,
    expectedRevision: replaceExisting ? 1 : null,
    proposalId,
    exercises: proposal.exercises,
  };
}

function saveClient(rpcResult: { data: string | null; error: { code: string } | null }) {
  const calls: unknown[] = [];
  return {
    calls,
    client: {
      auth: { getUser: () => Promise.resolve({ data: { user: { id: USER_ID } }, error: null }) },
      from: () => ({
        select: () => ({
          in: () => ({ limit: () => Promise.resolve({ data: catalogue.map(({ id }) => ({ id })), error: null }) }),
        }),
      }),
      rpc: (name: string, args: unknown) => {
        calls.push([name, args]);
        return Promise.resolve(rpcResult);
      },
    },
  };
}

void test("saves validated drafts only through the AI-origin RPC", async () => {
  const { client, calls } = saveClient({ data: IDS[4], error: null });
  const result = await saveAiPlannedWorkout(client as never, USER_ID, saveRequest());
  assert.deepEqual(result, { ok: true, data: { workoutId: IDS[4] } });
  assert.deepEqual(calls, [
    [
      "save_ai_planned_workout",
      {
        p_exercises: proposal.exercises.map(({ exerciseId, sets, reps }) => ({ exercise_id: exerciseId, sets, reps })),
        p_replace_existing: false,
      },
    ],
  ]);
});

void test("selects the distinct history-aware save RPC only when a proposal is supplied", async () => {
  const { client, calls } = saveClient({ data: IDS[4], error: null });
  const result = await saveAiPlannedWorkout(client as never, USER_ID, saveRequest(true, IDS[3]));
  assert.deepEqual(result, { ok: true, data: { workoutId: IDS[4] } });
  assert.deepEqual(calls, [
    [
      "save_history_aware_ai_planned_workout",
      {
        p_exercises: proposal.exercises.map(({ exerciseId, sets, reps }) => ({ exercise_id: exerciseId, sets, reps })),
        p_proposal_id: IDS[3],
        p_replace_existing: true,
        p_expected_workout_id: IDS[0],
        p_expected_revision: 1,
      },
    ],
  ]);
});

void test("maps history-aware linkage failures without retrying through the legacy RPC", async () => {
  const { client, calls } = saveClient({ data: null, error: { code: "AW005" } });
  const result = await saveAiPlannedWorkout(client as never, USER_ID, saveRequest(false, IDS[3]));
  assert.equal(result.ok, false);
  assert.equal(result.code, "persistence_failed");
  assert.equal((calls[0] as [string, unknown])[0], "save_history_aware_ai_planned_workout");
  assert.equal(calls.length, 1);
});

void test("maps AI save confirmation, stale, validation, authentication, and persistence outcomes", async () => {
  const expected = {
    AW001: "confirmation_required",
    AW002: "stale_plan",
    AW003: "validation_failed",
    AW004: "unauthenticated",
    XX000: "persistence_failed",
  } as const;
  for (const [sqlState, code] of Object.entries(expected)) {
    const { client } = saveClient({ data: null, error: { code: sqlState } });
    const result = await saveAiPlannedWorkout(client as never, USER_ID, saveRequest(true));
    assert.equal(result.ok, false);
    assert.equal(result.code, code);
  }
});

void test("rejects an edited draft with unknown catalogue membership before the AI RPC", async () => {
  const { client, calls } = saveClient({ data: IDS[4], error: null });
  const request = saveRequest();
  request.exercises[0] = { ...request.exercises[0], exerciseId: "00000000-0000-0000-0000-999999999999" };
  const result = await saveAiPlannedWorkout(client as never, USER_ID, request);
  assert.equal(result.ok, false);
  assert.equal(result.code, "validation_failed");
  assert.deepEqual(calls, []);
});

void test("logs expected availability decisions as information instead of application errors", (context) => {
  const info = context.mock.method(globalThis.console, "info", () => undefined);
  const errors = context.mock.method(globalThis.console, "error", () => undefined);

  try {
    const response = aiGenerationFailureResponse(
      "request-id",
      "generate_ai_workout",
      {
        ok: false,
        code: "insufficient_recovered_candidates",
        internal: { layer: "service", technicalCode: "INSUFFICIENT_READY_CANDIDATES" },
      },
      10,
    );
    assert.equal(response.status, 409);
  } finally {
    context.mock.restoreAll();
  }

  assert.equal(info.mock.callCount(), 1);
  assert.equal(errors.mock.callCount(), 0);
  assert.match(String(info.mock.calls[0].arguments[0]), /"code":"insufficient_recovered_candidates"/);
});
