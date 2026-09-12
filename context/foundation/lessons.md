# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Prove blocking E2E gates in the CI environment

- **Context**: Browser-level E2E tests promoted to required CI gates, especially responsive tests that run locally and on GitHub-hosted Linux runners.
- **Problem**: A test can pass locally yet fail deterministically in CI when it depends on host-specific font rendering, pixel snapshots, or an assumption that an entire scrollable panel fits in the viewport. This creates noisy failures and masks the actual user-facing contract.
- **Rule**: Before making an E2E test a blocking CI gate, run it in the same browser and operating-system environment as CI. Assert user-visible state, viewport intersection, and successful interaction; use screenshots and traces as failure evidence, not cross-host visual baselines, unless the rendering environment is pinned identically.
- **Applies to**: research, plan, implement, impl-review
