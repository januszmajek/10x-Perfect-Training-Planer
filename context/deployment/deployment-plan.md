# Cloudflare Workers Deployment Plan

## 1. Current State

1.1. `[x]` Deployment target is Cloudflare Workers, aligned with `context/foundation/infrastructure.md`.

1.2. `[x]` Use Workers/Wrangler commands only. Do not use Cloudflare Pages commands for this repo.

1.3. `[x]` Local toolchain verified: Node `22.14.0`, pnpm `10.24.0`, Wrangler `4.95.0`.

1.4. `[x]` Local deploy gates pass: `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm build`, and `pnpm exec wrangler deploy --dry-run --outdir .wrangler\deploy-dry-run`.

1.5. `[x]` Cloudflare login verified with `pnpm exec wrangler whoami`.

1.6. `[x]` Supabase CLI is available through the project dependency: `pnpm exec supabase --version` returns `2.102.0`.

1.7. `[x]` `.env.production` exists with non-empty `SUPABASE_URL` and low-privilege `SUPABASE_KEY` values.

## 2. Non-Negotiable Safety Rules

2.1. `[x]` Keep `.env`, `.env.production`, `.dev.vars`, Supabase access tokens, database passwords, and Cloudflare tokens out of git and chat.

2.2. `[x]` Never use a Supabase `service_role` key or `sb_secret_...` key as `SUPABASE_KEY`; use a publishable key or legacy `anon` key.

2.3. `[x]` Do not run destructive Supabase actions through the agent: project deletion, user deletion, table drops, primary secret rotation, or production data resets.

2.4. `[x]` Do not run `supabase config push` casually. It pushes project configuration from `supabase/config.toml`, so review the diff and exact auth settings first.

## 3. Supabase CLI Setup

3.1. `[x]` Human gate: create or reuse a Supabase account, enable MFA

3.5. `[x]` Retrieve the project ref and low-privilege API key with the CLI, then create untracked `.env.production` without printing key values:

```powershell
pnpm exec supabase projects api-keys --project-ref <project-ref> --output-format json
```

Expected `.env.production` shape:

```text
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_KEY=<publishable-or-anon-key>
```

3.6. Optional procedure — no current action required. Link the repo to the Supabase project only if database
migrations, type generation, or config pushes are needed:

```powershell
pnpm exec supabase link --project-ref <project-ref>
```

The link step may require the database password. It is not required just to deploy the Worker with `SUPABASE_URL` and `SUPABASE_KEY`.

## 4. Production Deploy

4.1. `[x]` Re-run hard local gates immediately before deployment:

```powershell
pnpm install --frozen-lockfile
pnpm lint
pnpm build
pnpm exec wrangler deploy --dry-run --outdir .wrangler\deploy-dry-run
```

4.2. `[x]` Deploy the Worker with production Supabase secrets:

```powershell
pnpm exec wrangler deploy --secrets-file .env.production
```

Check result on 2026-06-08: `pnpm exec wrangler deploy --secrets-file .env.production` passed.

4.3. `[x]` Capture the deployed URL, Worker version/deployment ID, and a short command-output summary.

Deployment result on 2026-06-08:

- URL: `https://perfect-training-planner.januszmajekjm.workers.dev`
- Deployment ID: `94b142c4-a045-41b0-930d-01ec82936386`
- Worker version ID: `81b34e5a-1dde-4a0e-a6d2-3adf9d89035d`
- Deployment source: `wrangler`
- Traffic: version `81b34e5a-1dde-4a0e-a6d2-3adf9d89035d` at 100%
- Provisioned during deploy: `SESSION` KV namespace `e68262e636e44a4a94d71bede303b141`

Pre-deploy checks completed on 2026-06-08:

- `.env.production` exists and contains non-empty `SUPABASE_URL` and `SUPABASE_KEY` values.
- `.env.production` is covered by `.gitignore`.
- `SUPABASE_KEY` does not match obvious unsafe key patterns: `sb_secret_*` or `service_role`.
- `pnpm install --frozen-lockfile` passed. The first sandboxed run failed because registry access was restricted after `node_modules` was recreated; the approved rerun completed successfully.
- `pnpm lint` passed.
- `pnpm build` passed. The first sandboxed run failed because Wrangler/Miniflare could not write logs and registry files under the user profile; the approved rerun completed successfully.
- `pnpm exec wrangler deploy --dry-run --outdir .wrangler\deploy-dry-run` passed.
- `pnpm exec wrangler deploy --secrets-file .env.production` passed.

  4.4. `[x]` Configure AI workout generation separately from Supabase deployment secrets:

```powershell
pnpm exec wrangler secret put AI_KEY_ENCRYPTION_KEY_V1
pnpm exec wrangler secret put OPENROUTER_MODEL
pnpm exec wrangler secret put AI_CONFIRMATION_SIGNING_SECRET
```

`AI_KEY_ENCRYPTION_KEY_V1` is the versioned Worker root secret that encrypts and decrypts user-owned credentials.
`OPENROUTER_MODEL` is the fixed server-selected model identifier and must support strict structured JSON output. Neither
value is a user OpenRouter API key. Each user enters their own BYOK credential at `/account`; it is encrypted in
Supabase and must never be copied to a Worker secret, `.env.production`, `.dev.vars`, command-line argument, log, or
deployment output.

`AI_CONFIRMATION_SIGNING_SECRET` is independent high-entropy signing material for the short-lived owner-bound reduced
generation confirmation. Enter it only through Wrangler's hidden prompt. Do not reuse the credential-encryption root
or a provider key. Rotation invalidates outstanding confirmations, which users can replace by starting generation
again; a database nonce alone cannot authorize a reduced request.

Configuration result on 2026-09-13:

- Updated `AI_KEY_ENCRYPTION_KEY_V1`, `OPENROUTER_MODEL`, and `AI_CONFIRMATION_SIGNING_SECRET` from the untracked
  `.dev.vars` file through Wrangler stdin without printing their values.
- Confirmed all three names are present in the deployed Worker's secret binding list.
- Re-ran unauthenticated production checks: `/`, `/auth/signin`, and `/auth/signup` returned `200`; `/dashboard`
  returned `302` to `/auth/signin`.

## 5. Supabase Auth Redirects

5.1. `[x]` After Cloudflare returns the production URL, decide whether redirects are needed for the current MVP auth mode.

5.2. `[x]` If email confirmation, magic links, OAuth, or password-reset links are enabled, set the production Site URL and exact redirect URLs before public testing.

## 6. Production Verification

6.1. `[x]` Read the latest deployment status:

```powershell
pnpm exec wrangler deployments status --json
```

6.3. `[x]` Smoke test `/`, `/auth/signin`, `/auth/signup`, and `/dashboard`.

6.4. `[x]` Confirm unauthenticated `/dashboard` redirects to `/auth/signin`.

6.5. `[x]` Test signup, email-confirmat/
ion behavior if enabled, signin, dashboard access, and signout with a disposable Supabase user.

6.6. `[x]` Confirm production no longer shows the missing-Supabase fallback.

Smoke result on 2026-06-08:

- `GET /`: `200 OK`
- `GET /auth/signin`: `200 OK`
- `GET /auth/signup`: `200 OK`
- `GET /dashboard`: `302 Found`, `Location: /auth/signin`
- Missing Supabase fallback: not present on the deployed homepage

  6.7. `[x]` Perform the S-08 AI workout smoke test with disposable users and keys only after 4.4 is complete:

- use a new account with no completed workouts, configure the disposable key at `/account`, and generate from the
  AI workout proposal card at `/workouts/new`;
- confirm the 5–7 exercise proposal arrives, can be edited, and saves as an
  AI-origin workout;
- confirm an invalid key and an unavailable provider lead to sanitized configuration or retry actions, without
  clearing an existing proposal;
- for completed-history fixtures, verify five-plus only generates a normal proposal; three or four makes no provider
  call until explicit confirmation; and fewer than three leaves manual planning available without a provider call;
- verify Like and **Don't suggest** persist, are mutually exclusive, and affect only a later proposal; save and
  complete a history-aware proposal and confirm its opaque owner-scoped lifecycle evidence;
- inspect the `purge-expired-ai-recommendation-data` job and its recent sanitized status, confirming cleanup preserves
  workouts and durable preferences;
- inspect only sanitized `pnpm exec wrangler tail` output, then remove every disposable key.

S-08 execution record on 2026-09-13:

- Created one disposable account and confirmed the invalid-key path returns a sanitized error. A disposable valid
  BYOK credential then saved successfully without exposing its value.
- Generated a six-exercise cold-start proposal, edited Back Squat from three to four sets, verified Like and
  **Don't suggest** are mutually exclusive, saved the AI-origin workout, completed it, and found it in private
  history.
- Verified the Back Squat **Don't suggest** preference persisted and did not alter the already-open draft. The next
  history-aware proposal contained five recovery-compatible exercises and excluded Back Squat; it saved, completed,
  and appeared in the same signed-in account's history.
- After completing that workout, generation stopped at an explicit four-exercise confirmation. No proposal was
  produced until confirmation; the confirmed proposal contained exactly four exercises and completed normally.
- After completing the four-exercise workout, generation returned a sanitized fewer-than-three message, left the
  manual builder available, and made no provider proposal.
- The production retention job is active on `17 3 * * *`; its latest run at `2026-09-13 03:17 UTC` succeeded. The
  deployed function deletes expired recommendation telemetry and confirmations only, while database tests verify
  that workout history and durable preferences remain.
- A sanitized Wrangler tail captured one `GET /history` event with outcome `ok`, zero exceptions, zero application
  logs, and no credential-pattern matches.
- `pnpm test:ai-workout` passed all 14 suites covering the provider/retry and proposal-preservation contracts.
- Confirmed the disposable user's OpenRouter key was removed: the account returned `status=removed` and displayed
  the provider as **Not configured**.

6.7 was accepted as complete on 2026-09-13. The unavailable-provider scenario remains covered by the passing
contract suite; it was not induced by changing the shared production Worker configuration.

## 7. Rollback And Troubleshooting

7.1. If secrets are wrong or missing, fix the appropriate untracked local secret file and upload the corrected
binding with Wrangler. Redeploy with `pnpm exec wrangler deploy --secrets-file <untracked-file>` only when Worker code
must also be deployed.

7.2. If auth redirects to localhost, fix Supabase Auth Site URL and redirect URLs, then retest signup/signin.

7.3. If runtime fails under `workerd`, inspect `wrangler tail`, keep `nodejs_compat`, and isolate Node-only dependencies.

7.4. If rollback is needed, use:

```powershell
pnpm exec wrangler deployments list --json
pnpm exec wrangler rollback <VERSION_ID>
```

Supabase schema/data changes do not roll back with Worker code.

7.5. If Supabase signup or signin fails, check Supabase Auth logs and Row Level Security policies before changing keys.

## 8. Deferred Work

8.1. **Deferred:** CI deployment token and GitHub Actions secrets. Activate after the manual CLI deploy and S-08
production smoke test are accepted as stable.

8.2. **Deferred:** Custom domain and DNS changes. Activate after the `workers.dev` deployment passes the S-08
production smoke test.

8.3. **Policy:** BYOK AI provider keys stay out of Cloudflare secrets; they belong in encrypted per-user Supabase
storage.
