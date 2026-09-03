# History List and Filters — Plan Brief

> Full plan: `context/changes/history-list-and-filters/plan.md`

## What & Why

Build the authenticated read-only history required by FR-012. Users can filter completed workouts by inclusive local
dates and multiple muscles, then inspect complete prescriptions without page reloads or separate detail routes.

## Starting Point

Completed workouts already exist as immutable owner-scoped records with ordered exercises and canonical muscle tags.
The database is ready, but the application has no history query, route, filters, pagination, or presentation.

## Desired End State

`/history` server-renders the newest 25 matches, then hydrates into React. Filters update the URL and results without
navigation while cancelling stale requests; Load more appends cursor pages and cards expand inline.

## Key Decisions Made

| Decision           | Choice                                                       | Why                                                          |
| ------------------ | ------------------------------------------------------------ | ------------------------------------------------------------ |
| Date controls      | 7/30/90-day presets, All, and custom range                   | Fast common use plus full arbitrary-range support            |
| Date semantics     | Inclusive browser-local calendar days                        | Matches user expectations around workout dates               |
| Muscle semantics   | OR across selected primary and secondary tags                | Matches existing catalogue and domain contracts              |
| Detail UX          | Inline expandable cards                                      | Keeps history browsing fast and mobile-friendly              |
| Pagination         | 25 items with Load more and tuple cursor                     | Bounds reads while preserving stable ordering                |
| Filter persistence | Canonical URL query parameters                               | Survives refresh and browser navigation                      |
| Filter application | Automatic, debounced, no reload or confirmation              | Supports natural multi-select interaction                    |
| Verification       | Pure Node contracts plus existing gates and manual UI checks | Fits current test infrastructure without framework expansion |
| Data access        | Two-stage typed Supabase query                               | Filters parents while preserving complete unfiltered detail  |
| Database           | No migration                                                 | Existing schema, RLS, and indexes already support S-05       |

## Scope

**In scope:**

- Protected `/history`, navigation, authenticated service/API, and newest-first 25-item cursor pages.
- Presets, custom inclusive dates, muscle multi-select, URL synchronization, cancellation, and stale-response guards.
- Inline complete detail, accessible responsive states, pure history tests, and existing CI gates.

**Out of scope:**

- History mutation or cloning; analytics, performance tracking, exercise search, and origin/equipment filters.
- Dedicated detail routes, infinite scrolling, browser-test adoption, database changes, migration, or deployment.

## Architecture / Approach

Astro authenticates, parses canonical URL filters, and server-renders the first page. A server-only history service
first resolves the filtered cursor-ordered workout IDs, then loads complete prescriptions and tags for those IDs.
One `client:load` React island owns subsequent filters, URL replacement, cancellable API requests, pagination, and
inline expansion without document reloads.

## Phases at a Glance

| Phase                                        | What it delivers                                                        | Key risk                                     |
| -------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------- |
| 1. History Query and Client Contracts        | DTOs, dates, URL/cursor logic, tests, and two-stage owner query         | Nested filtering must not truncate detail    |
| 2. Protected History API and SSR Entry Point | Safe GET endpoint, protected route, initial SSR, and navigation         | Input bounds and auth must remain exact      |
| 3. Responsive No-Reload History Experience   | Immediate filters, URL sync, cancellation, Load more, and inline detail | Rapid requests must never show stale results |

**Prerequisites:** S-04 completion flow and existing local Supabase verification environment.

**Estimated effort:** Approximately 3 implementation sessions across 3 phases.

## Open Risks & Assumptions

- Completed rows remain immutable, making the two-stage read consistent enough without a transaction or RPC.
- Existing indexes are sufficient at MVP scale; measurements may later justify adding `id DESC` to the history index.
- URL dates preserve exact UTC intervals derived from the current browser, rather than changing across timezones.
- Browser interactions remain manually verified because the repository has no browser automation framework.

## Success Criteria (Summary)

- Users can browse and expand only their own completed workouts with complete, correctly ordered prescriptions.
- Date and muscle filters update automatically without confirmation, stale results, or document reloads and restore
  from the canonical URL.
- Stable 25-item cursor pagination, accessible states, 360px layout, pure tests, database gates, lint, and build all
  verify successfully.
