import assert from "node:assert/strict";
import test from "node:test";
import {
  coverageOf,
  mergePartialReroll,
  parsePartialRerollPicksJson,
  planPartialReroll,
  type PartialRerollPicksContext,
  type PartialRerollPlanInput,
} from "./ai-workout-partial-reroll.ts";
import { recommendHistoryAwareWorkout, type RecommendationCoverage } from "./ai-workout-recommender.ts";
import type { CatalogueExercise } from "./manual-workout-builder.ts";

const id = (number: number) => `00000000-0000-0000-0000-${String(number).padStart(12, "0")}`;
const exercise = (
  number: number,
  category: "upper_body" | "lower_body" | "core",
  pattern: "push" | "pull" | null = null,
): CatalogueExercise => ({
  id: id(number),
  name: `Exercise ${number}`,
  equipment: "barbell",
  movementPattern: pattern,
  muscles: [{ code: `muscle-${number}`, name: `Muscle ${number}`, category, role: "primary", recoveryHours: 48 }],
});

const plan = (overrides: Partial<PartialRerollPlanInput>) =>
  planPartialReroll({
    mode: "history_aware",
    keptCount: 4,
    markedCount: 1,
    poolCount: 10,
    pickableCount: 7,
    accountReadyCount: 20,
    missingCoverageCount: 0,
    missingCoverageFeasible: true,
    ...overrides,
  });

void test("planner sweep keeps every normal plan within merged 5-7 and the pickable pool", () => {
  for (const mode of ["cold_start", "history_aware"] as const) {
    for (let keptCount = 1; keptCount <= 6; keptCount += 1) {
      for (let poolCount = 0; poolCount <= 8; poolCount += 1) {
        for (let pickableCount = 0; pickableCount <= poolCount; pickableCount += 1) {
          for (let markedCount = 1; markedCount <= 7; markedCount += 1) {
            const result = planPartialReroll({
              mode,
              keptCount,
              markedCount,
              poolCount,
              pickableCount,
              accountReadyCount: poolCount + markedCount,
              missingCoverageCount: 0,
              missingCoverageFeasible: true,
            });
            if (pickableCount === 0) {
              assert.deepEqual(result, { kind: "not_feasible", reason: "no_candidates" });
              continue;
            }
            if (result.kind === "normal") {
              const { min, max } = result.newCount;
              assert.ok(min >= 1 && min <= max && max <= pickableCount);
              assert.ok(keptCount + min >= 5 && keptCount + max <= 7);
              assert.ok(keptCount + poolCount >= 5);
            } else if (result.kind === "reduced_confirmation_required") {
              assert.equal(mode, "history_aware");
              assert.equal(result.mergedSize, keptCount + pickableCount);
              assert.ok(result.mergedSize >= 3 && result.mergedSize <= 4);
            } else {
              const floor = Math.max(1, 5 - keptCount);
              const ceil = Math.min(7 - keptCount, pickableCount);
              assert.ok(keptCount + poolCount < 5 || ceil < floor);
            }
          }
        }
      }
    }
  }
});

void test("planner replaces one-for-one by default and widens only for missing coverage", () => {
  assert.deepEqual(plan({ keptCount: 4, markedCount: 1 }), { kind: "normal", newCount: { min: 1, max: 1 } });
  assert.deepEqual(plan({ keptCount: 6, markedCount: 1 }), { kind: "normal", newCount: { min: 1, max: 1 } });
  assert.deepEqual(plan({ keptCount: 1, markedCount: 1 }), { kind: "normal", newCount: { min: 4, max: 4 } });
  assert.deepEqual(plan({ keptCount: 4, markedCount: 1, missingCoverageCount: 2 }), {
    kind: "normal",
    newCount: { min: 1, max: 2 },
  });
  assert.deepEqual(plan({ keptCount: 2, markedCount: 3 }), { kind: "normal", newCount: { min: 3, max: 3 } });
});

void test("planner caps picks at the pickable shortlist so the requested count is always pickable", () => {
  assert.deepEqual(plan({ keptCount: 1, markedCount: 6, poolCount: 9, pickableCount: 5 }), {
    kind: "normal",
    newCount: { min: 5, max: 5 },
  });
  // r > ceil: marked slots beyond the ceiling are dropped by the merge.
  assert.deepEqual(plan({ keptCount: 3, markedCount: 6, poolCount: 9, pickableCount: 9 }), {
    kind: "normal",
    newCount: { min: 4, max: 4 },
  });
});

void test("planner reports infeasible plans with sanitized reasons", () => {
  assert.deepEqual(plan({ pickableCount: 0, poolCount: 0 }), { kind: "not_feasible", reason: "no_candidates" });
  assert.deepEqual(plan({ keptCount: 6, missingCoverageCount: 2 }), {
    kind: "not_feasible",
    reason: "coverage_unreachable",
  });
  // ceil < floor: one kept exercise but only three pickable candidates while five are ready account-wide.
  assert.deepEqual(plan({ keptCount: 1, markedCount: 4, poolCount: 10, pickableCount: 3 }), {
    kind: "not_feasible",
    reason: "pool_too_small",
  });
  assert.deepEqual(
    plan({
      mode: "cold_start",
      keptCount: 3,
      markedCount: 2,
      poolCount: 40,
      pickableCount: 40,
      accountReadyCount: undefined,
      missingCoverageCount: 1,
      missingCoverageFeasible: false,
    }),
    { kind: "not_feasible", reason: "coverage_unreachable" },
  );
  assert.deepEqual(
    plan({ mode: "cold_start", keptCount: 1, markedCount: 1, poolCount: 2, pickableCount: 2, accountReadyCount: 3 }),
    { kind: "not_feasible", reason: "pool_too_small" },
  );
  assert.deepEqual(plan({ keptCount: 1, markedCount: 1, poolCount: 1, pickableCount: 1, accountReadyCount: 2 }), {
    kind: "not_feasible",
    reason: "pool_too_small",
  });
});

void test("planner FR-017 gate allows the reduced path only while fewer than five are ready account-wide", () => {
  assert.deepEqual(plan({ keptCount: 2, markedCount: 2, poolCount: 2, pickableCount: 2, accountReadyCount: 4 }), {
    kind: "reduced_confirmation_required",
    mergedSize: 4,
    newCount: { min: 2, max: 2 },
  });
  assert.deepEqual(plan({ keptCount: 2, markedCount: 1, poolCount: 1, pickableCount: 1, accountReadyCount: 3 }), {
    kind: "reduced_confirmation_required",
    mergedSize: 3,
    newCount: { min: 1, max: 1 },
  });
  assert.deepEqual(plan({ keptCount: 2, markedCount: 2, poolCount: 2, pickableCount: 2, accountReadyCount: 7 }), {
    kind: "not_feasible",
    reason: "pool_too_small",
  });
  assert.deepEqual(
    plan({ mode: "cold_start", keptCount: 2, markedCount: 2, poolCount: 2, pickableCount: 2, accountReadyCount: 4 }),
    { kind: "not_feasible", reason: "pool_too_small" },
  );
});

void test("partial callers plan from the pool, not the recommender's full-generation decision", () => {
  const catalogue = [
    exercise(1, "upper_body", "push"),
    exercise(2, "upper_body", "pull"),
    exercise(3, "lower_body"),
    exercise(4, "core"),
    exercise(5, "upper_body", "push"),
    exercise(6, "lower_body"),
  ];
  const kept = [id(1), id(2), id(3), id(4)];
  const recommendation = recommendHistoryAwareWorkout({
    catalogue,
    completions: catalogue.map(({ id: exerciseId }) => ({
      exerciseId,
      completedCount: 1,
      lastCompletedAt: "2026-09-01T12:00:00.000Z",
      inLastCompletedWorkout: false,
    })),
    preferences: new Map(),
    now: new Date("2026-09-07T12:00:00.000Z"),
    fixedExerciseIds: kept,
    excludedExerciseIds: [],
  });
  assert.equal(recommendation.decision.kind, "insufficient_recovered_candidates");
  assert.deepEqual(
    planPartialReroll({
      mode: "history_aware",
      keptCount: kept.length,
      markedCount: 1,
      poolCount: recommendation.readyCandidates.length,
      pickableCount: recommendation.shortlist.length,
      accountReadyCount: recommendation.accountReadyCount,
      missingCoverageCount: 0,
      missingCoverageFeasible: true,
    }),
    { kind: "normal", newCount: { min: 1, max: 1 } },
  );
});

const pickCatalogue = [
  exercise(1, "upper_body", "push"),
  exercise(2, "upper_body", "pull"),
  exercise(3, "lower_body"),
  exercise(4, "core"),
  exercise(5, "upper_body", "pull"),
  exercise(6, "lower_body"),
  exercise(7, "core"),
  exercise(8, "upper_body", "push"),
];
const catalogueById = new Map(pickCatalogue.map((item) => [item.id, item]));
const allCoverage: RecommendationCoverage[] = ["lower_body", "core", "upper_body_push", "upper_body_pull"];
// Kept: 1 (push), 3 (lower), 4 (core). Marked: 2 (pull), 8. Excluded: 7. Pool: 5 (pull), 6 (lower).
const pickContext = (overrides: Partial<PartialRerollPicksContext> = {}): PartialRerollPicksContext => ({
  allowedIds: [id(5), id(6)],
  kept: [{ exerciseId: id(1) }, { exerciseId: id(3) }, { exerciseId: id(4) }],
  catalogueById,
  requiredCoverage: allCoverage,
  newCount: { min: 2, max: 2 },
  ...overrides,
});
const picks = (...numbers: number[]) =>
  JSON.stringify({ exercises: numbers.map((number) => ({ exerciseId: id(number), sets: 3, reps: 10 })) });

void test("partial picks validator accepts in-pool picks that restore merged coverage", () => {
  assert.deepEqual(parsePartialRerollPicksJson(picks(5, 6), pickContext()), {
    ok: true,
    data: {
      exercises: [
        { exerciseId: id(5), sets: 3, reps: 10 },
        { exerciseId: id(6), sets: 3, reps: 10 },
      ],
    },
  });
});

void test("partial picks validator rejects kept, marked, excluded, out-of-pool and duplicate ids", () => {
  for (const content of [picks(5, 1), picks(5, 2), picks(5, 7), picks(5, 99), picks(5, 5)]) {
    assert.deepEqual(parsePartialRerollPicksJson(content, pickContext()), { ok: false, code: "invalid_proposal" });
  }
  // Kept ids stay rejected even if a caller mistakenly allows them.
  assert.deepEqual(parsePartialRerollPicksJson(picks(5, 1), pickContext({ allowedIds: [id(1), id(5), id(6)] })), {
    ok: false,
    code: "invalid_proposal",
  });
});

void test("partial picks validator enforces count, shape, bounds and merged coverage", () => {
  assert.deepEqual(parsePartialRerollPicksJson(picks(5), pickContext()), { ok: false, code: "invalid_proposal" });
  assert.deepEqual(parsePartialRerollPicksJson(picks(5, 6), pickContext({ newCount: { min: 1, max: 1 } })), {
    ok: false,
    code: "invalid_proposal",
  });
  assert.deepEqual(
    parsePartialRerollPicksJson(
      JSON.stringify({ exercises: [{ exerciseId: id(5), sets: 0, reps: 10 }] }),
      pickContext({ newCount: { min: 1, max: 2 } }),
    ),
    { ok: false, code: "invalid_proposal" },
  );
  assert.deepEqual(
    parsePartialRerollPicksJson(
      JSON.stringify({ exercises: [{ exerciseId: id(5), sets: 3, reps: 10, note: "x" }] }),
      pickContext({ newCount: { min: 1, max: 2 } }),
    ),
    { ok: false, code: "invalid_proposal" },
  );
  assert.deepEqual(parsePartialRerollPicksJson("{not json", pickContext()), { ok: false, code: "malformed_json" });
  // Merged coverage gap: the pull slot is not restored.
  assert.deepEqual(
    parsePartialRerollPicksJson(picks(6), pickContext({ allowedIds: [id(6)], newCount: { min: 1, max: 1 } })),
    { ok: false, code: "invalid_proposal" },
  );
});

void test("partial picks validator rejects over-budget never-completed picks", () => {
  const context = pickContext({ neverCompletedIds: [id(5), id(6)], explorationBudget: 1 });
  assert.deepEqual(parsePartialRerollPicksJson(picks(5, 6), context), { ok: false, code: "invalid_proposal" });
  assert.equal(parsePartialRerollPicksJson(picks(5, 6), { ...context, explorationBudget: 2 }).ok, true);
  assert.equal(parsePartialRerollPicksJson(picks(5, 6), { ...context, neverCompletedIds: [id(5)] }).ok, true);
});

void test("partial picks validator accepts a single pick covering two missing categories", () => {
  const combo: CatalogueExercise = {
    ...exercise(9, "lower_body"),
    muscles: [
      { code: "glutes", name: "Glutes", category: "lower_body", role: "primary", recoveryHours: 48 },
      { code: "abs", name: "Abs", category: "core", role: "primary", recoveryHours: 48 },
    ],
  };
  assert.deepEqual(coverageOf(combo), ["lower_body", "core"]);
  const result = parsePartialRerollPicksJson(picks(9), {
    allowedIds: [id(9)],
    kept: [{ exerciseId: id(1) }, { exerciseId: id(2) }],
    catalogueById: new Map([...catalogueById, [combo.id, combo]]),
    requiredCoverage: allCoverage,
    newCount: { min: 1, max: 1 },
  });
  assert.equal(result.ok, true);
});

void test("positional merge keeps kept items in place and fills marked slots in model order", () => {
  const items = [
    { exerciseId: id(1), sets: 5, reps: 5 },
    { exerciseId: id(2), replace: true as const },
    { exerciseId: id(3), sets: 4, reps: 12 },
    { exerciseId: id(8), replace: true as const },
  ];
  const newPicks = [
    { exerciseId: id(5), sets: 3, reps: 10 },
    { exerciseId: id(6), sets: 2, reps: 8 },
  ];
  assert.deepEqual(mergePartialReroll(items, newPicks), [
    { exerciseId: id(1), sets: 5, reps: 5 },
    { exerciseId: id(5), sets: 3, reps: 10 },
    { exerciseId: id(3), sets: 4, reps: 12 },
    { exerciseId: id(6), sets: 2, reps: 8 },
  ]);
  // Fewer picks drop trailing marked slots.
  assert.deepEqual(mergePartialReroll(items, newPicks.slice(0, 1)), [
    { exerciseId: id(1), sets: 5, reps: 5 },
    { exerciseId: id(5), sets: 3, reps: 10 },
    { exerciseId: id(3), sets: 4, reps: 12 },
  ]);
  // Extra picks (coverage widening) are appended.
  assert.deepEqual(mergePartialReroll(items, [...newPicks, { exerciseId: id(7), sets: 1, reps: 1 }]), [
    { exerciseId: id(1), sets: 5, reps: 5 },
    { exerciseId: id(5), sets: 3, reps: 10 },
    { exerciseId: id(3), sets: 4, reps: 12 },
    { exerciseId: id(6), sets: 2, reps: 8 },
    { exerciseId: id(7), sets: 1, reps: 1 },
  ]);
});
