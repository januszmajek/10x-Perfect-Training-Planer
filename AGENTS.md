# Repository Guidelines

Perfect Training Planner is an Astro 6 SSR app with React islands, TypeScript, Tailwind 4, Supabase auth, and Cloudflare Workers deployment. Use @context/foundation/prd.md, @context/foundation/tech-stack.md, and @context/foundation/infrastructure.md for product and stack decisions.

## Hard Rules

- Use pnpm, not npm or bun; package manager and version are locked in @package.json.
- Treat this as a Cloudflare Workers app. Use Wrangler/Workers commands only; do not switch to Cloudflare Pages commands.
- Keep `.env`, `.env.production`, `.dev.vars`, Supabase keys, and Cloudflare tokens out of git and chat.
- `SUPABASE_KEY` must be a publishable or anon key, never a `service_role` or `sb_secret_...` key.
- Do not write to `context/archive/`; archived changes are immutable.

## Commands

- `pnpm install --frozen-lockfile` installs dependencies for CI-equivalent checks.
- `pnpm dev` starts Astro dev with the Cloudflare adapter runtime.
- `pnpm lint` runs type-aware ESLint and Prettier checks.
- `pnpm build` runs the production Astro SSR build.
- `pnpm preview` previews the built app locally.
- `pnpm exec wrangler deploy` deploys the Worker after build gates pass.

## Project Structure

- `src/pages/` contains Astro routes; auth API endpoints live in `src/pages/api/auth/`.
- `src/components/` contains Astro and React UI; shadcn-style primitives live in `src/components/ui/`.
- `src/lib/` holds shared helpers such as Supabase and `cn()` class merging.
- `src/middleware.ts` resolves `context.locals.user` and protects routes listed in `PROTECTED_ROUTES`.
- `context/foundation/` stores planning contracts; `context/deployment/` stores deployment history and runbooks.

## Coding Conventions

Use `@/*` imports for `src/*` paths, 2-space formatting, double quotes, semicolons, and 120-character lines per @.prettierrc.json and @tsconfig.json. Prefer Astro components for static route/layout work; use React components only for interactive UI. Use `cn()` from `@/lib/utils` for conditional Tailwind class merging.

## Testing And CI

There is no test runner configured yet, so do not invent test commands. Before handoff, run `pnpm lint` and `pnpm build`; CI also runs `pnpm astro sync` on pushes and PRs to `master` via @.github/workflows/ci.yml.

## Commits And PRs

Recent history uses short imperative messages, sometimes with Conventional Commit prefixes such as `ci:`. Keep commits focused and mention any deployment, secret, Supabase, or auth impact in PR notes.
