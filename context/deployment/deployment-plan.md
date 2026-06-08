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

3.1. `[ ]` Human gate: create or reuse a Supabase account, enable MFA, and create a Supabase personal access token in the dashboard.

3.2. `[ ]` Make the Supabase token available locally without committing it. Preferred for agent work:

```powershell
$env:SUPABASE_ACCESS_TOKEN = "<token-from-password-manager>"
```

Alternative browser flow:

```powershell
pnpm exec supabase login --no-browser
```

3.3. `[ ]` Verify Supabase CLI access without printing secrets:

```powershell
pnpm exec supabase orgs list --output-format json
pnpm exec supabase projects list --output-format json
```

3.4. `[ ]` Select the existing hosted Supabase project for Perfect Training Planner. If no project exists, prefer creating it manually in the dashboard so the database password is not passed as a command argument. CLI creation is possible with:

```powershell
pnpm exec supabase projects create perfect-training-planner --org-id <org-id> --region eu-central-1 --size nano --db-password <password>
```

3.5. `[ ]` Retrieve the project ref and low-privilege API key with the CLI, then create untracked `.env.production` without printing key values:

```powershell
pnpm exec supabase projects api-keys --project-ref <project-ref> --output-format json
```

Expected `.env.production` shape:

```text
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_KEY=<publishable-or-anon-key>
```

3.6. `[ ]` Link the repo to the Supabase project only if database migrations, type generation, or config pushes are needed:

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

## 5. Supabase Auth Redirects

5.1. `[ ]` After Cloudflare returns the production URL, decide whether redirects are needed for the current MVP auth mode.

5.2. `[ ]` If email confirmation, magic links, OAuth, or password-reset links are enabled, set the production Site URL and exact redirect URLs before public testing.

5.3. `[ ]` If using the Supabase CLI for this, update `supabase/config.toml` deliberately, then push:

```powershell
pnpm exec supabase config push --project-ref <project-ref>
```

5.4. `[ ]` Keep localhost redirect URLs for local development. Do not use broad production wildcards.

## 6. Production Verification

6.1. `[x]` Read the latest deployment status:

```powershell
pnpm exec wrangler deployments status --json
```

6.2. `[ ]` Start live Worker logs during smoke testing:

```powershell
pnpm exec wrangler tail perfect-training-planner
```

6.3. `[x]` Smoke test `/`, `/auth/signin`, `/auth/signup`, and `/dashboard`.

6.4. `[x]` Confirm unauthenticated `/dashboard` redirects to `/auth/signin`.

6.5. `[ ]` Test signup, email-confirmation behavior if enabled, signin, dashboard access, and signout with a disposable Supabase user.

6.6. `[x]` Confirm production no longer shows the missing-Supabase fallback.

Smoke result on 2026-06-08:

- `GET /`: `200 OK`
- `GET /auth/signin`: `200 OK`
- `GET /auth/signup`: `200 OK`
- `GET /dashboard`: `302 Found`, `Location: /auth/signin`
- Missing Supabase fallback: not present on the deployed homepage

## 7. Rollback And Troubleshooting

7.1. `[ ]` If secrets are wrong or missing, fix `.env.production` locally and redeploy with `pnpm exec wrangler deploy --secrets-file .env.production`.

7.2. `[ ]` If auth redirects to localhost, fix Supabase Auth Site URL and redirect URLs, then retest signup/signin.

7.3. `[ ]` If runtime fails under `workerd`, inspect `wrangler tail`, keep `nodejs_compat`, and isolate Node-only dependencies.

7.4. `[ ]` If rollback is needed, use:

```powershell
pnpm exec wrangler deployments list --json
pnpm exec wrangler rollback <VERSION_ID>
```

Supabase schema/data changes do not roll back with Worker code.

7.5. `[ ]` If Supabase signup or signin fails, check Supabase Auth logs and Row Level Security policies before changing keys.

## 8. Deferred Work

8.1. `[ ]` CI deployment token and GitHub Actions secrets are deferred until the manual CLI deploy is stable.

8.2. `[ ]` Custom domain and DNS changes are deferred until the `workers.dev` deployment passes smoke tests.

8.3. `[ ]` BYOK AI provider keys stay out of Cloudflare secrets; those belong in encrypted per-user Supabase storage when implemented.
