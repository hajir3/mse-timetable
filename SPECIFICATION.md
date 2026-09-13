# Specification — Personal Master's Timetable App

Status: v0.2 — architecture decided, ready for implementation.

**Locked in with the user:** GitHub repo `mse-timetable`, public. Auth: Google
OAuth only. Data import: **git-driven** — the admin (repo owner) updates the
timetable by committing new/changed source files and pushing; there is no
admin UI or manually-run local CLI step (see §6.1, §8.9).

## 1. Problem statement

The school (ZHAW MSE, Region D / Zurich) does not provide students with a personal
online timetable. It only distributes, per academic year/semester, a set of
spreadsheet/PDF files:

- a **module catalog** listing every module on offer per specialization profile,
- a **semester timetable** listing the actual weekly recurring lecture/tutorial
  sessions (day, time, room) for every module,
- an **academic calendar** (PDF) listing semester weeks, holidays, lecture-free
  periods, and exam session windows.

Students must manually cross-reference these files to figure out "what do my
weeks actually look like." This app removes that manual work: the admin
commits the official files into the repo once per semester (a normal `git
push`), a CI pipeline re-imports them automatically, and any student can pick
their own modules from the shared catalog and get a personal month/week/day
calendar.

## 2. Goals

1. Ingest the school's official per-semester source files (2× xlsx + 1× PDF)
   into a structured database.
2. Let an authenticated user browse the full module catalog and select which
   modules they are enrolled in ("my modules"), persisted per user/semester.
3. Render a personal calendar (month / week / day views) combining:
   - the user's selected modules' recurring sessions (lecture + tutorials),
     including day-specific room-change overrides,
   - non-teaching periods (holidays, lecture-free weeks),
   - exam session windows (regular + resit) and exam-viewing sessions.
4. Keep the app decoupled from the school entirely — no SSO, no scraping, no
   automated connection to any school system. Auth exists purely to let a
   person save/reload their own selection across visits.
5. Modular, readable codebase — a solo/small-audience hobby project, not
   enterprise software; optimize for "easy to understand and cheap to run"
   over scalability.

## 3. Non-goals (v1)

- No integration with the school's real SSO/systems.
- No grades, assignments, notifications, or LMS features.
- No multi-tenant support for other schools/programs (the data model should be
  generic enough to reuse later, but v1 targets this one program/region only).
- No collaborative/social features (seeing classmates' schedules, etc.) —
  🟡 open question, see §9.
- No real-time sync with the school if they change a room last-minute after
  import; freshness is "as of last admin re-import."

## 4. Users & roles

| Role | Description |
|---|---|
| **Admin** (the author) | Not an app role — just whoever has push access to the repo. Updates source data by committing new/changed files under `data/` and pushing; CI does the rest. No admin UI, no in-app admin permission to build or secure. |
| **Student** | Logs in via Google OAuth, browses the shared module catalog, selects their modules, views their personal calendar. Any authenticated user — no school-issued identity required. |
| **Anonymous** | Sees a login/landing page only; the catalog and calendar require login (simplest single permission model for v1 — easy to relax later if open browsing turns out to be wanted). |

## 5. Source data — model derived from the provided assets

Three source files were inspected directly (`assets/`):

### 5.1 Module catalog workbook (`AY26-27_timetable_Reg-D_filter_function.xlsx`)

- **Sheet `offer_AY26-27`**: one row per module offering — flipped-classroom
  flag, multi-execution flag (`_A`/`_B` variants of the same module offered in
  different terms), module number, module code (e.g. `FTP_MachLe_A`),
  location/mode (`Zurich` / `Winterthur` / `online` / `FC`), term (`AUT`/`SPR`),
  weekday, a human-readable generic timeslot string, ~15 specialization-profile
  columns (Avi, BE, BT, CE, CS, DS, ElE, EnEn, Geo, ICS, MA, ME, Med, Pho, ReLa)
  each holding a priority code (`I`/`II`/`III` or blank), and the English
  module title.
- **Sheet `explanations`**: legend — priority code meanings, location/mode
  meanings, module-code prefix meanings (`CM` = Contextual Module, `FTP` =
  Fundamental Theoretical Principles, `TSM` = Technical Scientific Module),
  the `_A`/`_B` suffix convention, mutually-exclusive module pairs (e.g.
  `59*`/`95*` — only one can be chosen), and the specialization short-code →
  full-name mapping.
- **Sheet `Tabelle2`**: flat lookup table (module number, module code, term,
  weekday, time-of-day bucket) — looks like the raw source the `offer` sheet's
  pivot/filter view is built from.

This workbook answers "what modules exist and who should consider them" — it
is **not** the exact session times/rooms.

### 5.2 Semester timetable workbook (`AUT26-27_timetable_MSE_Reg-D_v9_published.xlsx`)

One sheet per semester (e.g. `AUT26-27`) with a legend header followed by a
table where **each row is one weekly-recurring session block**:

| column | meaning |
|---|---|
| location | Zurich / Winterthur / virtual |
| weekday | Monday–Friday |
| module number, module code | joins to the catalog workbook |
| type of lesson | `lecture`, `tutorial 1`, `tutorial 2`, … |
| time slot | e.g. `13:10 - 13:55 + 14:05 - 14:50` (may encode two contiguous blocks) |
| time-of-day | morning / afternoon / evening (bucket) |
| mode | `Lecture on-site` / `Lecture online` |
| venue / room (default) | e.g. `ZHAW`, `ZL O5.01` |
| **date** (exception) | optional, newline-separated list of `dd.mm.yyyy` dates |
| venue / room (exception) | the room used **only** on the exception date(s) above |

**Semantics**: a session recurs weekly, same weekday/time, for the entire
semester at the default venue/room, **except** on the listed exception
date(s), where the exception venue/room applies instead. This is a **room
change**, never a cancellation — there is no "skip this week" state observed
in this data.

🟡 One ambiguous case observed: `FTP_AppStat_A` lists exactly 3 exception
dates while its default venue montage looks unusually specific — needs
confirmation from the user whether this is really just 3 room-change dates
within an otherwise-weekly-recurring module, or whether for some modules the
listed dates are the *only* occurrences (non-weekly). Treat as a per-row data
quality check during ingestion (flag anomalies rather than silently trusting
the "always weekly" assumption) rather than a schema question.

### 5.3 Academic calendar (`AY26-27_dates_MSE_Reg-D_V1.pdf`)

A single-page table, one row per ISO week: week number, Monday date, Friday
date, and a free-text comment, e.g.:

- `start of the autumn semester` / `start of the spring semester`
- `holidays`, `lecture-free period`
- `viewing session of the exams`
- `regular exam session autumn/spring modules`
- `resit exam session autumn/spring modules`
- single fixed-date holidays with compensation days (e.g. Pentecost Monday
  off, compensated the following Saturday)

This defines the **non-lecture overlay** independent of any specific module:
which weeks are normal teaching weeks vs. holiday/lecture-free/exam weeks.

## 6. Functional requirements

### 6.1 Data ingestion (git-driven, no admin UI)

Source files live in the repo (e.g. `data/<academic-year>/...`), the same way
`assets/` holds them today. Updating the timetable means replacing/adding
files there and pushing — a GitHub Actions workflow (triggered on push to
`main` when files under `data/` change) runs the `packages/ingestion` CLI
against the production database using a repo secret (`DATABASE_URL`). There
is no in-app admin UI and no manually-run local CLI step required — "admin"
capability is just "has push access to the repo," which GitHub already gates.

- FR1: A GitHub Actions workflow re-runs ingestion automatically whenever a
  push to `main` changes files under `data/`.
- FR2: Ingestion parses a module-catalog workbook, a semester-timetable
  workbook, and a small hand-maintained academic-calendar JSON/CSV (re-keyed
  once/year from the school's PDF — see §8.3) for a given academic year +
  semester.
- FR3: Ingestion is idempotent — re-running it for the same semester
  replaces/updates existing data without creating duplicates (safe to push a
  corrected file and re-trigger).
- FR4: Ingestion validates and reports anomalies (e.g. unknown weekday,
  unparseable time slot, module code not found in catalog, exception date
  outside the semester's date range) by failing the CI run with a clear
  error, rather than silently importing bad data.
- FR5: Ingestion materializes concrete calendar sessions (one row per actual
  date/session, not just the weekly template) at import time — see §8.1.
- FR5a: The CI workflow can also be run manually (`workflow_dispatch`) to
  re-import without needing a data-file change, e.g. after fixing a bug in
  the ingestion code itself.

### 6.2 Authentication

- FR6: A user logs in with Google OAuth (self-hosted Auth.js) — the only
  sign-in method for v1.
- FR7: A logged-in user's module selection persists across sessions/devices.

### 6.3 Catalog browsing & selection

- FR9: Any logged-in user can browse the full module catalog (searchable/
  filterable by specialization profile, term, module-code prefix, weekday).
- FR10: A user can select/deselect modules as "mine" for a given academic
  year + semester; the app should warn (not necessarily block) on detected
  time conflicts between two selected modules.
- FR11: Selection is scoped per semester so a user's AUT26-27 picks don't
  bleed into SPR27.

### 6.4 Personal calendar

- FR12: Month view — shows days with any session/holiday/exam marker;
  clicking/expanding a day shows its sessions.
- FR13: Week view — shows time-gridded sessions Mon–Fri (or Mon–Sun) for the
  selected week, with room/venue and lesson type visible.
- FR14: Day view — full detail for one day.
- FR15: All three views render, using the same underlying session data:
  regular lecture/tutorial blocks, holiday/lecture-free days (visually
  distinct, non-clickable/informational), and exam-session windows (visually
  distinct, tied to the modules the user actually selected where the data
  allows that association — otherwise shown as a general "exam period"
  banner).
- FR16: All times displayed in Europe/Zurich local time.

## 7. Data model (conceptual, engine-agnostic — final schema is an implementation task)

- `AcademicYear` (e.g. "26-27")
- `Semester` (year, term `AUT`/`SPR`, date range)
- `CalendarWeek` (semester, iso week no., mon date, fri date, week type:
  teaching / holiday / lecture-free / exam-regular / exam-resit / viewing,
  free-text comment)
- `SpecializationProfile` (short code, full name — e.g. `DS` → Data Science)
- `Module` (code, number, title, prefix `CM`/`FTP`/`TSM`, multi-execution
  group key linking `_A`/`_B` variants)
- `ModuleOffering` (module, semester, mode/location, per-profile priority map)
- `SessionSeries` (module, semester, weekday, lesson type, time slot(s),
  default venue/room, mode) — the weekly template
- `Session` (materialized: session series ref, concrete date, start/end time,
  actual venue/room for that date — pre-resolved against exceptions and
  against calendar-week type)
- `User` (id/email from auth provider — no in-app role; everyone is a "student" for permission purposes)
- `UserSelection` (user, semester, set of module codes)

## 8. Key technical decisions (resolved, after research)

Three research passes (recurring-event data modeling + calendar UI +
ingestion tooling; frontend hosting/DNS + monorepo architecture; auth + DB +
homelab hosting) landed on the following. Rationale kept short here — full
comparison tables live in the research summaries; ask if you want them
reconstructed into an appendix.

1. **Recurring session storage — materialize at import time.** Each module
   row is expanded into one concrete `Session` row per real date across the
   semester's ~14 teaching weeks (~80 modules × ~14 weeks ≈ ~1,100 rows/
   semester), applying room-change overrides and tagging weeks the academic
   calendar marks as holiday/exam/lecture-free. Rejected an RRULE-at-read-time
   approach (`rrule` npm package): the source data has no true "exception"
   semantics (only room changes, no cancellations), and holiday/exam weeks
   live in a separate document — you'd still merge three data sources on
   every render. Materializing makes every view a plain date-range query, no
   recurrence math in the request path. If ICS export is ever wanted, generate
   it *from* the materialized rows.
2. **Calendar UI — `react-big-calendar`** with a `date-fns` localizer. Fully
   MIT (no paywalled premium views, unlike FullCalendar's resource/timeline
   views), mature, and a community shadcn-themed wrapper exists to match the
   rest of the UI. `schedule-x` is a credible lighter-weight alternative worth
   a spike if styling friction shows up; a fully custom date-fns grid remains
   an option given how simple the requirements are (read-only, no drag/drop).
3. **PDF calendar ingestion — manual re-keying, not automated extraction.**
   The academic calendar is ~50 rows, updated once per academic year, with a
   layout (rotated header, merged cells) that isn't worth building a table-
   extraction pipeline for. Re-key it once a year into a small structured
   JSON/CSV that the ingestion package reads like any other source file.
4. **Auth — self-hosted Auth.js (NextAuth) with Google OAuth only**,
   sessions/users stored in the same Postgres via Drizzle. Rejected hosted
   providers (Auth0/Clerk/Supabase Auth/Firebase Auth) as the *default* —
   their free tiers are all generous enough (25k-50k MAU) that limits are
   moot at "tens of users," so the real trade-off is vendor count, not cost.
   Self-hosting avoids an extra account/dashboard and keeps user data
   alongside the app's own data. Swapping to Clerk later is a contained
   change if a hosted drop-in UI ever becomes more valuable than the
   simplicity. Google-only keeps the sign-in surface to one button; no
   email-sending infrastructure needed.
5. **Database — Neon (managed Postgres, free tier).** Purpose-built for the
   Vercel-serverless-functions pattern (HTTP/WebSocket driver + built-in
   connection pooling), scales to zero on idle with fast resume (vs.
   Supabase's harder 7-day pause). Fallback: self-host Postgres on the
   homelab k3s cluster via the CloudNativePG operator (single-namespace mode)
   if the project outgrows Neon's free tier or data sovereignty becomes a
   priority — expose it via Cloudflare Tunnel (outbound-only, no port-
   forwarding) rather than Tailscale Funnel (better suited to private/admin
   access than a public app endpoint).
6. **Backend — Next.js Route Handlers only.** No separate API service; at
   this scale a standalone backend would be pure overhead. Revisit only if
   self-hosting on k3s ever makes a separate service more natural.
7. **Repo structure — pnpm workspace, no Turborepo (yet).** Turborepo's value
   (remote caching, cross-package task orchestration) doesn't pay for itself
   at 2-3 packages built by one person; add it later if build times start to
   annoy. Structure:
   ```
   timetable/
     apps/web/          # Next.js app (App Router)
     packages/ingestion/ # CLI: xlsx/JSON parsing -> validated data -> Postgres loader
     packages/shared/    # Zod schemas + inferred TS types + Drizzle schema/db client
   ```
   `packages/shared` is the single contract both `ingestion` (validating
   parsed rows before insert) and `web` (validating API responses/forms)
   depend on. ORM: **Drizzle** over Prisma — TS-native schema with no codegen
   step, lighter footprint, matches a small hand-written schema well.
8. **DNS/hosting — plain Vercel + a CNAME record at Infomaniak.** Add the
   subdomain `timetable.hajir.ch` as a Vercel project domain, then add
   the CNAME Vercel gives you at Infomaniak's DNS zone for `hajir.ch` — no
   nameserver migration, rest of the domain (email, other subdomains)
   untouched. Skip Cloudflare: it adds a vendor with no real benefit here
   (proxying in front of Vercel causes cert/caching conflicts; DNS-only mode
   duplicates what Infomaniak already does).
9. **Data import trigger — git push, not an admin UI or manual CLI run.**
   The user's preference: updating the timetable should be "commit new/
   changed files, push" — nothing more. So source files live under `data/`
   in the repo, and a GitHub Actions workflow watches that path and re-runs
   `packages/ingestion` against the production Postgres (Neon) on every push
   to `main` that touches it, using a `DATABASE_URL` repo secret. This also
   removes any need for an in-app admin role/permission system — "who can
   update the data" is just "who has push access to the repo," which GitHub
   already handles.

## 9. Decisions made / remaining defaults

Resolved with the user: repo name `mse-timetable` (public, personal account
`hajir3`), auth = Google OAuth only, data import = git push + CI (§8.9).

Remaining items were defaulted to keep v1 scope small; all are easy,
contained changes later if they turn out wrong:

- **Subdomain**: `timetable.hajir.ch`.
- **Anonymous browsing**: not allowed — login required to see the catalog or
  any calendar (§4).
- **Social/collaborative features** (e.g. seeing which classmates picked a
  module): out of scope for v1 (§3).
- **Expected user count**: assumed "tens of users" throughout — comfortably
  within every option's free tier, not a decision that changes the
  architecture.

## 10. High-level architecture (final, per §8)

- **Frontend**: Next.js (App Router) + TypeScript + Tailwind CSS + shadcn/ui
  + `react-big-calendar` (date-fns localizer), deployed on Vercel with
  auto-deploy from GitHub.
- **Auth**: self-hosted Auth.js (NextAuth), Google OAuth, Drizzle adapter
  against the app's own Postgres — no third-party auth vendor.
- **Backend**: Next.js Route Handlers as the only API layer.
- **Database**: Neon (managed serverless Postgres, free tier), accessed via
  Drizzle ORM. Fallback: self-hosted Postgres via CloudNativePG on the
  homelab k3s cluster (dedicated namespace), exposed through a Cloudflare
  Tunnel — only if Neon's free tier is outgrown.
- **Ingestion**: a standalone TypeScript CLI package (`packages/ingestion`)
  using `exceljs` to parse the two xlsx sources plus a small hand-maintained
  JSON/CSV for the academic calendar (re-keyed once/year from the PDF),
  validating everything against Zod schemas shared with the web app
  (`packages/shared`), then writing materialized `Session` rows to Postgres.
  Triggered by a GitHub Actions workflow on push to `main` when `data/`
  changes (§8.9) — not a manually-run local script, not an in-app admin UI.
- **Repo layout**: pnpm workspace, `apps/web` + `packages/ingestion` +
  `packages/shared` (no Turborepo initially).
- **DNS**: a CNAME for a subdomain of `hajir.ch` (registrar: Infomaniak)
  pointed at Vercel; no nameserver migration, no Cloudflare.

## 11. Success criteria (v1 "done")

- Admin can roll out a new semester by committing the two xlsx files (plus
  the calendar data) under `data/` and pushing — CI does the rest, well
  under an hour of manual effort.
- A student can log in, select their modules once, and thereafter just check
  their calendar — no re-entry needed until the next semester.
- Month/week/day views correctly reflect room-change exceptions and clearly
  distinguish holidays/lecture-free days and exam-session windows from
  regular teaching sessions.
- Running cost: $0/month, or a documented, deliberate exception if the
  homelab-hosted path is chosen instead.
