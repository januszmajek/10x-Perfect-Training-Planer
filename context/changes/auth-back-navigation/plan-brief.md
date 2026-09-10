# Auth-page Back Navigation — Plan Brief

> Full plan: `context/changes/auth-back-navigation/plan.md`
> Frame brief: `context/changes/auth-back-navigation/frame.md`

## What & Why

> **The actual problem to plan around is**: Auth-only pages lack an authenticated-user boundary and BFCache revalidation, allowing a stale pre-login document to be displayed after a session is established.

The solution preserves normal browser history while ensuring an authenticated user never sees a credential-entry form after returning with Back or visiting it directly.

## Starting Point

Middleware already resolves the Supabase user, and successful sign-in already redirects to Dashboard. The missing pieces are the inverse route guard for `/auth/signin` and `/auth/signup`, plus the public-page equivalent of the existing private BFCache refresh.

## Desired End State

Signed-in users always arrive at Dashboard when they visit or restore a credential-entry page. Signed-out users still receive those forms, including after a later Back/Forward restoration. Email confirmation remains unchanged.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Credential-entry scope | Sign-in and sign-up only | Both collect credentials; confirmation has a separate public purpose. | User |
| BFCache behavior | Refresh then use server session state | Correctly handles both a new session and a later sign-out. | User |
| History policy | Preserve Back history | The defect is stale authorization state, not the browser's normal history model. | Frame |
| Cache headers | No global cache change | Lifecycle revalidation is targeted and avoids degrading unrelated navigation. | Plan |

## Scope

**In scope:**

- Authenticated redirects from sign-in and sign-up routes.
- A shared BFCache-refresh boundary for those routes.
- Lint, build, and real-browser auth-history verification.

**Out of scope:**

- Email-confirmation changes.
- Client-side session lookups, data migration, and new test tooling.
- Global cache-control changes.

## Architecture / Approach

Middleware remains the source of truth for session decisions. The two credential-entry routes share a lightweight layout that refreshes only a BFCache-restored document; the fresh request then reaches middleware and either renders the form or redirects to Dashboard.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Server boundary | Authenticated redirect for credential-entry routes | Accidentally redirecting the confirmation route |
| 2. BFCache revalidation | Fresh session decision after Back/Forward restoration | Reloading on normal page show |

**Prerequisites:** Local Supabase configuration and a browser test account.
**Estimated effort:** One implementation session across two phases.

## Open Risks & Assumptions

- Real BFCache restoration differs by browser, so manual browser verification remains required.
- The redirect target remains `/dashboard`, matching current post-login behavior.

## Success Criteria (Summary)

- Back after a successful sign-in never exposes the old sign-in card.
- Direct authenticated visits to sign-in and sign-up resolve to Dashboard.
- Signing out later still allows the credential-entry forms to render.
