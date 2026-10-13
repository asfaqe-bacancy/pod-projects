# POD — four RAG projects

One monorepo, one hub, four separately deployed apps.

| App | Folder | What it is | Dev port |
| --- | --- | --- | --- |
| Hub | `apps/hub` | "Welcome to my POD" — links to every project | 3000 |
| PrepSprint | `interview-prep/` → `apps/interview-prep` in Step 2 | Interview & exam prep (live) | 3004 |
| GPO Annual Report | `apps/gpo-report` | Baseline RAG | 3001 |
| World Bank Economic Report | `apps/world-bank-report` | Advanced document RAG | 3002 |
| Apple iMac Environmental Report | `apps/imac-report` | Multimodal document RAG | 3003 |

Each project's plan lives in its own `docs/` folder (start with `docs/README.md`).

## Layout

```text
apps/            one Next.js app per project, each its own Vercel project
packages/config  shared tsconfig + ESLint rules  (@pod/config)
packages/ui      shared design system + components + project list  (@pod/ui)
```

The list of projects (names, briefs, production URLs) is in
`packages/ui/src/projects.ts` — the hub and every project page read it.

## Commands

Requires Node 22 (`nvm use`) and pnpm via Corepack (`corepack enable`).

```bash
pnpm install
pnpm dev                         # every app at once, on the ports above
pnpm --filter gpo-report dev     # one app
pnpm check                       # lint + typecheck + build, all workspaces
```

## Deploying

One Vercel project per app, all connected to this repo:

| Vercel project | Root Directory |
| --- | --- |
| hub | `apps/hub` |
| gpo-report | `apps/gpo-report` |
| world-bank-report | `apps/world-bank-report` |
| imac-report | `apps/imac-report` |

Framework and pnpm are detected automatically. Vercel skips building an app
when a commit didn't touch it or anything it depends on. After the projects
exist, put their production URLs into `packages/ui/src/projects.ts`.

## Isolation

Apps never share runtime state: separate deployments, separate env vars, and
(once databases are added) a separate Postgres schema and login role per app.
`interview-prep/` is ignored by this repo until it is moved in, with a
baseline test before and after.
