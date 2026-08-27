# Private Account and AI Key Implementation Plan

## Overview

Turn the existing Supabase authentication starter into the first private product workspace and let each signed-in
user manage one OpenRouter API key. Store only an authenticated-encryption payload and a four-character hint in
Supabase, keep encryption and decryption inside Cloudflare Workers, and expose add, masked-view, atomic-replace, and
remove flows through a dedicated account page.

## Current State Analysis

Email/password sign-up, sign-in, sign-out, cookie-backed session refresh, and a protected dashboard already exist.
The dashboard is still a placeholder, successful sign-in returns to the public landing page, only `/dashboard` is
protected by middleware, and there is no authenticated application shell or account route. Supabase currently holds
the catalogue and private workout lifecycle only; there is no credential table, application encryption secret,
crypto service, or AI-key UI.

The completed F-01 foundation provides the patterns this change must extend: forward-only migrations, explicit
grants plus owner RLS, transactional pgTAP policy tests, committed generated types, type-drift CI, and a typed
request-scoped Supabase client. S-01 should use those contracts without pulling OpenRouter requests or AI proposal
logic forward from S-02.

## Desired End State

After this plan is complete:

- A visitor can register and sign in with the existing email/password flow, then lands in a private planner
  workspace with Dashboard and Account navigation.
- An unauthenticated request cannot access `/dashboard`, `/account`, or account credential mutations.
- A signed-in user can add one OpenRouter API key, see only a mask ending in its last four characters, atomically
  replace it, or remove it after an inline confirmation.
- The raw OpenRouter key is accepted only in a same-origin POST body, exists transiently inside the Worker, and is
  never returned to the browser, placed in a URL, seeded, or written to application logs.
- Supabase stores an AES-256-GCM ciphertext, a fresh IV, the non-secret suffix, and an encryption-key version. The
  effective encryption key is derived per user and provider from a versioned Worker secret.
- Owner RLS prevents cross-user reads and mutations. The application continues to use only the publishable/anon
  Supabase key plus the signed-in user's session; it introduces no service-role or `sb_secret_...` credential.
- Missing or malformed encryption configuration fails closed, and a failed replacement leaves the existing
  credential unchanged.
- Database tests, built-in Node crypto tests, generated-type drift, Astro sync, lint, and the Cloudflare Worker build
  pass. Manual checks cover authenticated integration, secret hygiene, and responsive user flows.

### Key Discoveries:

- S-01 is limited to a private workspace and masked AI-key management, with explicit risk against overbuilding
  account settings (`context/foundation/roadmap.md:90`).
- The product requires add, masked view, update, removal, cross-user privacy, and encryption at rest
  (`context/foundation/prd.md:148`, `context/foundation/prd.md:153`).
- Infrastructure places encrypted user keys in Supabase rather than Cloudflare account-level storage and treats RLS
  coverage as a deployment blocker (`context/foundation/infrastructure.md:79`,
  `context/foundation/infrastructure.md:90`).
- The current middleware resolves a verified user for every request but protects only `/dashboard`
  (`src/middleware.ts:4`, `src/middleware.ts:8`).
- The current dashboard is a protected placeholder, and successful sign-in redirects to `/` rather than the
  workspace (`src/pages/dashboard.astro:7`, `src/pages/api/auth/signin.ts:19`).
- The established private-data pattern combines `auth.users` ownership, per-operation RLS, explicit revokes, and
  narrow grants (`supabase/migrations/20260820090200_create_workout_lifecycle.sql:5`,
  `supabase/migrations/20260820090200_create_workout_lifecycle.sql:58`,
  `supabase/migrations/20260820090200_create_workout_lifecycle.sql:163`).
- Cloudflare Workers supports Web Crypto AES-GCM, HKDF, and cryptographically secure random values; Astro enables
  origin checking for form mutation requests by default.
- The repository has pgTAP and full database CI but no JavaScript unit or browser test runner (`package.json:10`,
  `.github/workflows/ci.yml:23`).

## What We're NOT Doing

- Calling OpenRouter, validating a key against OpenRouter, selecting models, generating workouts, or handling AI
  response schemas. Those belong to S-02.
- Supporting OpenAI-direct, Anthropic-direct, or multiple provider credentials in the MVP.
- Revealing, copying, or recovering a stored plaintext key after save.
- Password reset, password change, email change, account deletion, OAuth, magic links, roles, or profile fields.
- A broad dashboard redesign, workout navigation, or workout-planning UI.
- Credential history, rollback to an old user key, or retention of replaced ciphertext.
- Executing master-key rotation. This change stores a version so a later forward rotation can coexist safely.
- Adding Vitest, Jest, Playwright, Cypress, or any third-party test dependency; focused crypto coverage uses Node's
  built-in test runner.
- Applying a hosted Supabase migration, setting a production secret, or deploying the Cloudflare Worker.

## Implementation Approach

Use one public, owner-scoped `ai_provider_keys` table because the application already reaches Supabase through the
authenticated user's cookie session and publishable/anon key. The row contains ciphertext and non-sensitive
metadata, never plaintext. RLS is the cross-user privacy boundary; authenticated encryption remains safe even if an
owner fetches their own ciphertext through the Data API.

In the Worker, decode a versioned unpadded-base64url 256-bit root secret and derive an AES-GCM key with a canonical
HKDF V1 byte contract. Encrypt each save with a new 96-bit random IV and bind the canonical user/provider/version
context as authenticated additional data. Before persistence, decrypt the newly produced payload in memory and
confirm it round-trips; then perform one RLS-safe upsert so configuration or persistence failures cannot destroy the
prior row.

Build the user flow with native same-origin POST forms and Post/Redirect/Get status codes. A dedicated `/account`
page selects only provider, suffix, and update metadata. A small React island owns client validation and inline
remove confirmation; the private shell, page rendering, database access, and authorization remain server-rendered
Astro.

## Critical Implementation Details

### Timing & lifecycle

Replacement ordering is load-bearing: validate configuration and input, encrypt with a fresh IV, verify an in-memory
decrypt round trip, and only then upsert. Never delete the old row first. Removal is a separate authenticated
operation and does not retain a recoverable prior ciphertext.

### State sequencing

The encryption-key version in the row selects the matching Worker secret during decryption. A future rotation must
deploy support for both old and new versions, re-encrypt rows, verify no old versions remain, and only then retire the
old secret; rotation execution is outside this change.

### Cryptographic persistence format

V1 uses unpadded base64url for the 32-byte root secret, ciphertext, and 12-byte IV. HKDF-SHA-256 uses UTF-8 salt
`perfect-training-planner/ai-provider-key/v1` and UTF-8 info
`user=<lowercase-uuid>\nprovider=openrouter`; AES-GCM additional data is UTF-8
`version=1\nuser=<lowercase-uuid>\nprovider=openrouter`, with no trailing newline. These exact bytes are a stored-data
compatibility contract and may change only through a versioned forward migration/rotation.

### User experience spec

After saving, the plaintext field is cleared and the page shows `••••` plus exactly the stored four-character hint.
Replacement failures keep the prior mask and credential intact. Removal requires explicit inline Confirm and Cancel
controls, and all success/error redirects use fixed codes rather than provider, database, crypto, or key text.

### Debug & observability

Credential endpoints may log only a coarse operation name, request outcome, and non-sensitive request identifier.
Do not log request bodies, masks, ciphertext, IVs, derived keys, root-secret versions tied to a user, or raw Supabase
errors that could contain submitted values.

## Phase 1: Encrypted Credential Data Contract

### Overview

Add the durable OpenRouter credential schema, least-privilege access rules, cross-user security tests, generated
types, and stable contract documentation.

### Changes Required:

#### 1. AI-provider key migration

**File**: `supabase/migrations/20260827130000_create_ai_provider_keys.sql`

**Intent**: Create the single-row-per-user persistence boundary for an encrypted OpenRouter credential and its
non-secret display metadata.

**Contract**: Define `ai_provider` with the single MVP value `openrouter`. Create `ai_provider_keys` with `user_id`
as the primary key and cascading foreign key to `auth.users.id`, provider defaulted to `openrouter`, non-empty
base64url ciphertext and IV fields, an exactly four-character `key_hint`, positive `encryption_key_version`, and
database-managed `created_at`/`updated_at` timestamps. A private trigger updates `updated_at` without granting
timestamp mutation to authenticated clients.

Enable RLS and add explicit owner SELECT, INSERT, UPDATE, and DELETE policies with both UPDATE `USING` and
`WITH CHECK` enforcing `(select auth.uid()) = user_id`. Revoke anonymous access and broad authenticated privileges,
then grant only the columns required for the direct PostgREST upsert: INSERT accepts `user_id` plus encrypted payload
fields; UPDATE accepts the same-value `user_id` conflict key plus replaceable payload fields. The application omits
`provider` from the upsert, so the database default applies and provider/timestamps remain un-updatable. RLS makes
cross-user reassignment impossible even though PostgREST needs UPDATE on the same-value conflict key. Preserve full
database-owner/service-role migration access, but introduce no service-role application secret.

#### 2. Credential database security tests

**File**: `supabase/tests/database/ai_provider_keys.test.sql`

**Intent**: Prove the schema, constraints, grants, and user-isolation boundary independently of the application
routes.

**Contract**: Add transactional pgTAP coverage for the enum/table/primary key/foreign key, one row per user,
provider and metadata constraints, timestamp trigger, RLS enablement, exact policy set, anonymous denial, permitted
authenticated columns, protected provider/timestamp columns, direct upsert replacement, same-owner conflict-key
updates, cross-user ownership reassignment denial, owner CRUD, cross-user invisibility/mutation denial, and cascade
removal when the auth user is deleted. Use disposable local identities and rollback. Tests use fake ciphertext-like
values only and never a real provider credential.

#### 3. Generated Supabase types

**File**: `src/types/database.types.ts`

**Intent**: Expose the new table and provider enum to server-side TypeScript through the established generated
contract.

**Contract**: Regenerate the local `public` schema after a clean reset and normalize it with the pinned Prettier
configuration. Do not hand-edit generated types; the existing CI type-drift comparison remains authoritative.

#### 4. Contract surface registry

**File**: `docs/reference/contract-surfaces.md`

**Intent**: Make later AI slices reuse the exact credential names and encryption metadata instead of inventing a
parallel secret store.

**Contract**: Append the migration order, `ai_provider.openrouter`, `ai_provider_keys` columns, one-key-per-user
invariant, owner-RLS rule, ciphertext-only storage rule, key-version meaning, and pgTAP test path. State that later
provider calls obtain plaintext only through the server-side credential service.

### Success Criteria:

#### Automated Verification:

- A clean local reset applies the credential migration: `pnpm exec supabase db reset --local`
- The public schema passes database lint: `pnpm exec supabase db lint --local --schema public --fail-on error`
- Credential pgTAP tests pass: `pnpm exec supabase test db --local supabase/tests/database/ai_provider_keys.test.sql`
- The full database suite passes: `pnpm exec supabase test db --local supabase/tests/database`
- Regenerated and Prettier-normalized public types have no diff from `src/types/database.types.ts`

#### Manual Verification:

- Inspect the migration and test fixtures and confirm neither contains a plaintext or real provider credential.
- With two disposable local users, confirm each user sees and mutates only their own encrypted row.

**Implementation Note**: After completing this phase and all automated verification passes, pause for human
confirmation that the schema, privileges, and cross-user isolation are acceptable before proceeding to Phase 2.

---

## Phase 2: Server-Only Credential Lifecycle

### Overview

Implement fail-closed Worker encryption, typed credential persistence, and authenticated save/replace/remove
endpoints without making any OpenRouter request.

### Changes Required:

#### 1. Versioned encryption-secret configuration

**Files**: `astro.config.mjs`, `README.md`

**Intent**: Declare and document the server-only root key needed to encrypt user credentials while keeping builds
possible in environments where the feature is intentionally unavailable.

**Contract**: Add optional secret `AI_KEY_ENCRYPTION_KEY_V1` to the Astro server environment schema. Its runtime
value is unpadded base64url and must decode to exactly 32 random bytes. Document placeholder-only local
`.env`/`.dev.vars` configuration, secure generation in that exact encoding, and
`pnpm exec wrangler secret put AI_KEY_ENCRYPTION_KEY_V1` for an explicitly approved hosted setup. Never commit or
print an actual value. A missing or malformed value disables credential mutations and does not fall back to
plaintext storage.

#### 2. Request-local Supabase client

**Files**: `src/env.d.ts`, `src/middleware.ts`

**Intent**: Reuse the single authenticated client that middleware already creates, including any refreshed cookie
state, instead of reconstructing a second client in account pages and endpoints.

**Contract**: Extend `App.Locals` with the nullable typed Supabase client returned by `createClient`. Middleware
assigns `context.locals.supabase` before resolving `context.locals.user`; account pages and credential endpoints use
that local client and still check the verified local user. Preserve the existing nullable configuration behavior and
cookie writes. Existing auth endpoints may keep their current construction pattern; normalizing them is out of
scope.

#### 3. Worker crypto contract

**File**: `src/lib/ai-provider-key-crypto.ts`

**Intent**: Centralize provider-key encryption and decryption in a runtime-portable, server-only module for reuse by
this change and S-02.

**Contract**: Provide typed encrypt/decrypt operations for provider `openrouter` and encryption version `1`. Keep
the module free of `astro:env/server` imports: the credential service resolves and injects the versioned root-secret
string so the crypto contract can run under both Workers and Node's Web Crypto tests. Decode unpadded base64url to
exactly 32 bytes, import it as HKDF input key material, and derive a non-extractable AES-256-GCM key with the exact
salt/info/additional-data byte layout defined under Critical Implementation Details. Generate a fresh 12-byte IV for
each encryption and encode ciphertext/IV as unpadded base64url. Decryption rejects padded/non-canonical or malformed
encodings, unknown versions, wrong user/provider context, and authentication-tag failures with one generic internal
error containing no secret material.

#### 4. Crypto contract tests

**Files**: `src/lib/ai-provider-key-crypto.test.ts`, `package.json`, `.github/workflows/ci.yml`

**Intent**: Execute the stored-data compatibility and rejection contracts without adding a third-party test
dependency.

**Contract**: Use Node 22.14's built-in test runner with `--experimental-strip-types` and a relative import that does
not rely on TypeScript path aliases. Add `pnpm test:crypto` covering deterministic root-secret decoding, successful
round trip, fresh-IV/non-deterministic ciphertext, canonical unpadded base64url output, tamper rejection, wrong
user/provider authenticated context, malformed/padded encodings, unknown versions, and invalid root-secret length.
Use a deterministic fake 32-byte secret generated inside the test only. Add the command as a distinct CI gate before
Astro sync/lint/build.

#### 5. Shared key validation contract

**File**: `src/lib/ai-provider-key-validation.ts`

**Intent**: Give the React form and server service one client-safe definition of acceptable structural input without
exposing server crypto or environment modules to the browser bundle.

**Contract**: Export the 16/512 length constants and a pure validator for trimmed printable ASCII with no
whitespace/control characters. The module imports no Astro server environment, Supabase client, or crypto service;
both `AiKeyForm` and `ai-provider-keys` consume it.

#### 6. Credential service

**File**: `src/lib/ai-provider-keys.ts`

**Intent**: Keep input rules, masking metadata, encryption sequencing, and Supabase persistence out of route and UI
components.

**Contract**: Use the shared validator; do not require an OpenRouter prefix or make a network request. Expose
operations to read masked metadata, encrypt and atomically upsert an owned key, remove an owned key, and decrypt an
owned record for later server-only AI use. Resolve `AI_KEY_ENCRYPTION_KEY_V1` here and inject it into the crypto
module. Save computes the final four-character hint, encrypts, verifies an immediate in-memory decrypt round trip,
then calls direct `.upsert(..., { onConflict: "user_id" })` with `user_id` and mutable payload fields only; omit
`provider` so its database default remains immutable. Return a small discriminated result vocabulary such as
success, invalid input, unavailable encryption, unauthenticated, or persistence failure; never return raw
provider/database errors.

#### 7. Save and replace endpoint

**File**: `src/pages/api/account/ai-key.ts`

**Intent**: Give the native account form one authenticated same-origin mutation endpoint for both first save and
atomic replacement.

**Contract**: Implement POST only. Re-check `Astro.locals.user`, require `Astro.locals.supabase`,
read exactly the expected `apiKey` form field, delegate to the credential service, and redirect with fixed
`status=saved` or bounded error codes. Preserve Astro's default `security.checkOrigin` protection. Do not echo input,
include it in redirect URLs, or log it.

#### 8. Remove endpoint

**File**: `src/pages/api/account/ai-key/remove.ts`

**Intent**: Keep deletion explicit and separate from save/replace semantics so a failed update can never be
implemented as delete-first.

**Contract**: Implement authenticated POST only, delete the caller's owned row through the credential service, and
redirect with fixed `status=removed` or bounded error codes. Treat an already-absent row as an idempotent successful
end state. Never accept a user ID or provider from the browser.

### Success Criteria:

#### Automated Verification:

- Astro types synchronize successfully: `pnpm astro sync`
- Repository lint passes: `pnpm lint`
- The Cloudflare Worker production build passes with the encryption secret absent: `pnpm build`
- The full database suite and generated-type drift check still pass through the repository's existing CI commands
- Built-in crypto contract tests pass: `pnpm test:crypto`

#### Manual Verification:

- Using a disposable fake local key, save and replace through authenticated POST requests and confirm Supabase never
  contains the plaintext while ciphertext and IV change on replacement.
- Confirm an attempted replacement with missing or malformed `AI_KEY_ENCRYPTION_KEY_V1` fails before persistence and
  leaves the previous row unchanged.
- Confirm submitted key text appears in neither redirect URLs, browser-visible error bodies, nor development logs.
- Confirm a non-owner and an unauthenticated request cannot read, replace, or remove another user's credential.
- Confirm the request-local Supabase client is reused after middleware authentication and cookie refresh.

**Implementation Note**: After completing this phase and all automated verification passes, pause for human
confirmation that encryption, atomic replacement, failure behavior, and secret hygiene are correct before proceeding
to Phase 3.

---

## Phase 3: Private Workspace and Account Experience

### Overview

Create the minimal authenticated workspace shell and dedicated account page, then expose masked OpenRouter key
management with responsive, accessible interactions.

### Changes Required:

#### 1. Authenticated workspace layout

**File**: `src/layouts/AuthenticatedLayout.astro`

**Intent**: Give current and future private pages one responsive shell for identity, Dashboard/Account navigation,
and sign-out without redesigning the public landing page.

**Contract**: Compose the existing root `Layout`, require `Astro.locals.user`, render a keyboard-accessible header
with Dashboard and Account destinations plus the existing POST sign-out action, and provide a content slot. At
360px, long email text must truncate or wrap without pushing navigation off-screen. Keep the shell server-rendered.

#### 2. Account page

**File**: `src/pages/account.astro`

**Intent**: Provide the protected settings destination and ensure only non-secret credential metadata crosses into
the UI.

**Contract**: Require `Astro.locals.user` and `Astro.locals.supabase`, then obtain only `provider`, `key_hint`, and
`updated_at` through the credential service's masked-metadata operation. Map fixed query status codes to user-safe
messages, expose a clear unavailable state when encryption configuration is absent, and render the key form with
configured/unconfigured metadata. Never select, decrypt, or pass ciphertext/plaintext to the browser merely to
render settings.

#### 3. OpenRouter key form

**File**: `src/components/account/AiKeyForm.tsx`

**Intent**: Implement accessible client-side input feedback, suffix-only masked state, pending states, atomic
replacement language, and inline remove confirmation.

**Contract**: Import the constants and pure validator from `ai-provider-key-validation.ts`. Use a password input with
label, description, error association, disabled/pending handling, and appropriate autocomplete/spellcheck
attributes. When configured, display only `••••{keyHint}` and replacement timestamp; never offer reveal/copy.
Submit save/replace to `/api/account/ai-key`. The first remove action exposes explicit Confirm and Cancel controls;
confirmation posts to `/api/account/ai-key/remove`. Clear local plaintext after submission/navigation and preserve
the old masked state until replacement succeeds.

#### 4. Workspace entry and navigation integration

**Files**: `src/pages/dashboard.astro`, `src/pages/api/auth/signin.ts`, `src/components/Topbar.astro`

**Intent**: Turn successful authentication into a coherent private-workspace entry without expanding account
management.

**Contract**: Render the dashboard inside `AuthenticatedLayout`, redirect successful sign-in to `/dashboard`, and
add an Account destination for authenticated users in the public top bar while keeping sign-out as POST. Preserve
existing sign-up, email confirmation, and session behavior.

#### 5. Protected route boundary

**File**: `src/middleware.ts`

**Intent**: Extend centralized authentication enforcement to the account page and its mutation endpoints while
retaining endpoint-level checks as defense in depth.

**Contract**: Extend the middleware already updated with `context.locals.supabase` to protect `/dashboard`,
`/account`, and `/api/account` route families with boundary-aware matching so similarly prefixed public paths are
not captured accidentally. Unauthenticated page requests redirect to sign-in; credential endpoints still verify
both locals and never trust form-provided ownership.

### Success Criteria:

#### Automated Verification:

- A clean local database reset, database lint, full pgTAP suite, and generated-type drift check all pass
- Built-in crypto contract tests pass: `pnpm test:crypto`
- Astro types synchronize successfully: `pnpm astro sync`
- Repository lint passes: `pnpm lint`
- Production SSR build passes under the Cloudflare adapter: `pnpm build`

#### Manual Verification:

- Register, sign in, land on `/dashboard`, navigate to `/account`, sign out, and confirm protected pages redirect
  signed-out visitors to `/auth/signin`.
- Add, mask, atomically replace, cancel removal, confirm removal, refresh, and sign in again; the displayed state
  remains correct and plaintext is never shown after save.
- With two disposable users, confirm each account displays and mutates only its own OpenRouter credential.
- At 360px and a desktop viewport, verify navigation, long email handling, focus order, labels, error announcements,
  pending states, and inline confirmation remain usable.
- Confirm no account action makes an OpenRouter network request and no hosted migration, secret mutation, or Worker
  deployment occurs.

**Implementation Note**: After completing this phase and all automated verification passes, pause for human
confirmation of the authenticated navigation, responsive account UX, end-to-end key lifecycle, and no-deployment
boundary before closing the change.

---

## Testing Strategy

### Database Unit and Policy Tests:

- Use transactional pgTAP in `supabase/tests/database/ai_provider_keys.test.sql`; do not add a third-party JavaScript
  runner.
- Verify schema names, constraints, timestamp behavior, exact policies, privileges, anonymous denial, owner CRUD,
  cross-user isolation, and auth-user cascade deletion.
- Use obviously fake ciphertext/IV/key-hint values. Never put a real OpenRouter key or the Worker root key in tests,
  migrations, seed data, snapshots, or CI output.
- Run the credential test directly and through the full database suite after a clean local reset.

### Integration Tests:

- Regenerate `src/types/database.types.ts` from the reset local `public` schema, format it with pinned Prettier, and
  rely on the existing CI diff to detect drift.
- Compile all server-only environment, crypto, service, endpoint, and page contracts through `pnpm astro sync`,
  `pnpm lint`, and `pnpm build` under the Cloudflare adapter.
- Run `pnpm test:crypto` in Node 22.14 and CI for positive and negative crypto contracts. Treat the additional
  in-memory encrypt/decrypt verification before upsert as a runtime invariant, not provider-key validity. S-02 owns
  live OpenRouter validation and request behavior.

### Manual Testing Steps:

1. Configure local Supabase plus a disposable 32-byte version-1 encryption secret without printing or committing it.
2. Create two disposable users and exercise sign-in, protected navigation, add, refresh, replace, and remove flows.
3. Inspect local database rows after save and replacement; confirm plaintext is absent, the hint is four characters,
   and fresh ciphertext/IV values are produced.
4. Disable or corrupt the local encryption secret, retry replacement, and confirm the prior encrypted row remains.
5. Inspect browser URLs, responses, terminal output, and application logs for accidental secret reflection.
6. Verify signed-out and cross-user access failures, then repeat the UI flow at 360px and desktop widths.
7. Confirm no request reaches OpenRouter and no hosted Supabase or Cloudflare state changes.

## Performance Considerations

The expected scale is small and each user has one short credential row. One HKDF derivation, AES-GCM operation, and
single-row Supabase mutation per save are negligible relative to network latency. Do not cache plaintext, derived
user keys, or decrypted provider keys across requests. Add no credential indexes beyond the primary key until a
multi-provider requirement exists.

## Migration Notes

- The new table starts empty; there is no credential backfill and no key belongs in `supabase/seed.sql`.
- Keep the migration forward-only after hosted application. Schema rollback and Worker rollback remain separate.
- `AI_KEY_ENCRYPTION_KEY_V1` must be configured before credential mutation is enabled in a deployed environment, but
  setting that hosted secret is an explicitly approved operational action outside implementation.
- `encryption_key_version` prepares for rotation without implementing it. A future rotation must keep V1 available
  while decrypting and re-encrypting rows under V2, then prove no V1 rows remain before secret retirement.
- Deleting an auth user cascades the encrypted credential row. Account deletion UI is not part of this change.
- Never use `supabase db reset --linked`, apply the migration remotely, or deploy the Worker during implementation.

## References

- Change identity: `context/changes/private-account-and-ai-key/change.md`
- Product requirements: `context/foundation/prd.md:83`, `context/foundation/prd.md:148`,
  `context/foundation/prd.md:153`
- Roadmap slice: `context/foundation/roadmap.md:90`
- Infrastructure security constraints: `context/foundation/infrastructure.md:73`,
  `context/foundation/infrastructure.md:79`, `context/foundation/infrastructure.md:90`
- Existing auth/session boundary: `src/lib/supabase.ts:6`, `src/middleware.ts:4`
- Existing private-data migration pattern: `supabase/migrations/20260820090200_create_workout_lifecycle.sql:58`
- Existing RLS test pattern: `supabase/tests/database/workout_lifecycle.test.sql:112`,
  `supabase/tests/database/workout_lifecycle.test.sql:330`
- Existing verification gates: `.github/workflows/ci.yml:23`
- Database contract registry: `docs/reference/contract-surfaces.md`
- Cloudflare Web Crypto: https://developers.cloudflare.com/workers/runtime-apis/web-crypto/
- Supabase Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase Data API security: https://supabase.com/docs/guides/api/securing-your-api
- Astro origin checking: https://docs.astro.build/en/reference/configuration-reference/#securitycheckorigin
- OpenRouter API key authentication: https://openrouter.ai/docs/api/api-reference/api-keys/get-current-key

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Encrypted Credential Data Contract

#### Automated

- [x] 1.1 Clean local reset applies the credential migration
- [x] 1.2 Public schema passes database lint
- [x] 1.3 Credential pgTAP tests pass
- [x] 1.4 Full database suite passes
- [x] 1.5 Generated and normalized public database types have no drift

#### Manual

- [x] 1.6 Migration and fixtures contain no plaintext or real provider credential
- [x] 1.7 Two disposable users are isolated to their own encrypted rows

### Phase 2: Server-Only Credential Lifecycle

#### Automated

- [ ] 2.1 Astro types synchronize successfully
- [ ] 2.2 Repository lint passes
- [ ] 2.3 Cloudflare Worker build passes without an encryption secret
- [ ] 2.4 Existing database and generated-type gates remain green
- [ ] 2.9 Built-in crypto contract tests pass

#### Manual

- [ ] 2.5 Save and replacement store fresh ciphertext and never plaintext
- [ ] 2.6 Encryption misconfiguration fails closed and preserves the prior row
- [ ] 2.7 URLs, responses, and logs contain no submitted key text
- [ ] 2.8 Unauthenticated and cross-user credential operations are denied
- [ ] 2.10 Request-local Supabase client is reused after authentication and cookie refresh

### Phase 3: Private Workspace and Account Experience

#### Automated

- [ ] 3.1 Final database and generated-type gates pass
- [ ] 3.2 Astro types synchronize successfully
- [ ] 3.3 Repository lint passes
- [ ] 3.4 Production Cloudflare Worker build passes
- [ ] 3.10 Built-in crypto contract tests pass

#### Manual

- [ ] 3.5 Authentication enters and protects the private workspace
- [ ] 3.6 Masked add, replace, cancel-remove, confirm-remove, and persistence flows work
- [ ] 3.7 Two account pages remain isolated to their owners
- [ ] 3.8 Workspace and account interactions are usable at 360px and desktop widths
- [ ] 3.9 No OpenRouter request, hosted migration, secret mutation, or deployment occurs
