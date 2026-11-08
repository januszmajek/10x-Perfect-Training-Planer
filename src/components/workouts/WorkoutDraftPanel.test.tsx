import type { ComponentProps } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import WorkoutDraftPanel from "@/components/workouts/WorkoutDraftPanel";
import { catalogueExercises, EXERCISE_IDS } from "@/test/ui/workout-fixtures";

const draft = [
  { exerciseId: EXERCISE_IDS.benchPress, sets: 3, reps: 10 },
  { exerciseId: EXERCISE_IDS.cableRow, sets: 4, reps: 8 },
];
const exercisesById = new Map(catalogueExercises.map((exercise) => [exercise.id, exercise]));

function renderPanel(overrides: Partial<ComponentProps<typeof WorkoutDraftPanel>> = {}) {
  const callbacks = {
    onCancelReplace: vi.fn(),
    onToggleReplace: vi.fn(),
    onUpdateItem: vi.fn(),
    onMoveItem: vi.fn(),
    onRemoveItem: vi.fn(),
    onSave: vi.fn(),
    onCancel: vi.fn(),
  };
  render(
    <WorkoutDraftPanel
      draft={draft}
      exercisesById={exercisesById}
      replacingIndex={null}
      replacingExerciseName={null}
      pending={false}
      draftValid
      saveLabel="Save workout"
      {...callbacks}
      {...overrides}
    />,
  );
  return callbacks;
}

function checkbox(name: string): HTMLInputElement {
  const element = screen.getByRole("checkbox", { name: `Replace with AI: ${name}` });
  if (!(element instanceof HTMLInputElement)) throw new Error("Expected a native checkbox");
  return element;
}

test("renders no re-roll checkboxes without selection controls", () => {
  renderPanel();
  expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  expect(screen.queryByText("Replace with AI")).toBeNull();
});

test("renders one labelled checkbox per card that toggles by exercise id", async () => {
  const user = userEvent.setup();
  const onToggle = vi.fn();
  renderPanel({ rerollSelection: { selectedIds: new Set([EXERCISE_IDS.cableRow]), onToggle } });

  expect(screen.getAllByRole("checkbox")).toHaveLength(2);
  expect(screen.getAllByText("Replace with AI")).toHaveLength(2);
  expect(checkbox("Barbell Bench Press").checked).toBe(false);
  expect(checkbox("Cable Row").checked).toBe(true);

  await user.click(checkbox("Barbell Bench Press"));
  expect(onToggle).toHaveBeenCalledWith(EXERCISE_IDS.benchPress);
  await user.click(screen.getAllByText("Replace with AI")[1]);
  expect(onToggle).toHaveBeenLastCalledWith(EXERCISE_IDS.cableRow);
});

test("disables checkboxes while an operation is pending", async () => {
  const user = userEvent.setup();
  const onToggle = vi.fn();
  renderPanel({ pending: true, rerollSelection: { selectedIds: new Set(), onToggle } });

  expect(checkbox("Barbell Bench Press").disabled).toBe(true);
  expect(checkbox("Cable Row").disabled).toBe(true);
  await user.click(checkbox("Cable Row"));
  expect(onToggle).not.toHaveBeenCalled();
});

test("keeps the manual catalogue Replace button distinct from the AI checkbox", async () => {
  const user = userEvent.setup();
  const onToggle = vi.fn();
  const callbacks = renderPanel({ rerollSelection: { selectedIds: new Set(), onToggle } });

  const manualReplace = screen.getByRole("button", { name: "Replace Barbell Bench Press" });
  expect(manualReplace.getAttribute("aria-pressed")).toBe("false");
  expect(screen.queryByRole("button", { name: /Replace with AI/u })).toBeNull();
  await user.click(manualReplace);
  expect(callbacks.onToggleReplace).toHaveBeenCalledWith(0);
  expect(onToggle).not.toHaveBeenCalled();
});
