import { isCanonicalUuid } from "./manual-workout-builder.ts";

export const AI_WORKOUT_FEEDBACK_VERSION = 1 as const;

export type AiExercisePreference = "liked" | "dont_suggest" | null;
export type AiWorkoutPreferenceState = Exclude<AiExercisePreference, null> | "neutral";
export type AiWorkoutPreferenceChange = (
  exerciseId: string,
  preference: Exclude<AiWorkoutPreferenceState, "neutral">,
) => void;

export interface AiWorkoutFeedbackControls {
  preferences: Readonly<Record<string, AiWorkoutPreferenceState>>;
  pendingExerciseId: string | null;
  onPreferenceChange: AiWorkoutPreferenceChange;
}

export interface AiWorkoutPreferenceRequest {
  version: typeof AI_WORKOUT_FEEDBACK_VERSION;
  exerciseId: string;
  preference: AiExercisePreference;
}

export type AiWorkoutFeedbackEventRequest =
  | { version: typeof AI_WORKOUT_FEEDBACK_VERSION; proposalId: string; type: "exposure" }
  | { version: typeof AI_WORKOUT_FEEDBACK_VERSION; proposalId: string; type: "remove"; exerciseId: string }
  | {
      version: typeof AI_WORKOUT_FEEDBACK_VERSION;
      proposalId: string;
      type: "swap";
      exerciseId: string;
      replacementExerciseId: string;
    };

type FetchResponse = Pick<Response, "json" | "ok">;
type FeedbackFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<FetchResponse>;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  return Object.keys(value).sort().join("\0") === [...expected].sort().join("\0");
}

export function parseAiWorkoutPreferenceRequest(input: unknown): AiWorkoutPreferenceRequest | null {
  if (
    !isPlainRecord(input) ||
    !hasExactKeys(input, ["exerciseId", "preference", "version"]) ||
    input.version !== AI_WORKOUT_FEEDBACK_VERSION ||
    !isCanonicalUuid(input.exerciseId) ||
    (input.preference !== "liked" && input.preference !== "dont_suggest" && input.preference !== null)
  ) {
    return null;
  }
  return { version: AI_WORKOUT_FEEDBACK_VERSION, exerciseId: input.exerciseId, preference: input.preference };
}

export function parseAiWorkoutFeedbackEventRequest(input: unknown): AiWorkoutFeedbackEventRequest | null {
  if (!isPlainRecord(input) || input.version !== AI_WORKOUT_FEEDBACK_VERSION || !isCanonicalUuid(input.proposalId)) {
    return null;
  }
  if (hasExactKeys(input, ["proposalId", "type", "version"]) && input.type === "exposure") {
    return { version: AI_WORKOUT_FEEDBACK_VERSION, proposalId: input.proposalId, type: "exposure" };
  }
  if (
    hasExactKeys(input, ["exerciseId", "proposalId", "type", "version"]) &&
    input.type === "remove" &&
    isCanonicalUuid(input.exerciseId)
  ) {
    return {
      version: AI_WORKOUT_FEEDBACK_VERSION,
      proposalId: input.proposalId,
      type: "remove",
      exerciseId: input.exerciseId,
    };
  }
  if (
    hasExactKeys(input, ["exerciseId", "proposalId", "replacementExerciseId", "type", "version"]) &&
    input.type === "swap" &&
    isCanonicalUuid(input.exerciseId) &&
    isCanonicalUuid(input.replacementExerciseId) &&
    input.exerciseId !== input.replacementExerciseId
  ) {
    return {
      version: AI_WORKOUT_FEEDBACK_VERSION,
      proposalId: input.proposalId,
      type: "swap",
      exerciseId: input.exerciseId,
      replacementExerciseId: input.replacementExerciseId,
    };
  }
  return null;
}

function jsonPost(body: unknown): RequestInit {
  return {
    method: "POST",
    credentials: "same-origin",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export async function saveAiWorkoutPreference(
  request: AiWorkoutPreferenceRequest,
  requestFetch: FeedbackFetch = fetch,
): Promise<AiExercisePreference | undefined> {
  try {
    const response = await requestFetch("/api/workouts/ai/preferences", jsonPost(request));
    if (!response.ok) return undefined;
    const body = (await response.json()) as unknown;
    return isPlainRecord(body) &&
      hasExactKeys(body, ["preference"]) &&
      (body.preference === "liked" || body.preference === "dont_suggest" || body.preference === null)
      ? body.preference
      : undefined;
  } catch {
    return undefined;
  }
}

export async function acknowledgeAiWorkoutFeedbackEvent(
  request: AiWorkoutFeedbackEventRequest,
  requestFetch: FeedbackFetch = fetch,
): Promise<boolean> {
  try {
    return (await requestFetch("/api/workouts/ai/events", jsonPost(request))).ok;
  } catch {
    return false;
  }
}
