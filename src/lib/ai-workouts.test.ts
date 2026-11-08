import assert from "node:assert/strict";
import test from "node:test";
import {
  generateColdStartAiWorkout,
  generateHistoryAwareAiWorkout,
  saveAiPlannedWorkout,
  type AiWorkoutGenerationDependencies,
} from "./ai-workouts.ts";
import { parseAiWorkoutProposalJson, parseHistoryAwareAiWorkoutProposalJson } from "./ai-workout-contract.ts";
import { aiGenerationFailureResponse } from "./ai-workout-api.ts";
import {
  createReducedGenerationConfirmation,
  fingerprintCandidates,
  fingerprintPartialReroll,
} from "./ai-workout-confirmation.ts";
import { parseAiWorkoutGenerationResponse } from "./ai-workout-client.ts";
import { recommendHistoryAwareWorkout } from "./ai-workout-recommender.ts";
import { requestOpenRouterWorkout } from "./openrouter-client.ts";
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

function proposalWith(exerciseIds: readonly string[]) {
  return { exercises: exerciseIds.map((exerciseId) => ({ exerciseId, sets: 3, reps: 10 })) };
}

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

function providerResponse(content: string) {
  return () =>
    requestOpenRouterWorkout(
      {
        apiKey: "private-key",
        model: "provider/model",
        prompt: { system: "system", user: "catalogue" },
        allowedExerciseIds: IDS,
        requestedExerciseCount: { min: 5, max: 7 },
      },
      () => Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content } }] }))),
    );
}

function malformedProviderWrapper() {
  return () =>
    requestOpenRouterWorkout(
      {
        apiKey: "private-key",
        model: "provider/model",
        prompt: { system: "system", user: "catalogue" },
        allowedExerciseIds: IDS,
        requestedExerciseCount: { min: 5, max: 7 },
      },
      () => Promise.resolve(new Response(JSON.stringify({ choices: [] }))),
    );
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

void test("composes controlled OpenRouter content with the cold-start parser before exposing a proposal", async () => {
  const valid = await generateColdStartAiWorkout(
    {} as never,
    USER_ID,
    "provider/model",
    dependencies({ requestOpenRouterWorkout: providerResponse(JSON.stringify(proposal)), parseAiWorkoutProposalJson }),
  );
  assert.equal(valid.ok, true);

  const invalid = await generateColdStartAiWorkout(
    {} as never,
    USER_ID,
    "provider/model",
    dependencies({
      requestOpenRouterWorkout: providerResponse(
        JSON.stringify(proposalWith([IDS[0], IDS[0], IDS[2], IDS[3], IDS[4]])),
      ),
      parseAiWorkoutProposalJson,
    }),
  );
  assert.deepEqual(invalid, {
    ok: false,
    code: "invalid_output",
    internal: { layer: "service", technicalCode: "PROPOSAL_INVALID_PROPOSAL" },
  });

  const malformed = await generateColdStartAiWorkout(
    {} as never,
    USER_ID,
    "provider/model",
    dependencies({ requestOpenRouterWorkout: malformedProviderWrapper(), parseAiWorkoutProposalJson }),
  );
  assert.equal(malformed.ok, false);
  assert.equal(malformed.code, "invalid_output");
  assert.doesNotMatch(JSON.stringify(malformed), /private-key|catalogue|choices/);
});

void test("composes history-aware provider content with the parser and blocks unsafe proposals before recording lineage", async () => {
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
  const valid = await generateHistoryAwareAiWorkout(
    client as never,
    USER_ID,
    "provider/model",
    { version: 1 },
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
      requestOpenRouterWorkout: providerResponse(JSON.stringify(proposal)),
      parseHistoryAwareAiWorkoutProposalJson,
    }),
  );
  assert.equal(valid.ok, true);
  assert.equal(calls.length, 1);
  calls.length = 0;

  const result = await generateHistoryAwareAiWorkout(
    client as never,
    USER_ID,
    "provider/model",
    { version: 1 },
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
      requestOpenRouterWorkout: providerResponse(
        JSON.stringify(proposalWith([IDS[0], IDS[0], IDS[2], IDS[3], IDS[4]])),
      ),
      parseHistoryAwareAiWorkoutProposalJson,
    }),
  );

  assert.equal(result.ok, false);
  assert.equal(result.code, "invalid_output");
  assert.deepEqual(calls, []);
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
    ["record_ai_workout_proposal", { p_exercise_ids: IDS }],
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

// ---------------------------------------------------------------------------------------------------------------------
// Partial re-roll orchestration
// ---------------------------------------------------------------------------------------------------------------------

function partialId(number: number): string {
  return `00000000-0000-0000-0001-${String(number).padStart(12, "0")}`;
}

function exercise(
  number: number,
  name: string,
  category: "upper_body" | "lower_body" | "core",
  movementPattern: "push" | "pull" | null,
  code: string,
): CatalogueExercise {
  return {
    id: partialId(number),
    name,
    equipment: "dumbbell",
    movementPattern,
    muscles: [{ code, name: code, category, role: "primary", recoveryHours: 24 }],
  };
}

const P1 = exercise(1, "Push One", "upper_body", "push", "chest");
const P2 = exercise(2, "Push Two", "upper_body", "push", "shoulders");
const P3 = exercise(3, "Push Three", "upper_body", "push", "triceps");
const L1 = exercise(4, "Lower One", "lower_body", null, "quads");
const L2 = exercise(5, "Lower Two", "lower_body", null, "hamstrings");
const C1 = exercise(6, "Core One", "core", null, "abs");
const C2 = exercise(7, "Core Two", "core", null, "obliques");
const U1 = exercise(8, "Pull One", "upper_body", "pull", "lats");
const U2 = exercise(9, "Pull Two", "upper_body", "pull", "rhomboids");
const U3 = exercise(10, "Pull Three", "upper_body", "pull", "biceps");
const partialCatalogue = [P1, P2, P3, L1, L2, C1, C2, U1, U2, U3];
const UNKNOWN_ID = "00000000-0000-0000-0001-999999999999";
const NOW = new Date("2026-06-01T00:00:00.000Z");

const keep = (item: CatalogueExercise, sets = 3, reps = 10) => ({ exerciseId: item.id, sets, reps });
const mark = (item: CatalogueExercise) => ({ exerciseId: item.id, replace: true as const });
const pick = (item: CatalogueExercise, sets = 3, reps = 12) => ({ exerciseId: item.id, sets, reps });

interface ProviderCall {
  allowedExerciseIds: readonly string[];
  requestedExerciseCount: { min: number; max: number };
  prompt: { system: string; user: string };
}

function partialHarness(providerPicks: readonly { exerciseId: string; sets: number; reps: number }[]) {
  const providerCalls: ProviderCall[] = [];
  let decryptCalls = 0;
  let catalogueLoads = 0;
  const harness = {
    providerCalls,
    get decryptCalls() {
      return decryptCalls;
    },
    get catalogueLoads() {
      return catalogueLoads;
    },
    overrides: {
      loadWorkoutCatalogue: () => {
        catalogueLoads += 1;
        return Promise.resolve({ ok: true as const, data: partialCatalogue });
      },
      decryptOwnedAiProviderKey: () => {
        decryptCalls += 1;
        return Promise.resolve({ ok: true as const, data: "private-key" });
      },
      requestOpenRouterWorkout: (request: ProviderCall) => {
        providerCalls.push(request);
        return Promise.resolve({
          ok: true as const,
          data: { content: JSON.stringify({ exercises: providerPicks }) },
        });
      },
    } satisfies Partial<AiWorkoutGenerationDependencies>,
  };
  return harness;
}

void test("cold-start partial re-roll echoes kept prescriptions and fills marked slots from the reduced pool", async () => {
  const harness = partialHarness([pick(U3, 4, 6), pick(C2)]);
  const result = await generateColdStartAiWorkout(
    {} as never,
    USER_ID,
    "provider/model",
    dependencies(harness.overrides),
    {
      version: 1,
      reroll: {
        exercises: [keep(P1, 5, 5), mark(U1), keep(L1, 2, 20), mark(C1), keep(P2)],
        excludedExerciseIds: [U2.id],
      },
    },
  );

  assert.deepEqual(result, {
    ok: true,
    data: {
      proposal: { exercises: [keep(P1, 5, 5), pick(U3, 4, 6), keep(L1, 2, 20), pick(C2), keep(P2)] },
      metadata: { kind: "cold_start", exerciseCount: 5 },
    },
  });
  assert.equal(harness.catalogueLoads, 1);
  assert.equal(harness.providerCalls.length, 1);
  const [call] = harness.providerCalls;
  assert.deepEqual([...call.allowedExerciseIds].sort(), [P3.id, L2.id, C2.id, U3.id].sort());
  for (const removed of [P1, P2, L1, U1, C1, U2]) {
    assert.equal(call.allowedExerciseIds.includes(removed.id), false);
    assert.doesNotMatch(call.prompt.user.split('"candidates"')[1] ?? "", new RegExp(removed.id));
  }
  assert.deepEqual(call.requestedExerciseCount, { min: 2, max: 2 });
  assert.doesNotMatch(call.prompt.user, new RegExp(`${U1.id}|${C1.id}|${U2.id}`));
});

void test("cold-start partial re-roll enforces merged coverage on the provider picks", async () => {
  const harness = partialHarness([pick(U3), pick(P3)]);
  const result = await generateColdStartAiWorkout(
    {} as never,
    USER_ID,
    "provider/model",
    dependencies(harness.overrides),
    {
      version: 1,
      reroll: { exercises: [keep(P1), mark(U1), keep(L1), mark(C1), keep(P2)] },
    },
  );
  assert.deepEqual(result, {
    ok: false,
    code: "invalid_output",
    internal: { layer: "service", technicalCode: "PROPOSAL_INVALID_PROPOSAL" },
  });

  const echoesMarked = partialHarness([pick(U1), pick(C2)]);
  const marked = await generateColdStartAiWorkout(
    {} as never,
    USER_ID,
    "provider/model",
    dependencies(echoesMarked.overrides),
    { version: 1, reroll: { exercises: [keep(P1), mark(U1), keep(L1), mark(C1), keep(P2)] } },
  );
  assert.equal(marked.ok, false);
  assert.equal(marked.code, "invalid_output");
});

void test("cold-start partial infeasibility and unknown ids short-circuit before decrypt and provider use", async () => {
  const exhausted = partialHarness([]);
  const infeasible = await generateColdStartAiWorkout(
    {} as never,
    USER_ID,
    "provider/model",
    dependencies(exhausted.overrides),
    {
      version: 1,
      reroll: { exercises: [keep(P1), keep(L1), keep(U1), mark(C1), keep(P2)], excludedExerciseIds: [C2.id] },
    },
  );
  assert.deepEqual(infeasible, {
    ok: false,
    code: "replacement_not_feasible",
    internal: { layer: "service", technicalCode: "REROLL_COVERAGE_UNREACHABLE" },
  });
  assert.equal(exhausted.decryptCalls, 0);
  assert.equal(exhausted.providerCalls.length, 0);

  for (const reroll of [
    { exercises: [keep(P1), { exerciseId: UNKNOWN_ID, replace: true as const }] },
    { exercises: [keep(P1), mark(U1)], excludedExerciseIds: [UNKNOWN_ID] },
    { exercises: [{ exerciseId: UNKNOWN_ID, replace: true as const }] },
  ]) {
    const unknown = partialHarness([]);
    const result = await generateColdStartAiWorkout(
      {} as never,
      USER_ID,
      "provider/model",
      dependencies(unknown.overrides),
      { version: 1, reroll },
    );
    assert.deepEqual(result, {
      ok: false,
      code: "validation_failed",
      internal: { layer: "service", technicalCode: "REROLL_UNKNOWN_EXERCISE" },
    });
    assert.equal(unknown.decryptCalls, 0);
    assert.equal(unknown.providerCalls.length, 0);
  }
});

void test("cold-start all-marked re-roll follows the unchanged full generation path", async () => {
  const harness = partialHarness([]);
  const result = await generateColdStartAiWorkout(
    {} as never,
    USER_ID,
    "provider/model",
    dependencies({
      ...harness.overrides,
      requestOpenRouterWorkout: (request: ProviderCall) => {
        harness.providerCalls.push(request);
        return Promise.resolve({ ok: true as const, data: { content: "provider-content" } });
      },
    }),
    { version: 1, reroll: { exercises: [mark(P1), mark(U1), mark(L1), mark(C1), mark(P2)] } },
  );
  assert.deepEqual(result, {
    ok: true,
    data: { proposal, metadata: { kind: "cold_start", exerciseCount: proposal.exercises.length } },
  });
  assert.equal(harness.catalogueLoads, 1);
  assert.deepEqual(
    harness.providerCalls[0].allowedExerciseIds,
    partialCatalogue.map(({ id }) => id),
  );
  assert.deepEqual(harness.providerCalls[0].requestedExerciseCount, { min: 5, max: 7 });
});

function historyProfile(ids: readonly string[] = partialCatalogue.map(({ id }) => id)) {
  return () =>
    Promise.resolve({
      ok: true as const,
      data: {
        completions: ids.map((exerciseId) => ({
          exerciseId,
          completedCount: 2,
          lastCompletedAt: "2026-01-01T00:00:00.000Z",
          inLastCompletedWorkout: false,
        })),
        preferences: new Map([[P1.id, "liked" as const]]),
      },
    });
}

function recordingClient() {
  const calls: [string, unknown][] = [];
  let consumed = false;
  return {
    calls,
    client: {
      rpc: (name: string, args: unknown) => {
        calls.push([name, args]);
        if (name === "record_ai_workout_proposal") {
          return Promise.resolve({ data: [{ proposal_id: IDS[2], lineage_id: IDS[3] }], error: null });
        }
        if (name === "consume_ai_reduced_generation_confirmation") {
          if (consumed) return Promise.resolve({ data: null, error: { code: "P0001" } });
          consumed = true;
        }
        return Promise.resolve({ data: null, error: null });
      },
    },
  };
}

function historyDependencies(
  harness: ReturnType<typeof partialHarness>,
  recommend: AiWorkoutGenerationDependencies["recommendHistoryAwareWorkout"] = recommendHistoryAwareWorkout,
  overrides: Partial<AiWorkoutGenerationDependencies> = {},
) {
  return dependencies({
    ...harness.overrides,
    loadColdStartEligibility: () => Promise.resolve({ ok: true, data: "history_aware_not_available" }),
    loadHistoryAwareAiProfile: historyProfile(),
    recommendHistoryAwareWorkout: recommend,
    buildHistoryAwareWorkoutPrompt: () => ({ ok: true, data: { system: "system", user: "shortlist" } }),
    parseHistoryAwareAiWorkoutProposalJson,
    confirmationSecret: "confirmation-secret",
    now: () => NOW,
    ...overrides,
  });
}

void test("history-aware partial re-roll passes fixed and excluded context and records merged ids with lineage", async () => {
  const recommenderInputs: Parameters<typeof recommendHistoryAwareWorkout>[0][] = [];
  const recommend: typeof recommendHistoryAwareWorkout = (input) => {
    recommenderInputs.push(input);
    return recommendHistoryAwareWorkout(input);
  };
  const reroll = {
    exercises: [keep(P1, 5, 5), mark(U1), keep(L1, 2, 20), mark(C1), keep(P2)],
    excludedExerciseIds: [U2.id],
  };
  const merged = [keep(P1, 5, 5), pick(U3), keep(L1, 2, 20), pick(C2), keep(P2)];
  const mergedIds = merged.map(({ exerciseId }) => exerciseId);

  for (const priorProposalId of [IDS[4], undefined]) {
    const harness = partialHarness([pick(U3), pick(C2)]);
    const { client, calls } = recordingClient();
    const command = priorProposalId
      ? { version: 1 as const, priorProposalId, reroll }
      : { version: 1 as const, reroll };
    const result = await generateColdStartAiWorkout(
      client as never,
      USER_ID,
      "provider/model",
      historyDependencies(harness, recommend),
      command,
    );
    assert.ok(result.ok);
    assert.deepEqual(result.data.proposal.exercises, merged);
    assert.deepEqual(result.data.metadata, {
      kind: "history_aware",
      proposalId: IDS[2],
      exerciseCount: 5,
      reduced: false,
      originalExerciseIds: mergedIds,
      preferences: Object.fromEntries(mergedIds.map((id) => [id, id === P1.id ? "liked" : "neutral"])),
    });
    assert.ok(parseAiWorkoutGenerationResponse({ ...result.data, requestId: "request-1" }));
    assert.deepEqual(
      calls,
      priorProposalId
        ? [["record_ai_workout_proposal", { p_exercise_ids: mergedIds, p_rerolled_from_proposal_id: priorProposalId }]]
        : [["record_ai_workout_proposal", { p_exercise_ids: mergedIds }]],
    );
    const [call] = harness.providerCalls;
    for (const removed of [P1, P2, L1, U1, C1, U2]) assert.equal(call.allowedExerciseIds.includes(removed.id), false);
    assert.deepEqual(call.requestedExerciseCount, { min: 2, max: 2 });
  }
  assert.deepEqual(recommenderInputs[0].fixedExerciseIds, [P1.id, L1.id, P2.id]);
  assert.deepEqual(recommenderInputs[0].excludedExerciseIds, [U1.id, C1.id, U2.id]);
});

void test("history-aware partial re-roll rejects over-budget unseen picks as invalid output", async () => {
  const shortlist = [U3, C2].map((item) => ({
    ...item,
    reasons: [item === U3 ? ("never_completed" as const) : ("familiar" as const)],
    familiarityScore: 1,
    similarityScore: 1,
    recovery: { state: "ready" as const, recoveringUntil: null },
  }));
  const recommend = () => ({
    decision: { kind: "normal" as const, requestedExerciseCount: { min: 5 as const, max: 7 as const } },
    readyCandidates: [...shortlist, ...shortlist],
    shortlist,
    feasibleCoverage: ["lower_body" as const, "core" as const, "upper_body_push" as const, "upper_body_pull" as const],
    fixedCoverage: ["lower_body" as const, "upper_body_push" as const],
    accountReadyCount: 9,
    explorationBudget: 0,
    neverCompletedIds: [U3.id],
  });
  const harness = partialHarness([pick(U3), pick(C2)]);
  const { client, calls } = recordingClient();
  const result = await generateHistoryAwareAiWorkout(
    client as never,
    USER_ID,
    "provider/model",
    { version: 1, reroll: { exercises: [keep(P1), mark(U1), keep(L1), mark(C1), keep(P2)] } },
    historyDependencies(harness, recommend),
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, "invalid_output");
  assert.deepEqual(calls, []);
});

void test("FR-017 gate: an exhausted partial pool with five ready exercises account-wide is not feasible", async () => {
  const harness = partialHarness([]);
  const { client, calls } = recordingClient();
  const result = await generateHistoryAwareAiWorkout(
    client as never,
    USER_ID,
    "provider/model",
    {
      version: 1,
      reroll: {
        exercises: [keep(P1), keep(L1), mark(C1), mark(U1)],
        excludedExerciseIds: [P2.id, P3.id, L2.id, C2.id, U2.id],
      },
    },
    historyDependencies(harness),
  );
  assert.deepEqual(result, {
    ok: false,
    code: "replacement_not_feasible",
    internal: { layer: "service", technicalCode: "REROLL_POOL_TOO_SMALL" },
  });
  assert.deepEqual(calls, []);
  assert.equal(harness.decryptCalls, 0);
  assert.equal(harness.providerCalls.length, 0);
});

void test("history-aware unknown re-roll ids return validation_failed before recommender, decrypt or provider", async () => {
  const harness = partialHarness([]);
  let recommended = 0;
  const result = await generateHistoryAwareAiWorkout(
    recordingClient().client as never,
    USER_ID,
    "provider/model",
    { version: 1, reroll: { exercises: [keep(P1), mark(U1)], excludedExerciseIds: [UNKNOWN_ID] } },
    historyDependencies(harness, (input) => {
      recommended += 1;
      return recommendHistoryAwareWorkout(input);
    }),
  );
  assert.deepEqual(result, {
    ok: false,
    code: "validation_failed",
    internal: { layer: "service", technicalCode: "REROLL_UNKNOWN_EXERCISE" },
  });
  assert.equal(recommended, 0);
  assert.equal(harness.decryptCalls, 0);
  assert.equal(harness.providerCalls.length, 0);
});

void test("history-aware partial reduced confirmation registers, verifies, consumes and rejects stale or cross-mode tokens", async () => {
  // Four exercises are ready account-wide (including the marked one): FR-017 allows the reduced path.
  const readyIds = [P1.id, L1.id, U1.id, U3.id];
  const recommend: typeof recommendHistoryAwareWorkout = (input) =>
    recommendHistoryAwareWorkout({ ...input, catalogue: input.catalogue.filter(({ id }) => readyIds.includes(id)) });
  const reroll = { exercises: [keep(P1), keep(L1), mark(U1)] };
  const harness = partialHarness([pick(U3)]);
  const { client, calls } = recordingClient();
  const deps = historyDependencies(harness, recommend);

  const initial = await generateHistoryAwareAiWorkout(
    client as never,
    USER_ID,
    "provider/model",
    { version: 1, reroll },
    deps,
  );
  assert.ok(!initial.ok);
  assert.equal(initial.code, "confirmation_required");
  assert.ok(initial.confirmation);
  assert.equal(initial.confirmation.availableExerciseCount, 3);
  const token = initial.confirmation.token;
  const expectedFingerprint = await fingerprintPartialReroll({
    candidateIds: [U3.id],
    keptIds: [P1.id, L1.id],
    markedIds: [U1.id],
    excludedIds: [],
  });
  assert.deepEqual(calls[0][0], "register_ai_reduced_generation_confirmation");
  assert.equal((calls[0][1] as { p_candidate_fingerprint: string }).p_candidate_fingerprint, expectedFingerprint);
  assert.equal(harness.decryptCalls, 0);
  assert.equal(harness.providerCalls.length, 0);

  const staleAfterExclusion = await generateHistoryAwareAiWorkout(
    client as never,
    USER_ID,
    "provider/model",
    { version: 1, confirmationToken: token, reroll: { ...reroll, excludedExerciseIds: [U2.id] } },
    deps,
  );
  assert.equal(staleAfterExclusion.ok, false);
  assert.equal(staleAfterExclusion.code, "stale_confirmation");

  const fullToken = await createReducedGenerationConfirmation(
    {
      ownerId: USER_ID,
      candidateFingerprint: await fingerprintCandidates([U3.id]),
      allowedCount: 3,
      expiresAt: NOW.getTime() + 60_000,
      nonce: "12345678-1234-1234-1234-123456789abe",
    },
    "confirmation-secret",
  );
  assert.ok(fullToken);
  const crossMode = await generateHistoryAwareAiWorkout(
    client as never,
    USER_ID,
    "provider/model",
    { version: 1, confirmationToken: fullToken, reroll },
    deps,
  );
  assert.equal(crossMode.ok, false);
  assert.equal(crossMode.code, "stale_confirmation");
  assert.equal(harness.providerCalls.length, 0);
  assert.equal(harness.decryptCalls, 0);

  const confirmed = await generateHistoryAwareAiWorkout(
    client as never,
    USER_ID,
    "provider/model",
    { version: 1, confirmationToken: token, reroll },
    deps,
  );
  assert.ok(confirmed.ok);
  assert.deepEqual(confirmed.data.proposal.exercises, [keep(P1), keep(L1), pick(U3)]);
  assert.equal(confirmed.data.metadata.kind === "history_aware" && confirmed.data.metadata.reduced, true);
  assert.ok(parseAiWorkoutGenerationResponse({ ...confirmed.data, requestId: "request-2" }));
  assert.deepEqual(harness.providerCalls[0].requestedExerciseCount, { min: 1, max: 1 });
  assert.equal(calls.filter(([name]) => name === "consume_ai_reduced_generation_confirmation").length, 1);

  const replay = await generateHistoryAwareAiWorkout(
    client as never,
    USER_ID,
    "provider/model",
    { version: 1, confirmationToken: token, reroll },
    deps,
  );
  assert.equal(replay.ok, false);
  assert.equal(replay.code, "stale_confirmation");
  assert.equal(harness.providerCalls.length, 1);
});

void test("a partial reduced token cannot authorise a full generation", async () => {
  const readyIds = [U3.id, C2.id, L1.id, P1.id];
  const recommend: typeof recommendHistoryAwareWorkout = (input) =>
    recommendHistoryAwareWorkout({
      ...input,
      catalogue: input.catalogue.filter(({ id }) => readyIds.includes(id)),
    });
  const harness = partialHarness([]);
  const partialToken = await createReducedGenerationConfirmation(
    {
      ownerId: USER_ID,
      candidateFingerprint: await fingerprintPartialReroll({
        candidateIds: readyIds,
        keptIds: [],
        markedIds: [],
        excludedIds: [],
      }),
      allowedCount: 4,
      expiresAt: NOW.getTime() + 60_000,
      nonce: "12345678-1234-1234-1234-123456789abf",
    },
    "confirmation-secret",
  );
  assert.ok(partialToken);
  const result = await generateHistoryAwareAiWorkout(
    recordingClient().client as never,
    USER_ID,
    "provider/model",
    { version: 1, confirmationToken: partialToken },
    historyDependencies(harness, recommend),
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, "stale_confirmation");
  assert.equal(harness.providerCalls.length, 0);
});

void test("a confirmation token on a normal-path partial re-roll is rejected before provider use", async () => {
  const harness = partialHarness([pick(U3), pick(C2)]);
  const result = await generateHistoryAwareAiWorkout(
    recordingClient().client as never,
    USER_ID,
    "provider/model",
    {
      version: 1,
      confirmationToken: "stale-token",
      reroll: { exercises: [keep(P1), mark(U1), keep(L1), mark(C1), keep(P2)] },
    },
    historyDependencies(harness),
  );
  assert.deepEqual(result, {
    ok: false,
    code: "stale_confirmation",
    internal: { layer: "service", technicalCode: "REDUCED_NOT_ALLOWED" },
  });
  assert.equal(harness.decryptCalls, 0);
  assert.equal(harness.providerCalls.length, 0);
});
