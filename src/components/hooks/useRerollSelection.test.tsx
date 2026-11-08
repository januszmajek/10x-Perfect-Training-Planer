import { act, renderHook } from "@testing-library/react";
import { expect, test } from "vitest";
import { useRerollSelection } from "@/components/hooks/useRerollSelection";
import type { ManualWorkoutDraftItem } from "@/lib/manual-workout-builder";
import { EXERCISE_IDS } from "@/test/ui/workout-fixtures";

const { benchPress, cableRow, squat } = EXERCISE_IDS;
const item = (exerciseId: string): ManualWorkoutDraftItem => ({ exerciseId, sets: 3, reps: 10 });

function renderSelection(initial: ManualWorkoutDraftItem[]) {
  return renderHook(({ draft }) => useRerollSelection(draft), { initialProps: { draft: initial } });
}

test("keeps selection across reorder and drops ids that leave the draft", () => {
  const { result, rerender } = renderSelection([item(benchPress), item(cableRow), item(squat)]);
  act(() => {
    result.current.toggle(benchPress);
    result.current.toggle(squat);
  });

  rerender({ draft: [item(squat), item(cableRow), item(benchPress)] });
  expect([...result.current.selected].sort()).toEqual([benchPress, squat].sort());

  rerender({ draft: [item(cableRow), item(benchPress)] });
  expect([...result.current.selected]).toEqual([benchPress]);

  // A removed exercise added back manually returns unmarked.
  rerender({ draft: [item(cableRow), item(benchPress), item(squat)] });
  expect([...result.current.selected]).toEqual([benchPress]);
});

test("accumulates exclusions on partial success, prunes manual re-adds and resets on an empty draft", () => {
  const { result, rerender } = renderSelection([item(benchPress), item(cableRow)]);
  act(() => {
    result.current.toggle(cableRow);
  });
  act(() => {
    result.current.applySuccess(
      {
        version: 1,
        reroll: {
          exercises: [
            { exerciseId: benchPress, sets: 3, reps: 10 },
            { exerciseId: cableRow, replace: true },
          ],
        },
      },
      [benchPress, squat],
    );
  });
  rerender({ draft: [item(benchPress), item(squat)] });
  expect(result.current.selected.size).toBe(0);
  expect(result.current.excluded).toEqual([cableRow]);

  rerender({ draft: [item(benchPress), item(squat), item(cableRow)] });
  expect(result.current.excluded).toEqual([]);

  act(() => {
    result.current.applySuccess(
      {
        version: 1,
        reroll: {
          exercises: [
            { exerciseId: benchPress, sets: 3, reps: 10 },
            { exerciseId: squat, replace: true },
          ],
        },
      },
      [benchPress, cableRow],
    );
  });
  rerender({ draft: [item(benchPress), item(cableRow)] });
  expect(result.current.excluded).toEqual([squat]);

  rerender({ draft: [] });
  expect(result.current.excluded).toEqual([]);
});
