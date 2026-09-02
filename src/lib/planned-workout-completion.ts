export const COMPLETION_GRACE_PERIOD_MS = 5_000;

export type CompletionState = { kind: "idle" } | { kind: "grace-period"; deadline: number } | { kind: "committing" };

export type CompletionEvent =
  | { type: "start"; now: number }
  | { type: "undo"; now: number }
  | { type: "deadline-reached"; deadline: number; now: number }
  | { type: "reset" };

export type CompletionEffect =
  | { type: "none" }
  | { type: "schedule"; deadline: number }
  | { type: "submit" }
  | { type: "restore" };

export interface CompletionTransition {
  state: CompletionState;
  effect: CompletionEffect;
}

export const IDLE_COMPLETION_STATE: CompletionState = { kind: "idle" };

export function reduceCompletionState(state: CompletionState, event: CompletionEvent): CompletionTransition {
  if (event.type === "reset") return { state: IDLE_COMPLETION_STATE, effect: { type: "none" } };

  if (event.type === "start") {
    if (state.kind !== "idle") return { state, effect: { type: "none" } };
    const deadline = event.now + COMPLETION_GRACE_PERIOD_MS;
    return { state: { kind: "grace-period", deadline }, effect: { type: "schedule", deadline } };
  }

  if (event.type === "undo") {
    if (state.kind !== "grace-period") return { state, effect: { type: "none" } };
    if (event.now >= state.deadline) return { state: { kind: "committing" }, effect: { type: "submit" } };
    return { state: IDLE_COMPLETION_STATE, effect: { type: "restore" } };
  }

  if (state.kind !== "grace-period" || event.deadline !== state.deadline) {
    return { state, effect: { type: "none" } };
  }
  if (event.now < state.deadline) return { state, effect: { type: "schedule", deadline: state.deadline } };

  return { state: { kind: "committing" }, effect: { type: "submit" } };
}
