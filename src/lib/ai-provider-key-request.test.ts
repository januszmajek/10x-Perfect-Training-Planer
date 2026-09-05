import assert from "node:assert/strict";
import test from "node:test";
import { hasConfirmedAiProviderKeyRemoval, hasSameOrigin } from "./ai-provider-key-request.ts";

void test("accepts account key mutations only from the current origin", () => {
  assert.equal(
    hasSameOrigin(new Request("https://planner.example/account", { method: "POST" }), "https://planner.example"),
    false,
  );
  assert.equal(
    hasSameOrigin(
      new Request("https://planner.example/account", {
        method: "POST",
        headers: { Origin: "https://planner.example" },
      }),
      "https://planner.example",
    ),
    true,
  );
});

void test("requires exactly one explicit confirmation to remove an account key", () => {
  assert.equal(hasConfirmedAiProviderKeyRemoval([]), false);
  assert.equal(hasConfirmedAiProviderKeyRemoval([["confirm", "false"]]), false);
  assert.equal(
    hasConfirmedAiProviderKeyRemoval([
      ["confirm", "true"],
      ["extra", "value"],
    ]),
    false,
  );
  assert.equal(hasConfirmedAiProviderKeyRemoval([["confirm", "true"]]), true);
});
