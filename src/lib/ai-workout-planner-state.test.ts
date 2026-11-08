import assert from "node:assert/strict";
import test from "node:test";
import {
  applyAiGenerationResponse,
  buildAiGenerationCommand,
  getAiButtonState,
  getAiPlannerRecoveryAction,
  getAiWorkoutDraftInteraction,
  getGenerationFailureHeadline,
  nextRerollExclusions,
  pruneRerollExclusions,
  pruneRerollSelection,
} from "./ai-workout-planner-state.ts";
import { parseAiWorkoutGenerationCommand } from "./ai-workout-client.ts";

const existingDraft = [
  { exerciseId: "00000000-0000-0000-0000-000000000001", sets: 4, reps: 6 },
  { exerciseId: "00000000-0000-0000-0000-000000000002", sets: 3, reps: 10 },
];
const replacementDraft = Array.from({ length: 5 }, (_, index) => ({
  exerciseId: `00000000-0000-0000-0000-${String(index + 3).padStart(12, "0")}`,
  sets: 3,
  reps: 8,
}));

void test("keeps the current proposal and its edits after a failed generation", () => {
  assert.deepEqual(applyAiGenerationResponse(existingDraft, { ok: false, code: "timeout", requestId: "request-1" }), {
    draft: existingDraft,
    code: "timeout",
    requestId: "request-1",
    activeProposal: null,
  });
});

void test("preserves the exact edited draft and history-aware proposal for every failed parsed response", () => {
  const activeProposal = {
    kind: "history_aware" as const,
    proposalId: "00000000-0000-0000-0000-000000000099",
    exerciseCount: existingDraft.length,
    reduced: false,
    originalExerciseIds: existingDraft.map(({ exerciseId }) => exerciseId),
    preferences: Object.fromEntries(existingDraft.map(({ exerciseId }) => [exerciseId, "neutral" as const])),
  };
  const failures = [
    null,
    { ok: false as const, code: "invalid_output" as const, requestId: "request-invalid" },
    { ok: false as const, code: "provider_unavailable" as const, requestId: "request-provider" },
    { ok: false as const, code: "timeout" as const, requestId: "request-timeout" },
  ];

  for (const failure of failures) {
    const transition = applyAiGenerationResponse(existingDraft, failure, activeProposal);
    assert.strictEqual(transition.draft, existingDraft);
    assert.strictEqual(transition.activeProposal, activeProposal);
    assert.equal(transition.code, failure?.code ?? "invalid_output");
  }
});

void test("replaces a proposal only after a validated generation response", () => {
  assert.deepEqual(
    applyAiGenerationResponse(existingDraft, {
      ok: true,
      data: {
        proposal: { exercises: replacementDraft },
        metadata: { kind: "cold_start", exerciseCount: replacementDraft.length },
        requestId: "request-2",
      },
    }),
    { draft: replacementDraft, code: null, requestId: "request-2", activeProposal: null },
  );
});

void test("retains a history-aware proposal through failed requests and replaces it only on success", () => {
  const activeProposal = {
    kind: "history_aware" as const,
    proposalId: "00000000-0000-0000-0000-000000000099",
    exerciseCount: existingDraft.length,
    reduced: false,
    originalExerciseIds: existingDraft.map(({ exerciseId }) => exerciseId),
    preferences: Object.fromEntries(existingDraft.map(({ exerciseId }) => [exerciseId, "neutral" as const])),
  };
  assert.deepEqual(
    applyAiGenerationResponse(existingDraft, { ok: false, code: "timeout", requestId: "request-3" }, activeProposal)
      .activeProposal,
    activeProposal,
  );
  assert.equal(
    applyAiGenerationResponse(existingDraft, {
      ok: true,
      data: {
        proposal: { exercises: replacementDraft },
        metadata: {
          ...activeProposal,
          proposalId: "00000000-0000-0000-0000-000000000100",
          exerciseCount: 5,
          originalExerciseIds: replacementDraft.map(({ exerciseId }) => exerciseId),
          preferences: Object.fromEntries(replacementDraft.map(({ exerciseId }) => [exerciseId, "liked" as const])),
        },
        requestId: "request-4",
      },
    }).activeProposal?.proposalId,
    "00000000-0000-0000-0000-000000000100",
  );
});

void test("maps typed failures to safe recovery actions", () => {
  assert.equal(getAiPlannerRecoveryAction("key_not_configured"), "account");
  assert.equal(getAiPlannerRecoveryAction("key_rejected"), "account");
  assert.equal(getAiPlannerRecoveryAction("key_encryption_unavailable"), "none");
  assert.equal(getAiPlannerRecoveryAction("rate_limited"), "retry");
  assert.equal(getAiPlannerRecoveryAction("history_aware_not_available"), "manual");
  assert.equal(getAiPlannerRecoveryAction("replacement_not_feasible"), "manual");
});

void test("emits removal and swap telemetry only for an original proposal exercise", () => {
  const originalExerciseId = "00000000-0000-0000-0000-000000000001";
  const manualExerciseId = "00000000-0000-0000-0000-000000000099";
  const originalIds = new Set([originalExerciseId]);
  assert.deepEqual(getAiWorkoutDraftInteraction(originalIds, { type: "remove", exerciseId: originalExerciseId }), {
    type: "remove",
    exerciseId: originalExerciseId,
  });
  assert.deepEqual(
    getAiWorkoutDraftInteraction(originalIds, {
      type: "swap",
      exerciseId: originalExerciseId,
      replacementExerciseId: manualExerciseId,
    }),
    { type: "swap", exerciseId: originalExerciseId, replacementExerciseId: manualExerciseId },
  );
  assert.equal(getAiWorkoutDraftInteraction(originalIds, { type: "remove", exerciseId: manualExerciseId }), null);
});

const uuid = (number: number) => `00000000-0000-0000-0000-${String(number).padStart(12, "0")}`;
const draftOf = (count: number, start = 1) =>
  Array.from({ length: count }, (_, index) => ({ exerciseId: uuid(start + index), sets: 3, reps: 10 }));
const selectFirst = (draft: { exerciseId: string }[], count: number) =>
  new Set(draft.slice(0, count).map(({ exerciseId }) => exerciseId));

void test("AI button generates on an empty draft and requires a configured key", () => {
  assert.deepEqual(getAiButtonState({ draft: [], selectedIds: new Set(), credentialConfigured: true }), {
    mode: "initial",
    label: "Generate workout",
    enabled: true,
    hint: null,
    keptCount: 0,
  });
  assert.equal(getAiButtonState({ draft: [], selectedIds: new Set(), credentialConfigured: false }).enabled, false);
});

void test("AI button replaces selected exercises on a non-empty draft and is disabled until something is marked", () => {
  const draft = draftOf(5);
  const none = getAiButtonState({ draft, selectedIds: new Set(), credentialConfigured: true });
  assert.deepEqual(none, {
    mode: "replace",
    label: "Replace selected",
    enabled: false,
    hint: "mark_to_replace",
    keptCount: 5,
  });
  const two = getAiButtonState({ draft, selectedIds: selectFirst(draft, 2), credentialConfigured: true });
  assert.deepEqual(two, { mode: "replace", label: "Replace selected (2)", enabled: true, hint: null, keptCount: 3 });
  const noKey = getAiButtonState({ draft, selectedIds: selectFirst(draft, 2), credentialConfigured: false });
  assert.equal(noKey.enabled, false);
  assert.equal(noKey.hint, null);
  // Ids that are not in the draft do not count.
  assert.equal(
    getAiButtonState({ draft, selectedIds: new Set([uuid(99)]), credentialConfigured: true }).label,
    "Replace selected",
  );
});

void test("AI button enforces kept and slot limits on partial replacement but not on a full re-roll", () => {
  const eight = draftOf(8);
  assert.equal(
    getAiButtonState({ draft: eight, selectedIds: selectFirst(eight, 1), credentialConfigured: true }).hint,
    "too_many_kept",
  );
  const all = getAiButtonState({ draft: eight, selectedIds: selectFirst(eight, 8), credentialConfigured: true });
  assert.deepEqual([all.enabled, all.hint, all.label], [true, null, "Replace selected (8)"]);
  const twenty = draftOf(20);
  assert.equal(
    getAiButtonState({ draft: twenty, selectedIds: selectFirst(twenty, 20), credentialConfigured: true }).enabled,
    true,
  );

  const seven = draftOf(7);
  assert.equal(
    getAiButtonState({ draft: seven, selectedIds: selectFirst(seven, 5), credentialConfigured: true }).enabled,
    true,
  );
  assert.equal(
    getAiButtonState({ draft: seven, selectedIds: selectFirst(seven, 1), credentialConfigured: true }).enabled,
    true,
  );

  const ten = draftOf(10);
  const tooMany = getAiButtonState({ draft: ten, selectedIds: selectFirst(ten, 6), credentialConfigured: true });
  assert.deepEqual([tooMany.enabled, tooMany.hint, tooMany.keptCount], [false, "marked_exceeds_slots", 4]);
  assert.equal(
    getAiButtonState({ draft: ten, selectedIds: selectFirst(ten, 4), credentialConfigured: true }).hint,
    "marked_exceeds_slots",
  );
  assert.equal(
    getAiButtonState({ draft: ten, selectedIds: selectFirst(ten, 3), credentialConfigured: true }).hint,
    "too_many_kept",
  );
});

void test("AI button requires valid kept prescriptions but ignores marked ones", () => {
  const draft = draftOf(5);
  draft[4] = { ...draft[4], sets: Number.NaN };
  assert.equal(
    getAiButtonState({ draft, selectedIds: selectFirst(draft, 1), credentialConfigured: true }).hint,
    "invalid_kept_prescription",
  );
  const markedInvalid = new Set([draft[4].exerciseId]);
  assert.equal(getAiButtonState({ draft, selectedIds: markedInvalid, credentialConfigured: true }).enabled, true);
  draft[3] = { ...draft[3], reps: 1000 };
  assert.equal(
    getAiButtonState({ draft, selectedIds: markedInvalid, credentialConfigured: true }).hint,
    "invalid_kept_prescription",
  );
});

void test("generation command for an empty draft keeps the active proposal for lineage", () => {
  assert.deepEqual(
    buildAiGenerationCommand({ draft: [], selectedIds: new Set(), excludedIds: [uuid(50)], activeProposal: null }),
    {
      version: 1,
    },
  );
  assert.deepEqual(
    buildAiGenerationCommand({
      draft: [],
      selectedIds: new Set(),
      excludedIds: [],
      activeProposal: { proposalId: uuid(90) },
    }),
    { version: 1, priorProposalId: uuid(90) },
  );
});

void test("generation command for an all-marked draft is a full re-roll without exclusions", () => {
  const draft = draftOf(3);
  const command = buildAiGenerationCommand({
    draft,
    selectedIds: selectFirst(draft, 3),
    excludedIds: [uuid(50)],
    activeProposal: { proposalId: uuid(90) },
  });
  assert.deepEqual(command, {
    version: 1,
    priorProposalId: uuid(90),
    reroll: { exercises: draft.map(({ exerciseId }) => ({ exerciseId, replace: true })) },
  });
  assert.deepEqual(parseAiWorkoutGenerationCommand(JSON.parse(JSON.stringify(command))), command);
});

void test("generation command for a partial re-roll keeps draft order, edited prescriptions and pruned exclusions", () => {
  const draft = draftOf(5);
  draft[0] = { ...draft[0], sets: 4, reps: 12 };
  const selectedIds = new Set([draft[1].exerciseId, draft[3].exerciseId]);
  const command = buildAiGenerationCommand({
    draft,
    selectedIds,
    excludedIds: [uuid(50), draft[2].exerciseId, uuid(51)],
    activeProposal: null,
  });
  assert.deepEqual(command, {
    version: 1,
    reroll: {
      exercises: [
        { exerciseId: uuid(1), sets: 4, reps: 12 },
        { exerciseId: uuid(2), replace: true },
        { exerciseId: uuid(3), sets: 3, reps: 10 },
        { exerciseId: uuid(4), replace: true },
        { exerciseId: uuid(5), sets: 3, reps: 10 },
      ],
      excludedExerciseIds: [uuid(50), uuid(51)],
    },
  });
  assert.deepEqual(parseAiWorkoutGenerationCommand(JSON.parse(JSON.stringify(command))), command);
  const withoutExclusions = buildAiGenerationCommand({
    draft,
    selectedIds,
    excludedIds: [],
    activeProposal: { proposalId: uuid(90) },
  });
  assert.deepEqual(Object.keys(withoutExclusions?.reroll ?? {}), ["exercises"]);
  assert.equal(withoutExclusions?.priorProposalId, uuid(90));
  assert.equal(
    buildAiGenerationCommand({ draft, selectedIds: new Set(), excludedIds: [], activeProposal: null }),
    null,
  );
});

void test("exclusions accumulate on partial success, cap at twenty oldest-first and reset otherwise", () => {
  const draft = draftOf(5);
  const partial = buildAiGenerationCommand({
    draft,
    selectedIds: selectFirst(draft, 2),
    excludedIds: [],
    activeProposal: null,
  });
  assert.ok(partial);
  const previous = [uuid(50), uuid(51)];
  assert.deepEqual(nextRerollExclusions({ previous, command: partial, mergedIds: [uuid(60)] }), [
    uuid(50),
    uuid(51),
    uuid(1),
    uuid(2),
  ]);

  const full = Array.from({ length: 19 }, (_, index) => uuid(100 + index));
  assert.deepEqual(nextRerollExclusions({ previous: full, command: partial, mergedIds: [] }), [
    ...full.slice(1),
    uuid(1),
    uuid(2),
  ]);

  const allMarked = buildAiGenerationCommand({
    draft,
    selectedIds: selectFirst(draft, 5),
    excludedIds: [],
    activeProposal: null,
  });
  assert.ok(allMarked);
  assert.deepEqual(nextRerollExclusions({ previous, command: allMarked, mergedIds: [] }), []);
  assert.deepEqual(nextRerollExclusions({ previous, command: { version: 1 }, mergedIds: [] }), []);
});

void test("selection and exclusions are pruned against the draft and exclusions reset on an empty draft", () => {
  const draft = draftOf(3);
  assert.deepEqual([...pruneRerollSelection(new Set([uuid(2), uuid(9)]), draft)], [uuid(2)]);
  assert.deepEqual(pruneRerollExclusions([uuid(9), uuid(3), uuid(8)], draft), [uuid(9), uuid(8)]);
  assert.deepEqual(pruneRerollExclusions([uuid(9)], []), []);
});

void test("failure headlines are short and code-specific", () => {
  assert.equal(getGenerationFailureHeadline("invalid_output"), "The AI returned an unbalanced workout");
  assert.equal(getGenerationFailureHeadline("replacement_not_feasible"), "No eligible replacements");
  assert.equal(getGenerationFailureHeadline("persistence_failed"), "Workout generation failed");
});
