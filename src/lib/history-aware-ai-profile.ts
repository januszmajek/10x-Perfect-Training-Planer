import type { SupabaseClient } from "@supabase/supabase-js";
import { isCanonicalUuid } from "./manual-workout-builder.ts";
import { verifyOwnedSession, workoutFailure, type WorkoutFailure, type WorkoutResult } from "./planned-workouts.ts";
import type { Database } from "@/types/database.types";

type ProfileClient = SupabaseClient<Database>;

export type AiExercisePreference = "liked" | "dont_suggest";

export interface ExerciseCompletionProfileEntry {
  exerciseId: string;
  completedCount: number;
  lastCompletedAt: string;
  inLastCompletedWorkout: boolean;
}

export interface HistoryAwareAiProfile {
  completions: ExerciseCompletionProfileEntry[];
  preferences: Map<string, AiExercisePreference>;
}

function canonicalTimestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function profileFailure(code: string): WorkoutFailure {
  return workoutFailure("persistence_failed", "service", code);
}

export async function loadExerciseCompletionProfile(
  client: ProfileClient,
  userId: string | null,
): Promise<WorkoutResult<ExerciseCompletionProfileEntry[]>> {
  if (!userId) return workoutFailure("unauthenticated", "service", "AUTH_MISSING");
  const authFailure = await verifyOwnedSession(client, userId);
  if (authFailure) return authFailure;

  const { data, error } = await client.rpc("get_exercise_completion_profile");
  if (error) return workoutFailure("persistence_failed", "database", error.code);

  const seen = new Set<string>();
  const completions: ExerciseCompletionProfileEntry[] = [];
  for (const row of data) {
    const lastCompletedAt = canonicalTimestamp(row.last_completed_at);
    if (
      !isCanonicalUuid(row.exercise_id) ||
      seen.has(row.exercise_id) ||
      !Number.isSafeInteger(row.completed_count) ||
      row.completed_count < 1 ||
      !lastCompletedAt ||
      typeof row.in_last_completed_workout !== "boolean"
    ) {
      return profileFailure("INVALID_COMPLETION_PROFILE");
    }
    seen.add(row.exercise_id);
    completions.push({
      exerciseId: row.exercise_id,
      completedCount: row.completed_count,
      lastCompletedAt,
      inLastCompletedWorkout: row.in_last_completed_workout,
    });
  }

  return { ok: true, data: completions };
}

export async function loadAiExercisePreferences(
  client: ProfileClient,
  userId: string | null,
): Promise<WorkoutResult<Map<string, AiExercisePreference>>> {
  if (!userId) return workoutFailure("unauthenticated", "service", "AUTH_MISSING");
  const authFailure = await verifyOwnedSession(client, userId);
  if (authFailure) return authFailure;

  const { data, error } = await client.rpc("get_ai_exercise_preferences");
  if (error) return workoutFailure("persistence_failed", "database", error.code);

  const preferences = new Map<string, AiExercisePreference>();
  for (const row of data) {
    if (!isCanonicalUuid(row.exercise_id) || preferences.has(row.exercise_id)) {
      return profileFailure("INVALID_EXERCISE_PREFERENCES");
    }
    if (row.preference !== "liked" && row.preference !== "dont_suggest") {
      return profileFailure("INVALID_EXERCISE_PREFERENCES");
    }
    preferences.set(row.exercise_id, row.preference);
  }

  return { ok: true, data: preferences };
}

export async function loadHistoryAwareAiProfile(
  client: ProfileClient,
  userId: string | null,
): Promise<WorkoutResult<HistoryAwareAiProfile>> {
  const completions = await loadExerciseCompletionProfile(client, userId);
  if (!completions.ok) return completions;
  const preferences = await loadAiExercisePreferences(client, userId);
  if (!preferences.ok) return preferences;
  return { ok: true, data: { completions: completions.data, preferences: preferences.data } };
}
