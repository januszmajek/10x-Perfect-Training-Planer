---
change_id: testing-ai-response-and-draft-safety
title: Protect AI responses and workout drafts
status: implementing
created: 2026-09-11
updated: 2026-09-11
archived_at: null
---

## Notes

Open a change folder for rollout Phase 3 of context/foundation/test-plan.md: "AI response and draft safety".
Risks covered: #4, #6. Test types planned: contract, integration, targeted e2e.
Risk response intent:

- #4: Prove invalid provider proposals are rejected before display or save; valid proposals meet independent workout rules; failures preserve the draft.
- #6: Prove two-user and malformed-request scenarios fail closed, without leaked data, secrets, or mutations.
  After creating the folder, follow the downstream continuation rule.
