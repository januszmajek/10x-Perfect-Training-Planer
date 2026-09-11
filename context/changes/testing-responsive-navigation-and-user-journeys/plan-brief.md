# Responsive Navigation and User Journeys — Plan Brief

> Full plan: `context/changes/testing-responsive-navigation-and-user-journeys/plan.md`
> Research: `context/changes/testing-responsive-navigation-and-user-journeys/research.md`

## What & Why

This rollout adds focused browser protection for the app's responsive navigation and critical workout lifecycle. It also fixes the confirmed defect where a mobile navigation drawer remains over the desktop UI after resize.

## Starting Point

The project has Node contract tests and a Vitest/jsdom UI suite, but no browser harness. SSR auth, route redirects, CSS layout, native dialog behavior, and durable workflow outcomes are currently untested together.

## Desired End State

CI runs a Chromium browser suite against local Supabase. Users can reliably reach key controls at 360px and desktop, resizing closes mobile navigation correctly, and manual/AI workout journeys prove durable completion through History.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Browser layer | Playwright, Chromium-only | A real browser is the cheapest layer for SSR, viewport, history, and hydration contracts. | Research |
| Draft behavior | Keep new-draft discard | It is the existing documented product contract; tests make it explicit. | User |
| Production scope | Fix confirmed defects | Browser tests should protect a corrected responsive experience, not merely record failure. | User |
| Drawer scope | No focus trap | Keeps this rollout narrow; retain and test current close/focus-return behavior. | User |
| Visual checks | Two stable checkpoints | Covers high-risk layout states without a brittle screenshot suite. | Research |

## Scope

**In scope:** browser harness/CI, isolated local fixtures, mocked provider boundary, mobile drawer resize fix, responsive reachability, focused manual/AI journeys, durable versus volatile state, and true shared filter contracts.

**Out of scope:** new-draft persistence/leave guard, catalogue history-model changes, focus trapping/accessibility audit, real provider traffic, and broad visual/browser matrices.

## Architecture / Approach

Playwright starts the local app after CI resets Supabase, provisions disposable users/data through test-only helpers, seeds the SSR-visible local AI credential, and routes only the browser's same-origin AI-generation request. Semantic assertions prove the user journeys; two Chromium screenshots guard stable responsive overlay states.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Harness | Chromium runner, local fixtures, CI gate | Leaking credentials or external dependencies |
| 2. Responsive navigation | Resize fix and 360px/desktop contracts | Overlay obscures navigation or actions |
| 3. Journeys | Manual/AI persistence and scoped filter contracts | Page-level success hides a broken lifecycle |

**Prerequisites:** Local Supabase reset in CI and Playwright Chromium installation.  
**Estimated effort:** 2–3 implementation sessions across three phases.

## Open Risks & Assumptions

- Browser fixture setup must use only local runtime credentials and redact artifacts.
- The existing five-second completion grace period must be observed through UI state, not arbitrary sleeping.

## Success Criteria (Summary)

- CI fails when responsive navigation, a critical workout lifecycle, or scoped filter contract regresses.
- At 360px and desktop, essential navigation/actions remain operable and resize cannot leave a mobile overlay on desktop.
- New drafts discard on normal navigation while saved/completed workouts are visible in History.
