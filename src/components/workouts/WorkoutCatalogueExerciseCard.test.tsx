import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import WorkoutCatalogueExerciseCard from "@/components/workouts/WorkoutCatalogueExerciseCard";
import { catalogueExercises, recoveryCatalogueExercises } from "@/test/ui/workout-fixtures";

test("maps controlled selection state to Add, Added, Replace, and Current actions", async () => {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  const { rerender } = render(
    <WorkoutCatalogueExerciseCard
      actionLabel="Add"
      disabled={false}
      exercise={catalogueExercises[0]}
      onSelect={onSelect}
      pending={false}
      recovery={null}
    />,
  );

  const add = screen.getByRole("button", { name: "Add Barbell Bench Press" });
  expect(add.disabled).toBe(false);
  await user.click(add);
  expect(onSelect).toHaveBeenCalledTimes(1);

  for (const actionLabel of ["Added", "Replace", "Current"] as const) {
    rerender(
      <WorkoutCatalogueExerciseCard
        actionLabel={actionLabel}
        disabled={actionLabel !== "Replace"}
        exercise={catalogueExercises[0]}
        onSelect={onSelect}
        pending={false}
        recovery={null}
      />,
    );
    const action = screen.getByRole("button", { name: `${actionLabel} Barbell Bench Press` });
    expect(action.disabled).toBe(actionLabel !== "Replace");
  }
});

test("disables pending selection, exposes recovery duration, and limits feedback controls to capable cards", async () => {
  const user = userEvent.setup();
  const onPreferenceChange = vi.fn();
  const { rerender } = render(
    <WorkoutCatalogueExerciseCard
      actionLabel="Add"
      disabled={false}
      exercise={catalogueExercises[0]}
      onSelect={vi.fn()}
      pending
      recovery={recoveryCatalogueExercises[0].recovery}
    />,
  );

  expect(screen.getByRole("button", { name: "Add Barbell Bench Press" }).disabled).toBe(true);
  expect(screen.getByText("48h")).toBeTruthy();
  expect(screen.getByText("48 hours of recovery time remaining")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Like Barbell Bench Press" })).toBeNull();

  rerender(
    <WorkoutCatalogueExerciseCard
      actionLabel="Add"
      disabled={false}
      exercise={catalogueExercises[0]}
      feedback={{ onPreferenceChange, pending: false, preference: "neutral" }}
      onSelect={vi.fn()}
      pending={false}
      recovery={null}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Like Barbell Bench Press" }));
  await user.click(screen.getByRole("button", { name: "Don't recommend Barbell Bench Press" }));

  expect(onPreferenceChange).toHaveBeenNthCalledWith(1, "liked");
  expect(onPreferenceChange).toHaveBeenNthCalledWith(2, "dont_suggest");
});
