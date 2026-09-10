# Navigation and Application State — Plan Brief

> Full plan: `context/changes/navigation/plan.md`

## What & Why

Browser Back/Forward can restore a frozen private page, including its React state and native dialogs, without rerunning
SSR authentication or data loading. This change reloads restored private pages so users never return to a stale
logged-in screen or an unexpectedly reopened dialog.

The refresh deliberately resets volatile UI. It preserves only catalogue filters and recovery sort, plus the existing
history URL filters, because those are navigational criteria rather than private unsaved work.

## Starting Point

All authenticated routes use one Astro layout and server middleware resolves the current Supabase user for a real
request. The app has several independently controlled dialogs and drawers, while only history filters are currently
represented in the URL; builder catalogue criteria remain local React state.

## Desired End State

When Back or Forward restores a private page from BFCache, the browser reloads its current URL. The new request
revalidates auth and fresh data, closing all prior dialogs/drawers and removing stale drafts, errors, pending actions,
and expanded details. A signed-out user is redirected to sign-in before private content renders.

Selected workout-catalogue search, muscle/equipment filters, and recovery sort remain in the URL on both builder
routes. History keeps its existing query criteria; no transient UI is carried forward.

## Key Decisions Made

| Decision | Choice | Why |
| --- | --- | --- |
| Refresh boundary | `AuthenticatedLayout` on `pageshow.persisted` | Covers every private island without disrupting public auth forms. |
| Restore behavior | Reload the current URL | Re-runs middleware, Supabase auth, and SSR loaders while preserving browser history position. |
| Retained state | Catalogue/history criteria only | Keeps navigation intent without preserving stale or private unsaved content. |
| Sign-out behavior | Existing `/auth/signin` redirect | Uses the established server-side authorization boundary without expanding auth flow. |
| Verification | Manual browser testing plus lint/build | Matches the request not to add tests for this removal-focused lifecycle fix. |

## Scope

**In scope:**

- BFCache refresh on private pages.
- URL-backed catalogue search, muscle/equipment filters, and recovery sort for new/edit workout routes.
- Manual verification of dialogs, auth, data refresh, and retained criteria.

**Out of scope:**

- Draft/proposal/dialog persistence, client routing, public auth-page changes, database/API changes, and new test tooling.

## Architecture / Approach

`AuthenticatedLayout` detects a BFCache restoration with `pageshow.persisted` and reloads. Each workout page parses a
shared, validated catalogue-query codec, passes the resulting criteria to the shared editor, and the editor updates
the same URL with `replaceState`. The normal SSR reload then refreshes data/auth and recreates every other island state.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Refresh restored private documents | Shared BFCache reload boundary | Reloading on an initial `pageshow` would loop. |
| 2. Preserve catalogue filters and recovery sort | Canonical URL criteria on both workout routes | Accidentally serializing private drafts or transient UI. |
| 3. Regression verification and handoff | Lint/build plus manual browser matrix | BFCache behavior needs real-browser confirmation. |

**Prerequisites:** Existing authenticated SSR layout and workout routes; a local authenticated session for manual checks.
**Estimated effort:** Approximately 1–2 implementation sessions across three phases.

## Open Risks & Assumptions

- A BFCache restore intentionally becomes a fresh request for private pages; this is a correctness-over-instant-restore
  tradeoff.
- The current app exposes recovery sort only in the shared workout catalogue; no separate user-facing history sort
  exists.
- Exact scroll restoration remains browser-managed and is not a contract of this change.

## Success Criteria (Summary)

- Back/Forward cannot reopen a private dialog/drawer or display stale authenticated data.
- Back after sign-out routes through middleware to sign-in.
- History filters and workout catalogue filter/sort criteria survive navigation, while drafts and other volatile UI reset.
