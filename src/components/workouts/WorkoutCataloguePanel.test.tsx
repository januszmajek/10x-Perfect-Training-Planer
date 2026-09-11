import { createRef, type ComponentProps } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import WorkoutCataloguePanel from "@/components/workouts/WorkoutCataloguePanel";
import {
  catalogueCallbacks,
  EXERCISE_IDS,
  recoveryCatalogueExercises,
  selectedDraft,
} from "@/test/ui/workout-fixtures";

function renderPanel(overrides: Partial<ComponentProps<typeof WorkoutCataloguePanel>> = {}) {
  const callbacks = catalogueCallbacks();
  const rendered = render(
    <WorkoutCataloguePanel
      catalogue={recoveryCatalogueExercises}
      draft={selectedDraft}
      filterTriggerRef={createRef<HTMLButtonElement>()}
      filteredCatalogue={recoveryCatalogueExercises}
      onOpenFilters={callbacks.onOpenFilters}
      onOrderChange={callbacks.onOrderChange}
      onSelectExercise={callbacks.onSelectExercise}
      order="ready-first"
      pending={false}
      replacingIndex={null}
      {...overrides}
    />,
  );
  return { callbacks, ...rendered };
}

test("shows declared recovery groups, count, and selection behavior", async () => {
  const user = userEvent.setup();
  const { callbacks } = renderPanel();

  expect(screen.getByRole("status").textContent).toBe("3 of 3 exercises shown");
  const readyHeading = screen.getByText("Ready to go");
  const recoveryHeading = screen.getByText("Muscles need recovery");
  expect(readyHeading.compareDocumentPosition(recoveryHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.getByRole("button", { name: "Added Barbell Bench Press" }).disabled).toBe(true);

  await user.click(screen.getByRole("button", { name: "Add Cable Row" }));
  await user.click(
    screen.getByRole("button", {
      name: "Recovery order: Ready to go first. Activate to show Muscles need recovery first.",
    }),
  );
  expect(callbacks.onSelectExercise).toHaveBeenCalledWith(EXERCISE_IDS.cableRow);
  expect(callbacks.onOrderChange).toHaveBeenCalledWith("recovering-first");
});

test("uses replacement labels and renders the independent no-match output", () => {
  const { rerender } = renderPanel({ replacingIndex: 0 });

  expect(screen.getByRole("button", { name: "Current Barbell Bench Press" }).disabled).toBe(true);
  expect(screen.getByRole("button", { name: "Replace Cable Row" }).disabled).toBe(false);

  rerender(
    <WorkoutCataloguePanel
      catalogue={recoveryCatalogueExercises}
      draft={selectedDraft}
      filterTriggerRef={createRef<HTMLButtonElement>()}
      filteredCatalogue={[]}
      onOpenFilters={() => undefined}
      onOrderChange={() => undefined}
      onSelectExercise={() => undefined}
      order="ready-first"
      pending={false}
      replacingIndex={null}
    />,
  );
  expect(screen.getByRole("status").textContent).toBe("0 of 3 exercises shown");
  expect(screen.getByText("No exercises match these filters")).toBeTruthy();
});
