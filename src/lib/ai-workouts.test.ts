import assert from "node:assert/strict";
import test from "node:test";
import {
  generateColdStartAiWorkout,
  generateHistoryAwareAiWorkout,
  saveAiPlannedWorkout,
  type AiWorkoutGenerationDependencies,
} from "./ai-workouts.ts";
import { aiGenerationFailureResponse } from "./ai-workout-api.ts";
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

void test("routes initial history-aware proposal recording through the two-argument RPC overload", async () => {
  const calls: unknown[] = [];
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
  assert.deepEqual(calls, [["record_ai_workout_proposal", { p_exercise_ids: IDS, p_rerolled_from_proposal_id: null }]]);
});

void test("short-circuits missing model, credential, and catalogue prerequisites before provider use", async () => {
  let providerCalls = 0;
  const provider = () => {
    providerCalls += 1;
    return Promise.resolve({ ok: true, data: { content: "provider-content" } });
  };

  const missingModel = await generateColdStartAiWorkout(
    {} as never,
    USER_ID,
    undefined,
    dependencies({ requestOpenRouterWorkout: provider }),
  );
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
      { requestOpenRouterWorkout: () => Promise.resolve({ ok: false, code: "invalid_credential" }) },
      "key_rejected",
    ],
    [
      "rate limit",
      { requestOpenRouterWorkout: () => Promise.resolve({ ok: false, code: "rate_limited" }) },
      "rate_limited",
    ],
    ["timeout", { requestOpenRouterWorkout: () => Promise.resolve({ ok: false, code: "timeout" }) }, "timeout"],
    [
      "provider failure",
      { requestOpenRouterWorkout: () => Promise.resolve({ ok: false, code: "network_failure" }) },
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
      assert.equal(result.code, expectedCode);
    });
  }
});

function saveRequest(replaceExisting = false) {
  return {
    version: 1 as const,
    replaceExisting,
    expectedWorkoutId: replaceExisting ? IDS[0] : null,
    expectedRevision: replaceExisting ? 1 : null,
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
