# Specification — Personal Master's Timetable App

Status: v0.3 — architecture simplified after user review, ready for implementation.

**Locked in with the user:** GitHub repo `mse-timetable` (public). Auth:
**Clerk**, Google OAuth. **No database** — the module catalog/sessions are
precomputed once per semester into a static JSON bundled with the frontend,
and each user's module selection is stored as metadata on their Clerk
account. Data updates: commit new/changed source files under `data/` and
push — the static JSON is regenerated as part of the normal Vercel build, no
CI pipeline, no admin UI. DNS: `timetable.mse.hajir.ch`.

## 1. Problem statement

The school (ZHAW MSE, Region D / Zurich) does not provide students with a
personal online timetable. It only distributes, per academic year/semester,
a set of spreadsheet/PDF files:

- a **module catalog** listing every module on offer per specialization profile,
- a **semester timetable** listing the actual weekly recurring lecture/tutorial
  sessions (day, time, room) for every module,
- an **academic calendar** (PDF) listing semester weeks, holidays, lecture-free
  periods, and exam session windows.

Students must manually cross-reference these files to figure out "what do my
weeks actually look like." This app removes that manual work: the admin
commits the official files into the repo once per semester (a normal `git
push`), the static dataset is rebuilt automatically as part of the next
Vercel deploy, and any student can pick their own modules from the shared
catalog and get a personal month/week/day calendar.

## 2. Goals

1. Turn the school's official per-semester source files (2× xlsx + 1×
   hand-keyed calendar file) into a single static dataset at build time.
2. Let an authenticated user browse the full module catalog (client-side,
   from the static dataset already in the page) and select which modules
   they are enrolled in ("my modules"), persisted on their own account.
3. Render a personal calendar (month / week / day views) combining:
   - the user's selected modules' recurring sessions (lecture + tutorials),
     including day-specific room-change overrides,
   - non-teaching periods (holidays, lecture-free weeks),
   - exam session windows (regular + resit) and exam-viewing sessions.
4. Keep the app decoupled from the school entirely — no SSO, no scraping, no
   automated connection to any school system. Auth exists purely to let a
   person save/reload their own selection across devices.
5. Modular, readable codebase — a solo/small-audience hobby project, not
   enterprise software; optimize for "easy to understand and cheap to run"
   over scalability. No infrastructure to operate beyond a hosted frontend
   and a hosted auth provider — no database, no server, no CI pipeline.

## 3. Non-goals (v1)

- No integration with the school's real SSO/systems.
- No grades, assignments, notifications, or LMS features.
- No multi-tenant support for other schools/programs (the data model should
  be generic enough to reuse later, but v1 targets this one program/region
  only).
- No collaborative/social features (seeing classmates' schedules, etc.).
- No real-time sync with the school if they change a room last-minute after
  a data update; freshness is "as of the last commit to `data/`."
- No database, and nothing that would require one (v1 fits entirely in a
  static dataset + per-user account metadata).

## 4. Users & roles

| Role | Description |
|---|---|
| **Admin** (the author) | Not an app role — just whoever has push access to the repo. Updates source data by committing new/changed files under `data/` and pushing; the next Vercel build regenerates the static dataset. No admin UI, no in-app admin permission to build or secure. |
| **Student** | Logs in via Clerk (Google OAuth), browses the catalog, selects their modules, views their personal calendar. Any authenticated user — no school-issued identity required. |
| **Anonymous** | Sees a login/landing page only; the catalog and calendar require login (simplest single permission model for v1 — easy to relax later if open browsing turns out to be wanted). |

## 5. Source data — model derived from the provided assets

Three source files were inspected directly (now under `data/AY26-27/`):

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
quality check during the data build (flag anomalies rather than silently
trusting the "always weekly" assumption) rather than a schema question.

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
It's re-keyed by hand, once a year, into a small structured JSON/CSV file
alongside the xlsx sources under `data/` — see §8.3.

## 6. Functional requirements

### 6.1 Data build (Vercel build-time, no database, no CI pipeline)

Source files live in the repo under `data/<academic-year>/` (as they do
today). Updating the timetable means replacing/adding files there and
pushing — nothing else. A `prebuild` script (part of `apps/web`'s normal
`next build`) reads everything under `data/`, parses it, and writes a static
JSON dataset that the app imports directly. Because Vercel already rebuilds
and redeploys on every push to `main`, this is the *entire* update mechanism
— no GitHub Actions workflow, no database, no secrets to manage.

- FR1: The static dataset is regenerated automatically on every build,
  driven only by whatever is currently committed under `data/`.
- FR2: The data build parses a module-catalog workbook, a semester-timetable
  workbook, and the hand-maintained academic-calendar JSON/CSV (re-keyed
  once/year from the school's PDF — see §8.3) for a given academic year +
  semester.
- FR3: The data build is deterministic and idempotent — running it twice
  against the same source files produces the same output; there's no
  persisted state to accumulate or duplicate.
- FR4: The data build validates and reports anomalies (e.g. unknown weekday,
  unparseable time slot, module code not found in catalog, exception date
  outside the semester's date range) by **failing the build** with a clear
  error, rather than silently shipping bad data.
- FR5: The data build materializes concrete sessions (one entry per actual
  date/session, not just the weekly template) — see §8.1.

### 6.2 Authentication

- FR6: A user logs in with Google OAuth via Clerk (hosted) — the only
  sign-in method for v1.
- FR7: A logged-in user's module selection persists across sessions/devices
  by living on their Clerk account (`unsafeMetadata`), not in app-owned
  storage.

### 6.3 Catalog browsing & selection

- FR8: Any logged-in user can browse the full module catalog, entirely
  client-side against the static dataset already shipped with the page
  (searchable/filterable by specialization profile, term, module-code
  prefix, weekday).
- FR9: A user can select/deselect modules as "mine" for a given academic
  year + semester; the app should warn (not necessarily block) on detected
  time conflicts between two selected modules.
- FR10: Selection is scoped per semester so a user's AUT26-27 picks don't
  bleed into SPR27 — stored as a small structured value (e.g.
  `{ "AUT26-27": ["FTP_MachLe_A", ...] }`) in the user's Clerk metadata.

### 6.4 Personal calendar

- FR11: Month view — shows days with any session/holiday/exam marker;
  clicking/expanding a day shows its sessions.
- FR12: Week view — shows time-gridded sessions Mon–Fri (or Mon–Sun) for the
  selected week, with room/venue and lesson type visible.
- FR13: Day view — full detail for one day.
- FR14: All three views render, using the same underlying session data:
  regular lecture/tutorial blocks, holiday/lecture-free days (visually
  distinct, non-clickable/informational), and exam-session windows (visually
  distinct, tied to the modules the user actually selected where the data
  allows that association — otherwise shown as a general "exam period"
  banner).
- FR15: All times displayed in Europe/Zurich local time.

## 7. Data model (shape of the generated static dataset + Clerk account data — not database tables)

Everything below is either (a) part of the single static JSON produced by
the data build and shipped with the page, or (b) a value stored in Clerk's
per-user metadata. There are no application-owned database tables in v1.

**Static dataset (per academic year):**
- `AcademicYear` (e.g. "26-27")
- `Semester` (year, term `AUT`/`SPR`, date range)
- `CalendarWeek` (semester, iso week no., mon date, fri date, week type:
  teaching / holiday / lecture-free / exam-regular / exam-resit / viewing,
  free-text comment)
- `SpecializationProfile` (short code, full name — e.g. `DS` → Data Science)
- `Module` (code, number, title, prefix `CM`/`FTP`/`TSM`, multi-execution
  group key linking `_A`/`_B` variants)
- `ModuleOffering` (module, semester, mode/location, per-profile priority map)
- `Session` (materialized: module, concrete date, start/end time, lesson
  type, actual venue/room for that date — pre-resolved against exceptions
  and against calendar-week type)

**Per-user account data (Clerk `unsafeMetadata`):**
- `selectedModules`: `{ [semesterKey: string]: string[] }` — the only piece
  of state the app itself is responsible for persisting, and it's persisted
  by the auth provider, not a database the app operates.

## 8. Key technical decisions (resolved, after research + user review)

Three research passes (recurring-event data modeling + calendar UI +
ingestion tooling; frontend hosting/DNS + monorepo architecture; auth + DB +
homelab hosting) fed an initial design, which the user then simplified after
reviewing it — the simplification is what's recorded below.

1. **Recurring session storage — materialize at data-build time, into the
   static dataset.** Each module row is expanded into one concrete `Session`
   entry per real date across the semester's ~14 teaching weeks (~80 modules
   × ~14 weeks ≈ ~1,100 entries/semester — comfortably small for a static
   JSON bundled with the page), applying room-change overrides and tagging
   weeks the academic calendar marks as holiday/exam/lecture-free. Rejected
   an RRULE-at-read-time approach (`rrule` npm package): the source data has
   no true "exception" semantics (only room changes, no cancellations), and
   holiday/exam weeks live in a separate document — you'd still merge three
   data sources on every render for no benefit at this scale.
2. **Calendar UI — `react-big-calendar`** with a `date-fns` localizer. Fully
   MIT (no paywalled premium views, unlike FullCalendar's resource/timeline
   views), mature, and a community shadcn-themed wrapper exists to match the
   rest of the UI. `schedule-x` is a credible lighter-weight alternative worth
   a spike if styling friction shows up; a fully custom date-fns grid remains
   an option given how simple the requirements are (read-only, no drag/drop).
3. **Academic calendar ingestion — manual re-keying, not automated PDF
   extraction.** The academic calendar is ~50 rows, updated once per academic
   year, with a layout (rotated header, merged cells) that isn't worth
   building a table-extraction pipeline for. Re-key it once a year into a
   small structured JSON/CSV that the data build reads like any other source
   file.
4. **Auth — Clerk, hosted, Google OAuth.** Rejected self-hosting the
   session/login logic (e.g. Auth.js against an app-owned database): the
   user wants auth handed off entirely to a managed vendor, the same way
   Auth0 would, with zero ongoing code or infrastructure to own. Clerk's
   free tier comfortably covers "tens of users," and its client-writable
   `unsafeMetadata` is the deciding factor over Auth0 — it lets the browser
   persist a user's module selection directly to their account without any
   server-side code, whereas Auth0's equivalent (its Management API) isn't
   safe to call from the browser and would need a backend route as a proxy.
5. **No database.** The catalog/sessions are read-only, decided once per
   semester by the school, and never modified by users — so there is nothing
   that needs a live datastore. The one piece of genuinely dynamic,
   per-user state (which modules someone picked) is small enough to live as
   metadata on their Clerk account instead. This removes Neon/Postgres,
   Drizzle, and the homelab-k3s fallback entirely from this project's scope
   — the homelab remains available for a *future* MSE tool that actually
   needs a live database, but isn't needed here.
6. **Backend — none beyond what Next.js itself provides.** No Route
   Handlers are required for core functionality (catalog and calendar are
   static + client-side; selection read/write goes straight from the
   browser to Clerk). A thin Route Handler may be added later purely to
   validate a selection's module codes against the current catalog before
   it's saved, if that turns out to be worth the extra code — not required
   for v1.
7. **Repo structure — pnpm workspace, no Turborepo (yet).** Turborepo's value
   (remote caching, cross-package task orchestration) doesn't pay for itself
   at 2-3 packages built by one person; add it later if build times start to
   annoy. Structure:
   ```
   mse-timetable/
     apps/web/            # Next.js app (App Router), incl. the prebuild data-build step
     packages/data-build/  # parses data/ sources -> validated static JSON (no DB writes)
     packages/shared/       # Zod schemas + inferred TS types, used by both
   ```
   `packages/shared` is the single contract both `data-build` (validating
   parsed rows) and `web` (validating the generated dataset, and user
   selections against it) depend on.
8. **DNS/hosting — plain Vercel + a CNAME record at Infomaniak.** Add the
   subdomain `timetable.mse.hajir.ch` as a Vercel project domain, then add
   the CNAME Vercel gives you at Infomaniak's DNS zone for `hajir.ch` — this
   is just one more record in the existing zone; `mse.hajir.ch` doesn't need
   to exist as its own delegated zone first, and no nameserver migration is
   needed. Confirmed Infomaniak's own Node.js hosting is a paid product
   (30-day free trial only, credit card required) and not Next.js-native —
   so it's used purely as the domain registrar/DNS host, not app hosting.
   Skip Cloudflare: it adds a vendor with no real benefit here (proxying in
   front of Vercel causes cert/caching conflicts; DNS-only mode duplicates
   what Infomaniak already does).
9. **Data updates — git push only.** Updating the timetable means commit
   new/changed files under `data/`, push to `main`. Vercel's existing
   auto-deploy-on-push already rebuilds the app on every push, and the data
   build (§8.1) is just part of that normal build — so there is nothing
   extra to configure: no GitHub Actions workflow, no repo secrets, no
   database migration to run. "Who can update the data" is just "who has
   push access to the repo."

## 9. Decisions made / remaining defaults

Resolved with the user: repo name `mse-timetable` (public, personal account
`hajir3`), auth = Clerk + Google OAuth, no database, data updates = git push
only, subdomain = `timetable.mse.hajir.ch`.

Remaining items were defaulted to keep v1 scope small; all are easy,
contained changes later if they turn out wrong:

- **Anonymous browsing**: not allowed — login required to see the catalog or
  any calendar (§4).
- **Social/collaborative features** (e.g. seeing which classmates picked a
  module): out of scope for v1 (§3).
- **Expected user count**: assumed "tens of users" throughout — comfortably
  within Clerk's and Vercel's free tiers, not a decision that changes the
  architecture.

## 10. High-level architecture (final, per §8)

- **Frontend**: Next.js (App Router) + TypeScript + Tailwind CSS + shadcn/ui
  + `react-big-calendar` (date-fns localizer), deployed on Vercel with
  auto-deploy from GitHub. This is the entire hosting footprint — no server,
  no database.
- **Auth + persistence**: Clerk (hosted), Google OAuth. Each user's selected
  modules live in their own Clerk account metadata, read/written directly
  from the browser via Clerk's client SDK.
- **Backend**: none required for v1; Next.js Route Handlers only if/when a
  specific need (e.g. selection validation) justifies one.
- **Data build**: a TypeScript package (`packages/data-build`) using
  `exceljs` to parse the two xlsx sources plus the hand-maintained
  JSON/CSV academic calendar, validated against Zod schemas shared with the
  web app (`packages/shared`), producing one static JSON dataset consumed by
  the app. Runs as part of `apps/web`'s own build (`prebuild` step) —
  triggered automatically by Vercel's existing deploy-on-push, no separate
  CI system.
- **Repo layout**: pnpm workspace, `apps/web` + `packages/data-build` +
  `packages/shared` (no Turborepo initially).
- **DNS**: a CNAME for `timetable.mse.hajir.ch` (registrar: Infomaniak)
  pointed at Vercel; no nameserver migration, no Cloudflare.

## 11. Success criteria (v1 "done")

- Admin can roll out a new semester by committing the two xlsx files (plus
  the calendar data) under `data/` and pushing — the next Vercel deploy
  picks it up automatically, no other step.
- A student can log in, select their modules once, and thereafter just check
  their calendar — no re-entry needed until the next semester, and it
  follows them to any device they log into.
- Month/week/day views correctly reflect room-change exceptions and clearly
  distinguish holidays/lecture-free days and exam-session windows from
  regular teaching sessions.
- Running cost: $0/month — no database, no server, no paid tier on Vercel or
  Clerk required at this scale.
