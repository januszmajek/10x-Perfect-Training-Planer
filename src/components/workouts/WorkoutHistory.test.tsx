import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import WorkoutHistory from "@/components/workouts/WorkoutHistory";
import type { WorkoutHistoryPage } from "@/lib/workout-history-client";

const historyPage: WorkoutHistoryPage = {
  entries: [
    {
      id: "00000000-0000-0000-0000-000000000101",
      origin: "manual",
      createdAt: "2026-09-08T09:00:00.000Z",
      completedAt: "2026-09-09T10:30:00.000Z",
      exercises: [
        {
          exerciseId: "00000000-0000-0000-0000-000000000201",
          name: "Barbell Bench Press",
          position: 0,
          sets: 3,
          reps: 10,
          muscles: [
            { code: "chest", name: "Chest", role: "primary" },
            { code: "triceps", name: "Triceps", role: "secondary" },
          ],
        },
        {
          exerciseId: "00000000-0000-0000-0000-000000000202",
          name: "Cable Row",
          position: 1,
          sets: 4,
          reps: 8,
          muscles: [
            { code: "upper_back", name: "Upper Back", role: "primary" },
            { code: "biceps", name: "Biceps", role: "secondary" },
          ],
        },
      ],
    },
    {
      id: "00000000-0000-0000-0000-000000000102",
      origin: "ai",
      createdAt: "2026-09-07T09:00:00.000Z",
      completedAt: "2026-09-08T10:30:00.000Z",
      exercises: [
        {
          exerciseId: "00000000-0000-0000-0000-000000000203",
          name: "Bodyweight Squat",
          position: 0,
          sets: 3,
          reps: 12,
          muscles: [{ code: "quads", name: "Quads", role: "primary" }],
        },
      ],
    },
  ],
  nextCursor: null,
};

function workoutCard(workouts: HTMLElement, title: string) {
  const card = within(workouts).getByText(title).closest("li");
  if (!card) throw new Error(`Could not find the ${title} card.`);
  return card;
}

test("shows completed workout summaries and toggles each complete saved prescription", async () => {
  const user = userEvent.setup();
  render(
    <WorkoutHistory
      initialFilters={{ muscles: [], equipment: [] }}
      initialPage={historyPage}
      muscleOptions={[
        { code: "chest", name: "Chest" },
        { code: "triceps", name: "Triceps" },
        { code: "upper_back", name: "Upper Back" },
        { code: "biceps", name: "Biceps" },
        { code: "quads", name: "Quads" },
      ]}
    />,
  );

  const musclesFacet = screen.getByText("Muscles (0 selected)").closest("details");
  if (!musclesFacet) throw new Error("Could not find the unified muscles facet.");
  expect(within(musclesFacet).getAllByRole("checkbox")).toHaveLength(5);
  expect(within(musclesFacet).getByLabelText("Chest")).toBeTruthy();
  expect(screen.queryByText(/^(Main|Secondary) muscles/u)).toBeNull();
  expect(screen.getByRole("button", { name: "Reset filters" }).disabled).toBe(true);

  const completedWorkouts = screen.getByRole("list", { name: "Completed workouts" });
  const manualCard = workoutCard(completedWorkouts, "Manual workout");
  const aiCard = workoutCard(completedWorkouts, "AI workout");

  expect(within(manualCard).getByText("Completed Sep 9, 2026, 10:30")).toBeTruthy();
  expect(within(aiCard).getByText("Completed Sep 8, 2026, 10:30")).toBeTruthy();
  expect(within(manualCard).getByText("2 exercises")).toBeTruthy();
  expect(within(manualCard).getByText("Chest")).toBeTruthy();
  expect(within(manualCard).getByText("Upper Back")).toBeTruthy();
  expect(within(aiCard).getByText("1 exercise")).toBeTruthy();
  expect(within(aiCard).getByText("Quads")).toBeTruthy();
  expect(screen.queryByRole("list", { name: "Manual workout prescription" })).toBeNull();
  expect(screen.queryByRole("list", { name: "AI workout prescription" })).toBeNull();

  await user.click(within(manualCard).getByRole("button", { name: "Show details" }));
  const manualPrescription = screen.getByRole("list", { name: "Manual workout prescription" });
  expect(within(manualCard).getByText("Origin: Manual", { exact: false })).toBeTruthy();
  expect(within(manualPrescription).getByText("1. Barbell Bench Press")).toBeTruthy();
  expect(within(manualPrescription).getByText("3 sets × 10 reps")).toBeTruthy();
  expect(within(manualPrescription).getByText("Chest · primary")).toBeTruthy();
  expect(within(manualPrescription).getByText("Triceps · secondary")).toBeTruthy();
  expect(within(manualPrescription).getByText("2. Cable Row")).toBeTruthy();
  expect(within(manualPrescription).getByText("4 sets × 8 reps")).toBeTruthy();
  expect(within(manualPrescription).getByText("Upper Back · primary")).toBeTruthy();
  expect(within(manualPrescription).getByText("Biceps · secondary")).toBeTruthy();

  await user.click(within(aiCard).getByRole("button", { name: "Show details" }));
  const aiPrescription = screen.getByRole("list", { name: "AI workout prescription" });
  expect(within(aiCard).getByText("Origin: AI-generated", { exact: false })).toBeTruthy();
  expect(within(aiPrescription).getByText("1. Bodyweight Squat")).toBeTruthy();
  expect(within(aiPrescription).getByText("3 sets × 12 reps")).toBeTruthy();
  expect(within(aiPrescription).getByText("Quads · primary")).toBeTruthy();

  await user.click(within(manualCard).getByRole("button", { name: "Hide details" }));
  expect(screen.queryByRole("list", { name: "Manual workout prescription" })).toBeNull();
  expect(screen.getByRole("list", { name: "AI workout prescription" })).toBe(aiPrescription);
});

test("removes stale workouts as soon as a single-day filter is selected", () => {
  render(
    <WorkoutHistory initialFilters={{ muscles: [], equipment: [] }} initialPage={historyPage} muscleOptions={[]} />,
  );

  fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2026-09-14" } });

  expect(screen.queryAllByText("Manual workout")).toHaveLength(0);
  expect(screen.queryByText("AI workout")).toBeNull();
  expect(screen.getByText("Updating history…")).toBeTruthy();
});

test("opens the native picker from both the date input and its visible calendar button", () => {
  render(
    <WorkoutHistory initialFilters={{ muscles: [], equipment: [] }} initialPage={historyPage} muscleOptions={[]} />,
  );
  const startDate = screen.getByLabelText("Start date");
  const showPicker = vi.fn();
  startDate.showPicker = showPicker;

  fireEvent.click(startDate);
  fireEvent.click(screen.getByRole("button", { name: "Open start date picker" }));

  expect(showPicker).toHaveBeenCalledTimes(2);
});

test("focuses the date input when its picker cannot be opened programmatically", () => {
  render(
    <WorkoutHistory initialFilters={{ muscles: [], equipment: [] }} initialPage={historyPage} muscleOptions={[]} />,
  );
  const startDate = screen.getByLabelText("Start date");
  startDate.showPicker = vi.fn(() => {
    throw new DOMException("Picker unavailable", "NotSupportedError");
  });
  const focus = vi.spyOn(startDate, "focus");

  fireEvent.click(screen.getByRole("button", { name: "Open start date picker" }));

  expect(focus).toHaveBeenCalledTimes(1);
});
