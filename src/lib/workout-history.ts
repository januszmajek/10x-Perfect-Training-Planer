import type { SupabaseClient } from "@supabase/supabase-js";
import {
  encodeWorkoutHistoryCursor,
  isCompletedWorkoutHistoryEntry,
  WORKOUT_HISTORY_PAGE_SIZE,
  type CompletedWorkoutHistoryEntry,
  type MuscleOption,
  type WorkoutHistoryCursor,
  type WorkoutHistoryFilters,
  type WorkoutHistoryPage,
} from "@/lib/workout-history-client";
import { verifyOwnedSession, workoutFailure, type WorkoutFailure, type WorkoutResult } from "@/lib/planned-workouts";
import type { Database } from "@/types/database.types";

type WorkoutClient = SupabaseClient<Database>;

interface HistoryMembership {
  id: string;
  completedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toCanonicalTimestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const timestamp = new Date(value);
  return Number.isFinite(timestamp.getTime()) ? timestamp.toISOString() : null;
}

function asHistoryMembership(value: unknown): HistoryMembership | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  const completedAt = toCanonicalTimestamp(value.completed_at);
  return completedAt ? { id: value.id, completedAt } : null;
}

function mapHistoryDetail(value: unknown): CompletedWorkoutHistoryEntry | null {
  if (!isRecord(value) || !Array.isArray(value.workout_exercises)) return null;
  const exercises = [];

  for (const item of value.workout_exercises) {
    if (!isRecord(item) || !isRecord(item.exercises) || !Array.isArray(item.exercises.exercise_muscle_groups))
      return null;
    const muscles = [];
    for (const tag of item.exercises.exercise_muscle_groups) {
      if (!isRecord(tag) || !isRecord(tag.muscle_groups)) return null;
      muscles.push({ code: tag.muscle_group_code, name: tag.muscle_groups.name, role: tag.role });
    }
    exercises.push({
      exerciseId: item.exercise_id,
      name: item.exercises.name,
      position: item.position,
      sets: item.sets,
      reps: item.reps,
      muscles,
    });
  }

  const mapped = {
    id: value.id,
    origin: value.origin,
    createdAt: toCanonicalTimestamp(value.created_at),
    completedAt: toCanonicalTimestamp(value.completed_at),
    exercises: exercises.sort((left, right) => left.position - right.position),
  };
  return isCompletedWorkoutHistoryEntry(mapped) ? mapped : null;
}

function historyFailure(technicalCode: string): WorkoutFailure {
  return workoutFailure("persistence_failed", "service", technicalCode);
}

export async function loadHistoryMuscleOptions(
  client: WorkoutClient,
  userId: string,
): Promise<WorkoutResult<MuscleOption[]>> {
  const authFailure = await verifyOwnedSession(client, userId);
  if (authFailure) return authFailure;

  const { data, error } = await client
    .from("muscle_groups")
    .select("code,name")
    .order("name", { ascending: true })
    .limit(100);
  if (error) return workoutFailure("persistence_failed", "database", error.code);
  if (
    data.some((option) => typeof option.code !== "string" || typeof option.name !== "string" || !option.name.trim())
  ) {
    return historyFailure("INVALID_MUSCLE_OPTION");
  }

  return { ok: true, data };
}

export async function loadCompletedWorkoutHistory(
  client: WorkoutClient,
  userId: string,
  filters: WorkoutHistoryFilters,
  cursor: WorkoutHistoryCursor | null = null,
): Promise<WorkoutResult<WorkoutHistoryPage>> {
  const authFailure = await verifyOwnedSession(client, userId);
  if (authFailure) return authFailure;

  const select = filters.muscles.length
    ? "id,completed_at,workout_exercises!inner(exercises!inner(exercise_muscle_groups!inner(muscle_group_code)))"
    : "id,completed_at";
  let query = client
    .from("workouts")
    .select(select)
    .eq("user_id", userId)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(WORKOUT_HISTORY_PAGE_SIZE + 1);

  if (filters.completedFrom) query = query.gte("completed_at", filters.completedFrom);
  if (filters.completedBefore) query = query.lt("completed_at", filters.completedBefore);
  if (filters.muscles.length) {
    query = query.in("workout_exercises.exercises.exercise_muscle_groups.muscle_group_code", filters.muscles);
  }
  if (cursor) {
    query = query.or(
      `completed_at.lt.${cursor.completedAt},and(completed_at.eq.${cursor.completedAt},id.lt.${cursor.id})`,
    );
  }

  const { data: rawMembership, error: membershipError } = await query;
  if (membershipError) return workoutFailure("persistence_failed", "database", membershipError.code);
  const membership = (rawMembership as unknown[]).map(asHistoryMembership);
  if (membership.some((item) => item === null)) return historyFailure("INVALID_MEMBERSHIP_ROW");

  const ordered = membership as HistoryMembership[];
  if (new Set(ordered.map((item) => item.id)).size !== ordered.length) return historyFailure("DUPLICATE_MEMBERSHIP");
  const pageMembership = ordered.slice(0, WORKOUT_HISTORY_PAGE_SIZE);
  if (pageMembership.length === 0) return { ok: true, data: { entries: [], nextCursor: null } };

  const { data: rawDetails, error: detailError } = await client
    .from("workouts")
    .select(
      "id,origin,created_at,completed_at,workout_exercises(exercise_id,position,sets,reps,exercises(name,exercise_muscle_groups(muscle_group_code,role,muscle_groups(name))))",
    )
    .eq("user_id", userId)
    .eq("status", "completed")
    .in(
      "id",
      pageMembership.map((item) => item.id),
    );
  if (detailError) return workoutFailure("persistence_failed", "database", detailError.code);

  const details = new Map<string, CompletedWorkoutHistoryEntry>();
  for (const rawDetail of rawDetails as unknown[]) {
    const detail = mapHistoryDetail(rawDetail);
    if (!detail || details.has(detail.id)) return historyFailure("INVALID_DETAIL_ROW");
    details.set(detail.id, detail);
  }
  if (details.size !== pageMembership.length) return historyFailure("MISSING_DETAIL_ROW");

  const entries: CompletedWorkoutHistoryEntry[] = [];
  for (const member of pageMembership) {
    const detail = details.get(member.id);
    if (detail?.completedAt !== member.completedAt) return historyFailure("DETAIL_MEMBERSHIP_MISMATCH");
    entries.push(detail);
  }

  const nextCursor =
    ordered.length > WORKOUT_HISTORY_PAGE_SIZE
      ? encodeWorkoutHistoryCursor({
          completedAt: pageMembership[WORKOUT_HISTORY_PAGE_SIZE - 1].completedAt,
          id: pageMembership[WORKOUT_HISTORY_PAGE_SIZE - 1].id,
        })
      : null;
  if (ordered.length > WORKOUT_HISTORY_PAGE_SIZE && !nextCursor) return historyFailure("INVALID_NEXT_CURSOR");

  return { ok: true, data: { entries, nextCursor } };
}
