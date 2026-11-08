import type { Page, Route } from "@playwright/test";
import {
  configureAiProviderKey,
  expect,
  loadCatalogueExercises,
  loadWorkoutFixture,
  test,
  type WorkoutFixtureExercise,
} from "./fixtures";

type Prescribed = WorkoutFixtureExercise & { sets?: number; reps?: number };

async function waitForHydration(page: Page) {
  await page.waitForLoadState("networkidle");
  await expect(page.locator("astro-island[ssr]")).toHaveCount(0);
}

function coldStartProposal(exercises: Prescribed[], requestId: string) {
  return {
    proposal: {
      exercises: exercises.map(({ id, sets = 3, reps = 10 }) => ({ exerciseId: id, sets, reps })),
    },
    metadata: { kind: "cold_start", exerciseCount: exercises.length },
    requestId,
  };
}

/** Route-mocks generation, answering requests in order and recording each submitted body. */
async function mockGeneration(page: Page, responses: ((route: Route) => Promise<void>)[]) {
  const bodies: unknown[] = [];
  await page.route("**/api/workouts/ai/generate", async (route) => {
    bodies.push(route.request().postDataJSON());
    const respond = responses.at(bodies.length - 1);
    if (!respond) throw new Error("Unexpected generation request");
    await respond(route);
  });
  return bodies;
}

const fulfilProposal = (exercises: Prescribed[], requestId: string) => (route: Route) =>
  route.fulfill({ json: coldStartProposal(exercises, requestId) });

function draftList(page: Page) {
  return page.getByRole("list", { name: "Workout draft exercises" });
}

async function expectDraftNames(page: Page, exercises: WorkoutFixtureExercise[]) {
  await expect(draftList(page).getByRole("heading", { level: 3 })).toHaveText(
    exercises.map(({ name }, index) => `${index + 1}. ${name}`),
  );
}

function markCheckbox(page: Page, exercise: WorkoutFixtureExercise) {
  return page.getByRole("checkbox", { name: `Replace with AI: ${exercise.name}` });
}

test("partially re-rolls marked exercises, excludes earlier replacements, and re-rolls everything with Mark all", async ({
  page,
  authenticatedPage,
}) => {
  const initial = loadWorkoutFixture();
  const [pushUp, latPulldown, deadBug, ...fresh] = loadCatalogueExercises([
    "push-up",
    "lat-pulldown",
    "dead-bug",
    "back-squat",
    "incline-dumbbell-press",
    "seated-cable-row",
    "romanian-deadlift",
    "hanging-knee-raise",
  ]);
  await configureAiProviderKey(authenticatedPage.email);
  const [a1, a2, a3, a4, a5] = initial;
  const firstMerged = [{ ...a1, sets: 4 }, pushUp, latPulldown, a4, a5];
  const secondMerged = [{ ...a1, sets: 4 }, deadBug, latPulldown, a4, a5];
  const bodies = await mockGeneration(page, [
    fulfilProposal(initial, "e2e-initial"),
    fulfilProposal(firstMerged, "e2e-partial-1"),
    fulfilProposal(secondMerged, "e2e-partial-2"),
    fulfilProposal(fresh, "e2e-mark-all"),
    (route) =>
      route.fulfill({ status: 409, json: { code: "replacement_not_feasible", requestId: "e2e-not-feasible" } }),
  ]);

  await page.goto("/workouts/new");
  await waitForHydration(page);

  // (a) Empty draft: initial generation, then the button switches to replacement mode.
  await page.getByRole("button", { name: "Generate workout" }).click();
  await expectDraftNames(page, initial);
  expect(bodies[0]).toEqual({ version: 1 });
  await expect(page.getByRole("button", { name: "Replace selected", exact: true })).toBeDisabled();
  await expect(page.getByText("Mark exercises to replace them, or use Mark all for a new workout.")).toBeVisible();

  await page.getByLabel("Sets").first().fill("4");
  await markCheckbox(page, a2).check();
  await markCheckbox(page, a3).check();
  await page.getByRole("button", { name: "Replace selected (2)" }).click();
  await expectDraftNames(page, firstMerged);
  expect(bodies[1]).toEqual({
    version: 1,
    reroll: {
      exercises: [
        { exerciseId: a1.id, sets: 4, reps: 10 },
        { exerciseId: a2.id, replace: true },
        { exerciseId: a3.id, replace: true },
        { exerciseId: a4.id, sets: 3, reps: 10 },
        { exerciseId: a5.id, sets: 3, reps: 10 },
      ],
    },
  });
  await expect(page.getByLabel("Sets").first()).toHaveValue("4");
  await expect(page.getByRole("button", { name: "Replace selected", exact: true })).toBeDisabled();

  // (b) Replacing a new pick carries the earlier replacements as exclusions.
  await markCheckbox(page, pushUp).check();
  await page.getByRole("button", { name: "Replace selected (1)" }).click();
  await expectDraftNames(page, secondMerged);
  expect(bodies[2]).toEqual({
    version: 1,
    reroll: {
      exercises: [
        { exerciseId: a1.id, sets: 4, reps: 10 },
        { exerciseId: pushUp.id, replace: true },
        { exerciseId: latPulldown.id, sets: 3, reps: 10 },
        { exerciseId: a4.id, sets: 3, reps: 10 },
        { exerciseId: a5.id, sets: 3, reps: 10 },
      ],
      excludedExerciseIds: [a2.id, a3.id],
    },
  });

  // (c) Mark all is a full re-roll without exclusions.
  await page.getByRole("button", { name: "Mark all" }).click();
  await expect(page.getByRole("button", { name: "Unmark all" })).toBeVisible();
  await page.getByRole("button", { name: "Replace selected (5)" }).click();
  await expectDraftNames(page, fresh);
  expect(bodies[3]).toEqual({
    version: 1,
    reroll: { exercises: secondMerged.map(({ id }) => ({ exerciseId: id, replace: true })) },
  });
  await expect(page.getByRole("button", { name: "Mark all" })).toBeVisible();

  // (d) An infeasible replacement keeps the draft and selection, with an inline alert and a toast.
  await markCheckbox(page, fresh[0]).check();
  await page.getByRole("button", { name: "Replace selected (1)" }).click();
  await expect(page.getByRole("alert")).toContainText("No eligible replacements fit the exercises you kept");
  await expect(page.getByText("No eligible replacements", { exact: true })).toBeVisible();
  await expectDraftNames(page, fresh);
  await expect(markCheckbox(page, fresh[0])).toBeChecked();
  await expect(page.getByRole("button", { name: "Replace selected (1)" })).toBeEnabled();
  expect(bodies).toHaveLength(5);
});

test("replaces a manual draft with Mark all", async ({ page, authenticatedPage }) => {
  const [benchPress, ...replacement] = loadCatalogueExercises([
    "barbell-bench-press",
    "push-up",
    "lat-pulldown",
    "back-squat",
    "dead-bug",
    "overhead-barbell-press",
  ]);
  await configureAiProviderKey(authenticatedPage.email);
  const bodies = await mockGeneration(page, [fulfilProposal(replacement, "e2e-manual")]);

  await page.goto("/workouts/new");
  await waitForHydration(page);
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await page.getByRole("button", { name: "Add Barbell Bench Press" }).click();
  await expect(markCheckbox(page, benchPress)).toBeVisible();
  await expect(page.getByRole("button", { name: "Generate workout" })).toHaveCount(0);

  await page.getByRole("button", { name: "Mark all" }).click();
  await page.getByRole("button", { name: "Replace selected (1)" }).click();
  await expectDraftNames(page, replacement);
  expect(bodies[0]).toEqual({
    version: 1,
    reroll: { exercises: [{ exerciseId: benchPress.id, replace: true }] },
  });
});
