import assert from "node:assert/strict";
import test from "node:test";
import { loadManualWorkoutBuilderData } from "./manual-workouts.ts";

const USER_ID = "00000000-0000-0000-0000-000000000001";

function query(result: unknown, actions: unknown[]) {
  const chain = {
    eq(column: string, value: unknown) {
      actions.push(["eq", column, value]);
      return chain;
    },
    gte(column: string, value: unknown) {
      actions.push(["gte", column, value]);
      return chain;
    },
    order(column: string, options: unknown) {
      actions.push(["order", column, options]);
      return chain;
    },
    limit(value: number) {
      actions.push(["limit", value]);
      return chain;
    },
    maybeSingle() {
      actions.push(["maybeSingle"]);
      return Promise.resolve(result);
    },
    then<TResult1 = unknown, TResult2 = never>(
      onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      return Promise.resolve(result).then(onfulfilled, onrejected);
    },
  };
  return chain;
}

void test("loads only the authenticated owner's bounded completed recovery history with canonical roles", async () => {
  const actions: unknown[] = [];
  const client = {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: USER_ID } }, error: null }) },
    from(table: string) {
      actions.push(["from", table]);
      return {
        select(selection: string) {
          actions.push(["select", table, selection]);
          if (table === "exercises") {
            return query(
              {
                data: [
                  {
                    id: "00000000-0000-0000-0000-000000000010",
                    name: "Bench Press",
                    equipment: "barbell",
                    exercise_muscle_groups: [
                      {
                        muscle_group_code: "chest",
                        role: "primary",
                        muscle_groups: { name: "Chest", recovery_hours: 48 },
                      },
                    ],
                  },
                ],
                error: null,
              },
              actions,
            );
          }
          if (selection.includes("revision")) return query({ data: null, error: null }, actions);
          return query(
            {
              data: [
                {
                  completed_at: "2026-09-04T11:00:00.000Z",
                  workout_exercises: [
                    {
                      sets: 3,
                      exercises: {
                        exercise_muscle_groups: [
                          {
                            muscle_group_code: "chest",
                            role: "primary",
                            muscle_groups: { name: "Chest", recovery_hours: 48 },
                          },
                        ],
                      },
                    },
                  ],
                },
              ],
              error: null,
            },
            actions,
          );
        },
      };
    },
  };

  const result = await loadManualWorkoutBuilderData(
    client as Parameters<typeof loadManualWorkoutBuilderData>[0],
    USER_ID,
  );

  assert.equal(result.ok, true);
  const builderData = result as { data: { catalogue: { recovery: { state: string } }[] } };
  assert.equal(builderData.data.catalogue[0].recovery.state, "recovering");
  assert.ok(actions.some((action) => JSON.stringify(action) === JSON.stringify(["eq", "user_id", USER_ID])));
  assert.ok(actions.some((action) => JSON.stringify(action) === JSON.stringify(["eq", "status", "completed"])));
  const boundary = actions.find(
    (action) => Array.isArray(action) && action[0] === "gte" && action[1] === "completed_at",
  ) as [string, string, string] | undefined;
  assert.ok(boundary);
  assert.equal(new Date(boundary[2]).getTime() <= Date.now() - 48 * 60 * 60 * 1000, true);
  assert.ok(
    actions.some(
      (action) => Array.isArray(action) && action[0] === "select" && String(action[2]).includes("role,muscle_groups"),
    ),
  );
});
