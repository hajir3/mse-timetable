# CLAUDE.md

Guidance for Claude Code (or any coding agent) working in this repository.

## What this is

A personal webapp that gives Master's students (ZHAW MSE, Region D / Zurich)
a proper online timetable, which the school itself doesn't provide. Each
semester the school hands out an Excel module catalog, an Excel session
timetable, and a PDF academic calendar — this app ingests those, and lets any
logged-in user pick which modules they're enrolled in and see a personal
month/week/day calendar.

Full requirements, the source-data model, and every architecture decision
(with rationale) live in **[SPECIFICATION.md](./SPECIFICATION.md)** — read it
before making non-trivial changes. This file only summarizes what's needed to
navigate and contribute correctly.

## Stack

- **Frontend**: Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui,
  `react-big-calendar` (date-fns localizer). Deployed on Vercel, auto-deploy
  from `main`.
- **Auth**: Auth.js (NextAuth), self-hosted, Google OAuth only. Sessions live
  in the app's own Postgres via the Drizzle adapter — no third-party auth
  vendor.
- **Backend**: Next.js Route Handlers only — no separate API service.
- **Database**: Postgres on Neon (managed, free tier), accessed via Drizzle
  ORM. (Fallback if ever outgrown: self-hosted Postgres via CloudNativePG in
  a dedicated namespace on the author's homelab k3s cluster, exposed through
  a Cloudflare Tunnel — not needed unless Neon's free tier stops fitting.)
- **Ingestion**: a standalone TypeScript CLI (`packages/ingestion`) using
  `exceljs` to parse the source xlsx files plus a small hand-maintained
  JSON/CSV for the academic calendar, validated against Zod schemas shared
  with the web app, writing materialized `Session` rows to Postgres.
- **DNS**: `timetable.hajir.ch` (CNAME → Vercel) at Infomaniak, the domain's
  registrar. No Cloudflare, no nameserver migration.

## Repo layout (pnpm workspace, no Turborepo)

```
mse-timetable/
  apps/web/            # Next.js app — UI, route handlers, auth
  packages/ingestion/   # CLI: parses data/ sources -> validated rows -> Postgres
  packages/shared/      # Zod schemas + inferred TS types + Drizzle schema/db client
  data/<academic-year>/ # Source files (xlsx + hand-keyed calendar JSON/CSV)
  .github/workflows/    # CI: on push to main touching data/, re-run ingestion
```

`packages/shared` is the single contract: both `ingestion` (validating parsed
spreadsheet rows before insert) and `web` (validating API responses/forms)
import from it. Don't duplicate types between packages.

## The data-update workflow — this is load-bearing, don't reinvent it

There is **no admin UI and no manually-run local import script**. Updating
the timetable for a new semester means: commit the new/changed files under
`data/`, push to `main`. A GitHub Actions workflow watches that path and
re-runs `packages/ingestion` against the production database using a
`DATABASE_URL` repo secret. "Who can update the data" is just "who has push
access to the repo" — don't add an in-app admin role/permission system for
this; it would duplicate what GitHub access control already provides.

Ingestion must be **idempotent** — re-running it for the same academic
year/semester updates existing rows rather than duplicating them, since a
corrected file might get pushed and re-trigger the workflow.

## Data model essentials (see SPECIFICATION.md §5-§7 for full detail)

- Sessions are **materialized at import time** — one DB row per concrete
  (module, date, start/end, room) occurrence across the semester's ~14
  teaching weeks, not a recurrence rule expanded at read time. This was a
  deliberate choice (see spec §8.1): the source data's "exceptions" are room
  changes only (never cancellations), and holiday/exam weeks come from a
  wholly separate document (the academic calendar) — so materializing avoids
  merging three data sources on every page render.
- The academic calendar PDF is **re-keyed by hand once a year** into a small
  structured file under `data/`, not parsed automatically — it's ~50 rows
  with a layout (rotated header, merged cells) that isn't worth building an
  extraction pipeline for.
- All times are Europe/Zurich local time.
- Everyone is a "student" for in-app permission purposes — there is no
  admin/student role distinction in the application layer (see above).

## Conventions

- TypeScript everywhere, including the ingestion CLI.
- Keep modules small and single-purpose; this is a solo hobby project — favor
  code that's easy to read back in six months over clever abstraction.
- Don't add features beyond what SPECIFICATION.md scopes for v1 (no grades,
  no notifications, no social/collaborative features, no school SSO) without
  updating the spec first.
