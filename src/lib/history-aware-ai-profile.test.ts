import assert from "node:assert/strict";
import test from "node:test";
import { loadAiExercisePreferences, loadExerciseCompletionProfile } from "./history-aware-ai-profile.ts";

const USER_ID = "00000000-0000-0000-0000-000000000001";
const EXERCISE_ID = "00000000-0000-0000-0000-000000000101";

function client(rpcData: Record<string, unknown>, rpcError: { code: string } | null = null) {
  return {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: USER_ID } }, error: null }) },
    rpc: (name: string) => Promise.resolve({ data: rpcData[name], error: rpcError }),
  };
}

void test("maps a compact completion aggregate without raw workout details", async () => {
  const result = await loadExerciseCompletionProfile(
    client({
      get_exercise_completion_profile: [
        { exercise_id: EXERCISE_ID, completed_count: 2, last_completed_at: "2026-09-01T12:00:00Z", in_last_completed_workout: true },
      ],
    }) as never,
    USER_ID,
  );

  assert.deepEqual(result, {
    ok: true,
    data: [{ exerciseId: EXERCISE_ID, completedCount: 2, lastCompletedAt: "2026-09-01T12:00:00.000Z", inLastCompletedWorkout: true }],
  });
});

void test("rejects malformed aggregate and preference rows as sanitized persistence failures", async () => {
  const malformedProfile = await loadExerciseCompletionProfile(
    client({ get_exercise_completion_profile: [{ exercise_id: EXERCISE_ID, completed_count: 0, last_completed_at: "bad", in_last_completed_workout: true }] }) as never,
    USER_ID,
  );
  assert.deepEqual(malformedProfile, { ok: false, code: "persistence_failed", internal: { layer: "service", technicalCode: "INVALID_COMPLETION_PROFILE" } });

  const malformedPreferences = await loadAiExercisePreferences(
    client({ get_ai_exercise_preferences: [{ exercise_id: EXERCISE_ID, preference: "other" }] }) as never,
    USER_ID,
  );
  assert.deepEqual(malformedPreferences, { ok: false, code: "persistence_failed", internal: { layer: "service", technicalCode: "INVALID_EXERCISE_PREFERENCES" } });
});

void test("maps explicit preferences and preserves authentication checks", async () => {
  const preferences = await loadAiExercisePreferences(
    client({ get_ai_exercise_preferences: [{ exercise_id: EXERCISE_ID, preference: "dont_suggest" }] }) as never,
    USER_ID,
  );
  assert.deepEqual(preferences, { ok: true, data: new Map([[EXERCISE_ID, "dont_suggest"]]) });

  const missing = await loadAiExercisePreferences(client({}) as never, null);
  assert.deepEqual(missing, { ok: false, code: "unauthenticated", internal: { layer: "service", technicalCode: "AUTH_MISSING" } });
});
