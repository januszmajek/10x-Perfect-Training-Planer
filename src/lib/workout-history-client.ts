import { isCanonicalUuid } from "./manual-workout-builder.ts";
import type { MuscleRole } from "./manual-workout-builder.ts";

export const WORKOUT_HISTORY_PAGE_SIZE = 25;
export const MAX_HISTORY_MUSCLES = 16;
export const MAX_HISTORY_CURSOR_LENGTH = 256;
export const WORKOUT_HISTORY_API_PATH = "/api/workouts/history";

const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MUSCLE_CODE_PATTERN = /^[a-z]+(?:_[a-z]+)*$/;
const CANONICAL_UTC_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export type HistoryPreset = "7d" | "30d" | "90d" | "all";

export interface HistoryDateRange {
  start: string;
  end: string;
}

export interface WorkoutHistoryFilters {
  completedFrom?: string;
  completedBefore?: string;
  muscles: string[];
}

export interface WorkoutHistoryCursor {
  completedAt: string;
  id: string;
}

export interface MuscleOption {
  code: string;
  name: string;
}

export interface WorkoutHistoryMuscleTag extends MuscleOption {
  role: MuscleRole;
}

export interface CompletedWorkoutExercise {
  exerciseId: string;
  name: string;
  position: number;
  sets: number;
  reps: number;
  muscles: WorkoutHistoryMuscleTag[];
}

export interface CompletedWorkoutHistoryEntry {
  id: string;
  origin: "manual" | "ai";
  createdAt: string;
  completedAt: string;
  exercises: CompletedWorkoutExercise[];
}

export interface WorkoutHistoryPage {
  entries: CompletedWorkoutHistoryEntry[];
  nextCursor: string | null;
}

export type HistorySearchParseResult =
  | { valid: true; filters: WorkoutHistoryFilters; cursor: string | null; normalized: boolean }
  | { valid: false };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  return Object.keys(value).sort().join("\0") === [...expected].sort().join("\0");
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function toLocalDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseLocalDate(value: string): Date | null {
  if (!LOCAL_DATE_PATTERN.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);
  return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day ? parsed : null;
}

function isCanonicalUtcInstant(value: unknown): value is string {
  if (typeof value !== "string" || !CANONICAL_UTC_INSTANT_PATTERN.test(value)) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}

function isMuscleCode(value: unknown): value is string {
  return typeof value === "string" && MUSCLE_CODE_PATTERN.test(value);
}

function canonicalMuscles(muscles: readonly string[]): string[] | null {
  if (muscles.length > MAX_HISTORY_MUSCLES || muscles.some((muscle) => !isMuscleCode(muscle))) return null;
  const sorted = [...new Set(muscles)].sort();
  return sorted;
}

export function emptyWorkoutHistoryFilters(): WorkoutHistoryFilters {
  return { muscles: [] };
}

export function historyPresetRange(preset: HistoryPreset, now = new Date()): HistoryDateRange | null {
  if (preset === "all") return null;
  const days = preset === "7d" ? 7 : preset === "30d" ? 30 : 90;
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  return { start: toLocalDate(start), end: toLocalDate(end) };
}

export function localDateRangeToHistoryFilters(
  range: HistoryDateRange,
  muscles: readonly string[] = [],
): WorkoutHistoryFilters | null {
  const start = parseLocalDate(range.start);
  const end = parseLocalDate(range.end);
  const canonical = canonicalMuscles(muscles);
  if (!start || !end || !canonical || start.getTime() > end.getTime()) return null;

  const exclusiveEnd = new Date(end);
  exclusiveEnd.setDate(exclusiveEnd.getDate() + 1);
  return {
    completedFrom: start.toISOString(),
    completedBefore: exclusiveEnd.toISOString(),
    muscles: canonical,
  };
}

export function normalizeWorkoutHistoryFilters(value: WorkoutHistoryFilters): WorkoutHistoryFilters | null {
  const muscles = canonicalMuscles(value.muscles);
  const hasFrom = value.completedFrom !== undefined;
  const hasBefore = value.completedBefore !== undefined;
  if (!muscles || hasFrom !== hasBefore) return null;
  if (!hasFrom) return { muscles };
  if (!isCanonicalUtcInstant(value.completedFrom) || !isCanonicalUtcInstant(value.completedBefore)) return null;
  if (value.completedFrom >= value.completedBefore) return null;
  return { completedFrom: value.completedFrom, completedBefore: value.completedBefore, muscles };
}

export function encodeWorkoutHistoryCursor(cursor: WorkoutHistoryCursor): string | null {
  if (!isCanonicalUtcInstant(cursor.completedAt) || !isCanonicalUuid(cursor.id)) return null;
  return btoa(JSON.stringify({ completedAt: cursor.completedAt, id: cursor.id }))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

export function decodeWorkoutHistoryCursor(value: string): WorkoutHistoryCursor | null {
  if (
    value.length === 0 ||
    value.length > MAX_HISTORY_CURSOR_LENGTH ||
    !/^[A-Za-z0-9_-]+$/u.test(value) ||
    value.length % 4 === 1
  ) {
    return null;
  }

  try {
    const padded = value
      .replaceAll("-", "+")
      .replaceAll("_", "/")
      .padEnd(Math.ceil(value.length / 4) * 4, "=");
    const decoded: unknown = JSON.parse(atob(padded));
    if (!isRecord(decoded) || !hasExactKeys(decoded, ["completedAt", "id"])) return null;
    if (!isCanonicalUtcInstant(decoded.completedAt) || !isCanonicalUuid(decoded.id)) return null;
    return { completedAt: decoded.completedAt, id: decoded.id };
  } catch {
    return null;
  }
}

function toHistoryUrl(path: string, filters: WorkoutHistoryFilters, cursor: string | null): string {
  const normalized = normalizeWorkoutHistoryFilters(filters);
  if (!normalized || (cursor !== null && !decodeWorkoutHistoryCursor(cursor))) return path;
  const params = new URLSearchParams();
  if (normalized.completedFrom) params.set("completedFrom", normalized.completedFrom);
  if (normalized.completedBefore) params.set("completedBefore", normalized.completedBefore);
  normalized.muscles.forEach((muscle) => {
    params.append("muscle", muscle);
  });
  if (cursor) params.set("cursor", cursor);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export function toWorkoutHistoryPageUrl(filters: WorkoutHistoryFilters): string {
  return toHistoryUrl("/history", filters, null);
}

export function toWorkoutHistoryApiUrl(filters: WorkoutHistoryFilters, cursor: string | null = null): string {
  return toHistoryUrl(WORKOUT_HISTORY_API_PATH, filters, cursor);
}

export function parseWorkoutHistorySearchParams(
  params: URLSearchParams,
  knownMuscles?: ReadonlySet<string>,
  rejectUnknownParameters = true,
): HistorySearchParseResult {
  const known = new Set(["completedFrom", "completedBefore", "muscle", "cursor"]);
  if (rejectUnknownParameters && [...params.keys()].some((key) => !known.has(key))) return { valid: false };
  const completedFrom = params.getAll("completedFrom");
  const completedBefore = params.getAll("completedBefore");
  const cursor = params.getAll("cursor");
  const muscles = params.getAll("muscle");
  if (completedFrom.length > 1 || completedBefore.length > 1 || cursor.length > 1) return { valid: false };
  if (knownMuscles && muscles.some((muscle) => !knownMuscles.has(muscle))) return { valid: false };

  const filters = normalizeWorkoutHistoryFilters({
    ...(completedFrom.length === 1 ? { completedFrom: completedFrom[0] } : {}),
    ...(completedBefore.length === 1 ? { completedBefore: completedBefore[0] } : {}),
    muscles,
  });
  const parsedCursor = cursor.length === 1 ? decodeWorkoutHistoryCursor(cursor[0]) : null;
  if (!filters || (cursor.length === 1 && !parsedCursor)) return { valid: false };

  const canonical = toHistoryUrl("/history", filters, cursor.length === 1 ? cursor[0] : null).split("?", 2)[1] ?? "";
  return {
    valid: true,
    filters,
    cursor: cursor.length === 1 ? cursor[0] : null,
    normalized: canonical !== params.toString(),
  };
}

function isHistoryMuscle(value: unknown): value is WorkoutHistoryMuscleTag {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["code", "name", "role"]) &&
    isMuscleCode(value.code) &&
    typeof value.name === "string" &&
    value.name.trim().length > 0 &&
    (value.role === "primary" || value.role === "secondary")
  );
}

function isHistoryExercise(value: unknown): value is CompletedWorkoutExercise {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["exerciseId", "name", "position", "sets", "reps", "muscles"]) &&
    isCanonicalUuid(value.exerciseId) &&
    typeof value.name === "string" &&
    value.name.trim().length > 0 &&
    Number.isSafeInteger(value.position) &&
    value.position >= 0 &&
    Number.isSafeInteger(value.sets) &&
    value.sets > 0 &&
    Number.isSafeInteger(value.reps) &&
    value.reps > 0 &&
    Array.isArray(value.muscles) &&
    value.muscles.every(isHistoryMuscle)
  );
}

export function isCompletedWorkoutHistoryEntry(value: unknown): value is CompletedWorkoutHistoryEntry {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["id", "origin", "createdAt", "completedAt", "exercises"]) &&
    isCanonicalUuid(value.id) &&
    (value.origin === "manual" || value.origin === "ai") &&
    isCanonicalUtcInstant(value.createdAt) &&
    isCanonicalUtcInstant(value.completedAt) &&
    value.createdAt <= value.completedAt &&
    Array.isArray(value.exercises) &&
    value.exercises.every(isHistoryExercise)
  );
}

export function parseWorkoutHistoryResponse(value: unknown): WorkoutHistoryPage | undefined {
  if (!isRecord(value) || !hasExactKeys(value, ["entries", "nextCursor"]) || !Array.isArray(value.entries))
    return undefined;
  if (!value.entries.every(isCompletedWorkoutHistoryEntry)) return undefined;
  if (
    value.nextCursor !== null &&
    (typeof value.nextCursor !== "string" || !decodeWorkoutHistoryCursor(value.nextCursor))
  ) {
    return undefined;
  }
  return { entries: value.entries, nextCursor: value.nextCursor };
}

export function matchesWorkoutHistoryMuscles(
  entry: CompletedWorkoutHistoryEntry,
  selectedMuscles: readonly string[],
): boolean {
  return (
    selectedMuscles.length === 0 ||
    entry.exercises.some((exercise) => exercise.muscles.some((muscle) => selectedMuscles.includes(muscle.code)))
  );
}

export function compareWorkoutHistoryPositions(left: WorkoutHistoryCursor, right: WorkoutHistoryCursor): number {
  if (left.completedAt !== right.completedAt) return right.completedAt.localeCompare(left.completedAt);
  return right.id.localeCompare(left.id);
}

export function mergeWorkoutHistoryPage(
  current: WorkoutHistoryPage,
  incoming: WorkoutHistoryPage,
  behavior: "replace" | "append",
): WorkoutHistoryPage {
  if (behavior === "replace") return incoming;
  const seen = new Set(current.entries.map((entry) => entry.id));
  return {
    entries: [...current.entries, ...incoming.entries.filter((entry) => !seen.has(entry.id))],
    nextCursor: incoming.nextCursor,
  };
}

export function isCurrentHistoryRequest(generation: number, currentGeneration: number): boolean {
  return generation === currentGeneration;
}
