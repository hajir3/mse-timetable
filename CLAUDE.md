# CLAUDE.md

Guidance for Claude Code (or any coding agent) working in this repository.

## What this is

A personal webapp that gives Master's students (ZHAW MSE, Region D / Zurich)
a proper online timetable, which the school itself doesn't provide. Each
semester the school hands out an Excel module catalog, an Excel session
timetable, and a PDF academic calendar — this app turns those into a static
dataset, and lets any logged-in user pick which modules they're enrolled in
and see a personal month/week/day calendar.

Full requirements, the source-data model, and every architecture decision
(with rationale) live in **[SPECIFICATION.md](./SPECIFICATION.md)** — read it
before making non-trivial changes. This file only summarizes what's needed to
navigate and contribute correctly.

## Stack

- **Frontend**: Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui,
  `react-big-calendar` (date-fns localizer). Deployed on Vercel, auto-deploy
  from `main`. This is the entire hosting footprint.
- **Auth + persistence**: **Clerk**, hosted, Google OAuth only. Each user's
  selected modules are stored as metadata on their own Clerk account
  (`unsafeMetadata`), read/written directly from the browser via Clerk's
  client SDK. This is the app's *only* persisted, per-user state.
- **No database.** The module catalog and sessions are read-only and decided
  once per semester by the school — there is nothing that needs a live
  datastore. Do not introduce Postgres/Drizzle/an ORM/a DB-hosted-anywhere
  without first updating SPECIFICATION.md §8.5 — it was deliberately removed.
- **Backend**: none required for core functionality. Catalog browsing and
  calendar rendering are static + client-side; selection read/write goes
  straight from the browser to Clerk. Add a Next.js Route Handler only for a
  specific, justified need (e.g. validating selected module codes against
  the current catalog) — don't default to building an API layer.
- **Data build**: a TypeScript package (`packages/data-build`) that parses
  the source files under `data/` (xlsx via `exceljs`, plus a hand-maintained
  JSON/CSV for the academic calendar) into one static JSON dataset, using
  Zod schemas shared with the web app for validation. Runs as a `prebuild`
  step of `apps/web`'s own `next build` — there is no separate CI pipeline
  and no database to write to.
- **DNS**: `timetable.mse.hajir.ch` (CNAME → Vercel) at Infomaniak, the
  domain's registrar. Infomaniak hosts DNS only — its own Node.js hosting is
  a paid product, not used here. No Cloudflare.

## Repo layout (pnpm workspace, no Turborepo)

```
mse-timetable/
  apps/web/              # Next.js app — UI, calendar views, Clerk integration
  packages/data-build/    # Parses data/ sources -> validated static JSON (no DB writes)
  packages/shared/        # Zod schemas + inferred TS types, used by both
  data/<academic-year>/   # Source files (xlsx + hand-keyed calendar JSON/CSV)
```

`packages/shared` is the single contract: both `data-build` (validating
parsed spreadsheet rows) and `web` (validating the generated dataset and any
user selection against it) import from it. Don't duplicate types between
packages.

## The data-update workflow — this is load-bearing, don't reinvent it

There is **no admin UI, no manually-run local import script, and no
database**. Updating the timetable for a new semester means: commit the
new/changed files under `data/`, push to `main`. Vercel already rebuilds and
redeploys on every push — the `prebuild` step in `apps/web` re-parses
whatever is currently under `data/` and regenerates the static dataset as
part of that same build. Nothing else needs to run.

The data build must be **deterministic** — the same source files always
produce the same output — since there's no persisted state to accumulate or
duplicate; it should **fail the build** on anomalies (unknown weekday,
unparseable time slot, unresolvable module code) rather than silently
shipping bad data.

## Data model essentials (see SPECIFICATION.md §5-§7 for full detail)

- Sessions are **materialized at data-build time** — one entry per concrete
  (module, date, start/end, room) occurrence across the semester's ~14
  teaching weeks, not a recurrence rule expanded at render time. Deliberate
  choice (spec §8.1): the source data's "exceptions" are room changes only
  (never cancellations), and holiday/exam weeks come from a wholly separate
  document (the academic calendar) — materializing avoids merging three data
  sources on every page render, and the whole dataset is small enough
  (~1,100 entries/semester) to ship as static JSON.
- The academic calendar PDF is **re-keyed by hand once a year** into a small
  structured file under `data/`, not parsed automatically — it's ~50 rows
  with a layout (rotated header, merged cells) that isn't worth building an
  extraction pipeline for.
- The only per-user state the app persists is `selectedModules` — a map of
  semester key to module codes — stored in Clerk's `unsafeMetadata`, not in
  any app-owned storage.
- All times are Europe/Zurich local time.
- Everyone is a "student" for in-app permission purposes — there is no
  admin/student role distinction in the application layer.

## Conventions

- TypeScript everywhere, including the data-build package.
- Keep modules small and single-purpose; this is a solo hobby project — favor
  code that's easy to read back in six months over clever abstraction.
- Don't add features beyond what SPECIFICATION.md scopes for v1 (no grades,
  no notifications, no social/collaborative features, no school SSO, no
  database) without updating the spec first.
