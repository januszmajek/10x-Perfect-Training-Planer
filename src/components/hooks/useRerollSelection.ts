import { useCallback, useState } from "react";
import type { AiWorkoutGenerationCommand } from "@/lib/ai-workout-client";
import { nextRerollExclusions, pruneRerollExclusions, pruneRerollSelection } from "@/lib/ai-workout-planner-state";
import type { ManualWorkoutDraftItem } from "@/lib/manual-workout-builder";

export interface RerollSelection {
  /** Marked exercise ids, always limited to exercises in the current draft. */
  selected: ReadonlySet<string>;
  toggle: (exerciseId: string) => void;
  markAll: (draft: readonly ManualWorkoutDraftItem[]) => void;
  clearSelection: () => void;
  /** Cumulative exclusions for the current draft, oldest first. */
  excluded: readonly string[];
  applySuccess: (command: AiWorkoutGenerationCommand, mergedIds: readonly string[]) => void;
  reset: () => void;
}

/** Per-draft re-roll selection and cumulative exclusions (client-held; lost on reload by design). */
export function useRerollSelection(draft: readonly ManualWorkoutDraftItem[]): RerollSelection {
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [excluded, setExcluded] = useState<readonly string[]>([]);
  const [trackedDraft, setTrackedDraft] = useState(draft);

  // Adjust state while rendering when the draft changes (React's recommended alternative to a syncing effect): ids
  // that left the draft are dropped, so they never come back marked, and re-added ids leave the exclusions.
  if (trackedDraft !== draft) {
    setTrackedDraft(draft);
    setSelected((current) => {
      const pruned = pruneRerollSelection(current, draft);
      return pruned.size === current.size ? current : pruned;
    });
    setExcluded((current) => {
      const pruned = pruneRerollExclusions(current, draft);
      return pruned.length === current.length ? current : pruned;
    });
  }

  const toggle = useCallback((exerciseId: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(exerciseId)) next.delete(exerciseId);
      else next.add(exerciseId);
      return next;
    });
  }, []);

  const markAll = useCallback((items: readonly ManualWorkoutDraftItem[]) => {
    setSelected(new Set(items.map(({ exerciseId }) => exerciseId)));
  }, []);

  const clearSelection = useCallback(() => {
    setSelected(new Set());
  }, []);

  const applySuccess = useCallback((command: AiWorkoutGenerationCommand, mergedIds: readonly string[]) => {
    setExcluded((previous) => nextRerollExclusions({ previous, command, mergedIds }));
    setSelected(new Set());
  }, []);

  const reset = useCallback(() => {
    setSelected(new Set());
    setExcluded([]);
  }, []);

  return { selected, toggle, markAll, clearSelection, excluded, applySuccess, reset };
}
