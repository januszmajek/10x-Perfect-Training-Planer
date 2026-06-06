---
project: Perfect Training Planner
researched_at: 2026-06-06T11:15:50+02:00
recommended_platform: Cloudflare Workers
runner_up: Vercel
context_type: mvp
tech_stack:
  language: JavaScript / TypeScript
  framework: Astro 6.4.2 + React 19.2.6
  runtime: Cloudflare Workers via @astrojs/cloudflare 13.6.0 and Wrangler 4.95.0
---

## Recommendation

**Deploy on Cloudflare Workers.**

This project is already configured as a Workers app: `astro.config.mjs` uses `output: "server"` with `@astrojs/cloudflare`, and `wrangler.jsonc` points at `@astrojs/cloudflare/entrypoints/server`. The interview answers also fit Workers well: the app does not need persistent server-side processes, expected traffic is small, developer experience matters more than absolute lowest cost, and Supabase can remain the external auth/database provider.

The foundation contract now uses `cloudflare-workers`, matching the live starter files and current Astro 6 Cloudflare adapter path. The deploy plan must use Workers commands such as `pnpm exec wrangler deploy`, not Pages commands.

## Platform Comparison

| Platform | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP / Integration | Total |
|---|---|---|---|---|---|---|
| Cloudflare Workers | Pass | Pass | Pass | Pass | Pass | 5.0 |
| Vercel | Pass | Pass | Pass | Pass | Pass (beta) | 4.8 |
| Netlify | Pass | Pass | Pass | Pass | Pass | 4.6 |
| Railway | Pass | Partial | Pass | Pass | Partial | 3.8 |
| Render | Partial | Partial | Partial | Partial | Partial | 2.8 |
| Fly.io | Pass | Partial | Pass | Pass | Partial | 3.6 |

Cloudflare Workers scores highest because it matches the existing Astro adapter and Wrangler configuration. Current Astro Cloudflare docs state that Astro 6 with the Cloudflare adapter runs dev and preview through the real Workers runtime (`workerd`), which improves local-production parity. Cloudflare docs also expose agent-friendly markdown/docs flows, Workers observability, Workers Logs, and an observability MCP server. Sources: [Astro Cloudflare adapter](https://docs.astro.build/en/guides/integrations-guide/cloudflare/), [Cloudflare Astro guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/astro/), [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [Workers observability](https://developers.cloudflare.com/workers/observability/).

Vercel is an excellent general-DX runner-up. It has a strong CLI, production rollback via `vercel rollback`, and official Vercel MCP in beta as of the checked documentation. It loses here because the current repo is not Vercel-adapted, and switching would add platform migration work without a clear MVP benefit. Sources: [Vercel CLI](https://vercel.com/docs/cli), [Vercel rollback](https://vercel.com/docs/cli/rollback), [Vercel MCP](https://vercel.com/docs/agent-resources/vercel-mcp).

Netlify is a credible third option with deploy previews, free-tier capacity, Astro support, and official MCP. It is less aligned with the current repo than Workers and less compelling than Vercel as a generic DX choice. Sources: [Netlify pricing](https://www.netlify.com/pricing/), [Astro on Netlify](https://docs.astro.build/en/guides/deploy/netlify/).

Railway and Fly.io are better fits when the app needs containers, persistent processes, co-located databases, or long-running services. This MVP does not need those, and using them would add runtime/container ownership that the current starter avoids. Render can host Astro, but SSR Astro would require switching to the Node adapter for Render web services, which is unnecessary churn for this project. Sources: [Railway deployment CLI](https://docs.railway.com/cli/deployment), [Render Astro docs](https://render.com/docs/deploy-astro), [Fly.io deploy docs](https://fly.io/docs/apps/deploy/).

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

Workers wins because it is the least-change path from the actual codebase. The repo already has `@astrojs/cloudflare`, `wrangler`, `wrangler.jsonc`, `nodejs_compat`, assets binding, and observability enabled. Astro 6's Cloudflare adapter now makes `astro dev` and `astro preview` run against `workerd`, giving a close local match to production behavior.

#### 2. Vercel

Vercel is the best alternative if Cloudflare's product boundaries or Workers runtime constraints become too frustrating. It offers polished deploy previews, a mature CLI, production rollback, and beta MCP integration, but it would require replacing the current Cloudflare adapter/deploy path.

#### 3. Netlify

Netlify is a solid fallback for a small Astro app with strong preview workflow and agent tooling. It is third because the current app is server-rendered through the Cloudflare adapter, and moving to Netlify would still require adapter and deployment changes without solving a current problem.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate - Weaknesses

1. Astro 6 + Cloudflare is very current and may have sharper edges than older Astro/Vercel or Astro/Netlify flows, especially around `workerd`, Node compatibility, and dependency behavior.
2. The old Cloudflare Pages mental model is risky. The foundation contract has been corrected to Workers, but older notes or outside tutorials may still suggest Pages commands, which would be the wrong deployment path for this repo.
3. Supabase stays external, so the app is not fully co-located. Auth/database secrets and debugging span Cloudflare and Supabase.
4. Cloudflare product boundaries can be confusing on a first deploy: Workers, Pages, Builds, bindings, secrets, logs, and Access are adjacent but not interchangeable.
5. Code rollback is straightforward for a stateless Worker, but Supabase migrations and data changes do not roll back with a Worker redeploy.

### Pre-Mortem - How This Could Fail

Six months later, the decision failed because the team treated "Cloudflare-supported Astro" as the same thing as "zero-friction Astro." Early development was smooth until a dependency used Node/CommonJS behavior that worked in ordinary Node contexts but failed inside `workerd`. The deploy plan copied older Pages guidance, causing a round of confusing build and preview failures before the app moved fully to Workers. Supabase remained reliable, but secrets were split between Cloudflare and Supabase, and one production incident took longer to debug because Worker logs, Supabase auth logs, and database state had to be correlated manually. A schema migration shipped with an app change, then the Worker rollback restored old code while the database stayed migrated, creating a temporary mismatch. The MVP still served users, but the solo developer lost confidence because the deployment path felt like learning Cloudflare product boundaries under pressure instead of shipping workouts.

### Unknown Unknowns

- Astro 6 Cloudflare local dev fidelity is a strength, but incompatible packages may fail earlier and more visibly than in a plain Node dev server.
- Cloudflare Pages vs Workers naming is easy to mix up; this repo should be treated as Workers-first for deployment.
- BYOK AI provider calls from a Worker may expose provider-specific timeout, fetch, header, or streaming constraints that are not obvious until real keys are tested.
- Supabase Row Level Security is the real enforcement layer for "only the logged-in user can change his own data"; hosting on Workers does not solve authorization by itself.
- Workers Logs are available on the Free plan with limited retention, so production debugging should happen soon after a reported issue or be exported later if the app grows.

## Operational Story

- **Preview deploys**: Use Cloudflare Workers Builds or a GitHub Action later to create branch/PR deployments. For the first MVP deploy, use local CLI deploys with `pnpm exec wrangler deploy`; add preview automation only after the app has a stable production Worker.
- **Secrets**: Store Supabase and provider secrets in Cloudflare Worker secrets using `pnpm exec wrangler secret put SUPABASE_URL` and `pnpm exec wrangler secret put SUPABASE_KEY`. User BYOK provider keys should be encrypted in Supabase, not stored as Cloudflare account-level secrets.
- **Rollback**: Roll back stateless code by redeploying the previous known-good git commit with `pnpm install --frozen-lockfile`, `pnpm build`, and `pnpm exec wrangler deploy`. Supabase migrations require separate manual rollback/forward-fix decisions.
- **Approval**: An agent may run read-only checks, builds, and non-production deploy attempts. A human must approve first production deploy, custom-domain changes, secret rotation, and any Supabase destructive migration or data deletion.
- **Logs**: Read build output from the terminal during deploy. Read runtime logs with Cloudflare Workers Logs / Tail Workers via Wrangler or the Cloudflare observability MCP when configured. Keep Supabase logs open separately for auth/database incidents.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Older Cloudflare Pages terminology leaks into the deploy plan | Devil's advocate | M | M | Keep `context/foundation/tech-stack.md` on `cloudflare-workers` and use only Workers/Wrangler commands in the deploy plan. |
| Dependency fails under `workerd` despite working in Node-style local assumptions | Devil's advocate | M | M | Keep `pnpm dev` and `pnpm preview` on Astro 6 Cloudflare runtime; test AI/Supabase API routes before production. |
| Supabase RLS is incomplete, allowing cross-user data access | Unknown unknowns | M | H | Treat RLS policy tests as deployment blockers before public use, especially for workouts, history, and BYOK keys. |
| Worker rollback does not revert Supabase schema/data changes | Pre-mortem | M | H | Separate app deploys from database migrations; document every migration and prepare forward-fix scripts. |
| Logs are split across Cloudflare and Supabase | Pre-mortem | M | M | Add request IDs around auth/API flows and record a simple incident checklist for checking both systems. |
| Cloudflare product boundaries cause wrong command usage | Research finding | M | M | Use only Workers/Wrangler commands in `context/deployment/deploy-plan.md`; avoid Pages CLI/API references. |
| Vercel MCP is beta while Cloudflare observability MCP is an additional setup path | Research finding | L | L | Start with CLI and official docs; add MCP only after repeated log/status lookup needs appear. |

## Getting Started

1. Confirm local versions from the locked project: Node 22.14.0, pnpm 10.x, Astro 6.4.2, `@astrojs/cloudflare` 13.6.0, and Wrangler 4.95.0.
2. Run `pnpm install --frozen-lockfile`, then `pnpm build` to verify the Astro server build for Cloudflare.
3. Authenticate Wrangler with a scoped Cloudflare token or `pnpm exec wrangler login`; for production automation prefer an API token limited to this Worker.
4. Set required secrets with `pnpm exec wrangler secret put SUPABASE_URL` and `pnpm exec wrangler secret put SUPABASE_KEY`.
5. Deploy with `pnpm exec wrangler deploy`, then verify login, workout save, mark-done, and AI proposer fallback behavior against the deployed URL.

## Out of Scope

The following were not evaluated in this research:

- Docker image configuration
- CI/CD pipeline setup
- Production-scale architecture (multi-region, HA, DR)
