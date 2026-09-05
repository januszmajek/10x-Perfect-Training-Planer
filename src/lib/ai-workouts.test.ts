import assert from "node:assert/strict";
import test from "node:test";
import { generateColdStartAiWorkout, type AiWorkoutGenerationDependencies } from "./ai-workouts.ts";
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
  assert.deepEqual(result, { ok: true, data: { proposal } });
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
