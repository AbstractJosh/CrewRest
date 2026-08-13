# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Standing instructions

- Assume all transit is between Istanbul and Eskisehir for now.
- Times printed under the roster's "Gorev" tab are GMT. Convert them to Istanbul local time before presenting anything to the user.

@AGENTS.md

## What this is

CrewRest reads a Turkish Airlines monthly crew roster PDF and works out which gaps between duties are genuinely long enough to commute home on the high-speed train (YHT), then lets the pilot commit to a specific outbound/return pair. Phases 1, 2 and 2b of `crew-travel-planner-spec.md` are built; that spec is the source of truth for intended behaviour and for what Phases 3–4 would add.

Next.js 16 (App Router) · React 19 · TypeScript · Prisma 7 on SQLite · Tailwind 4 · `pdfjs-dist`.

## Setup and commands

```bash
npm install
cp .env.example .env
npx prisma generate         # required: the client is generated to src/generated/prisma, which is gitignored
npx prisma migrate dev
npm run dev
```

```bash
npm test                                                  # node:test via tsx, all src/lib/**/*.test.ts
node --import tsx --test src/lib/trains/reachability.test.ts   # single test file
node --import tsx --test --test-name-pattern "long wait" "src/lib/**/*.test.ts"   # single test case
npm run lint
npm run build
```

A fresh clone will not typecheck or build until `prisma generate` has run — `src/generated/prisma` is gitignored and several modules import types from it.

## Architecture

The pipeline runs in one direction, and each stage is a pure function in `src/lib/` that the App Router layer only orchestrates:

```
PDF → extractPdfText → parseSchedulePdf → computeOffWindows → [persisted]
                                                   ↓ (read time)
                          computeTravelWindow → searchTrainsInWindow → isBoardable/isAlightable
                                                   ↓
                          chooseOutbound → evaluateCommuteFeasibility → CommuteCommitment
```

- `POST /api/upload` (`src/app/api/upload/route.ts`) runs the left half and persists `Pilot` / `ScheduleUpload` / `DutyPeriod` / `OffWindow`.
- `src/app/pilot/[crewId]/page.tsx` and `.../window/[windowId]/page.tsx` are server components that run the right half on every render. They hold no logic of their own: each awaits one builder from `src/lib/views/` and renders the result.
- The three `PATCH`-style routes under `src/app/api/pilot/[crewId]/` only write per-pilot settings; they never recompute stored data (see "stored vs derived").

### The view layer (`src/lib/views/`)

Each page has a builder split in two: a pure `assemble*View` doing the filtering, choosing, serializing and commitment-matching, and an `async build*View` around it doing the Prisma queries and the timetable search. Nothing about that assembly is web-specific, so it is unit-tested directly instead of by rendering a page against a database, and a route handler could serve it as JSON to a client that isn't React.

`SerializedTrainOption` — the `TrainOption` shape with ISO instants and a resolved booking URL — lives in `src/lib/trains/serialized.ts`, not beside the component that renders it. It is a contract: it crosses to the client *and* it is what `CommuteCommitment.outboundTrain`/`returnTrain` store.

`src/lib/portability.test.ts` enforces the property all of this exists to protect: nothing under `src/lib` imports `next/*`, and nothing outside an explicit `SERVER_ONLY` allowlist imports Prisma. The intent is a second client (a native app talking to this server) staying cheap to add; that is only true while the core has no framework in it. When something genuinely belongs on the server, add it to `SERVER_ONLY` rather than relaxing the rule.

### Time handling — read `src/lib/time/turkeyTime.ts` before touching any date

Every `Date` in the system is an absolute instant. Roster wall-clock times are turned into instants with `buildTurkeyDate()`, which hardcodes a fixed UTC+3 offset (Turkey has had no DST since 2016). Formatting for display goes through the `formatTurkey*` / `formatUtc*` helpers, which shift explicitly rather than relying on the server's timezone.

Never use `getHours()`, `toLocaleString()`, a bare `new Date(y, m, d)`, or `new Date("2026-08-15T07:30:00")` on a zoneless string in this codebase — the server's local timezone is not Istanbul and any of those will silently produce wrong roster times. Turkey-local "minutes of day" or "midnight" derivations are done by shifting into UTC first (`turkeyMinutesOfDay`, `turkeyMidnight`); external zoneless timestamps are rebuilt component-wise (`parseTcddInstant`).

This class of bug is invisible on a UTC+3 machine, where the wrong parse gives the right answer — and its output is a plausible-looking timetable, not an obvious error. So **any test asserting on parsed local times must pin a non-Turkish `TZ`** before its first import. `src/lib/trains/tcddResponse.test.ts` does this and carries a guard assertion proving the pin took effect; without that guard the whole suite passes vacuously.

### The three roster timestamps

`ParsedDutyBlock` carries three, and confusing them is the most likely source of a wrong window:

- **MB** (`startAt`) — report for duty. Hard deadline the pilot must be back for.
- **MS** (`endAt`) — duty release. The pilot is free from here. **This is what off-windows are measured from.**
- **DSB** (`restEndsAt`) — end of minimum rest. This constrains when the *airline* may roster the next duty; it does **not** stop the pilot travelling. It is displayed as context only and must never shorten a window. Null for day-off blocks.

### Stored vs derived — the central design decision

`computeOffWindows` is called at upload time with `minDurationMinutes: 0`, so *every* gap is persisted regardless of length. Both per-pilot settings are then applied at read time:

- `Pilot.minOffHours` — filters which windows are shown as commute opportunities.
- `Pilot.airportTransferMinutes` — subtracted from both ends by `computeTravelWindow` to produce the window actually available for travel.

Consequence: changing either setting must never require re-uploading the roster. Do not push either value into `computeOffWindows` or into the stored `OffWindow` rows.

The transfer buffer is applied **exactly once**, in `computeTravelWindow`. `evaluateCommuteFeasibility` takes the already-buffered travel window and deliberately does not re-apply it; adding it there double-counts.

### PDF parsing (`src/lib/pdf/scheduleParser.ts`)

The roster has two tables. The **local-time section** ("LOKAL SAATLI UCUS PROGRAMI") is the source of truth for duty blocks and is located by its repeating column-header row, not its title, because the title prints only on the section's first page. The **GMT table** is used only to annotate individual flight legs with GMT times; legs are paired positionally by a forward cursor that stops on the first flight-number mismatch rather than risk misattributing times.

Other parser subtleties that already have comments and shouldn't be "simplified" away: the `(?<![A-Z])` lookbehinds on `MB:`/`MS:`/`DSB:` (guarding against `GMB:`/`GMS:`), the disjointness of `FLIGHT_LEG_RE` and `GMT_FLIGHT_LEG_RE` (the latter requires a full date), Turkish month abbreviations, and `fixYearRollovers` for schedules crossing New Year.

There is **no sample roster in the repo** and there cannot be one (see Privacy). Parser changes are verified by unit tests and by the user running a real roster locally — not by anything checked in.

### Trains

`TrainProvider` (`src/lib/trains/TrainProvider.ts`) is the seam for timetable data, with three implementations:

- `TcddTrainProvider` — live times, fares and seat availability. On by default; `TCDD_API_BASE_URL` only overrides the built-in endpoint (for a proxy or a mock). Caches per route/date for 10 minutes on a `globalThis`-pinned Map (same reason as `src/lib/prisma.ts`) and batches day requests three at a time.
- `StaticTrainProvider` — the curated, approximate YHT timetable in `src/lib/trains/data/yhtRoutes.ts`.
- `FallbackTrainProvider` — runs the live one with the static one standing by.

TCDD publishes no official API and the endpoint being integrated is unofficial, so **a failing live request is the expected steady state, not a bug**: it must degrade to estimates, never error the page. Every `TrainOption` carries `source: "live" | "estimate"`, each provider declares `capabilities`, and user-facing copy is driven by those rather than hardcoded — keep the "planning estimates, confirm on ebilet" framing for anything sourced `estimate`. New optional fields on `TrainOption` must stay optional so `StaticTrainProvider` keeps compiling and the UI degrades field by field.

Both halves of the live path are now confirmed against the real service rather than guessed:

- Response field names in `src/lib/trains/tcddResponse.ts`: the payload shape (`trainLegs` → `trainAvailabilities` → `trains`) is verified against real captured responses in `src/lib/trains/__fixtures__/`. The mapper reads specific field names against that known shape and drops rows it can't read rather than throwing — that's resilience to a row-level surprise, not uncertainty about the shape itself. If TCDD's payload changes, adjust there; the fixture tests will catch it.

  Two deliberate omissions in that mapper, both of which look like bugs until you know why. `EXCLUDED_CABIN_CODES` (DSB, wheelchair spaces) is filtered out of **both** the seat count and `fares[]` — on a typical day most trains have sold out of everything else, so leaving DSB in either place advertises a train the pilot cannot board, once as availability and once as a headline price. And an entry in `trainAvailabilities` is an *itinerary*, not a train: one flagged `connection: true`, or carrying more than one train, is dropped whole. CrewRest stamps every option with the search's own origin and destination, so a connection's second leg would be presented as a through-service departing at the connection time. Istanbul↔Eskişehir is direct, but `KRM` is a selectable home station and IST→KRM is not. A partial timetable is this integration's documented degradation; a plausible-looking wrong departure is not.
- The ebilet deep-link format. ebilet is an SPA that serves only a shell to server-side fetches, but the params weren't undiscoverable, only lazily loaded: they're read by the `SeferListRedirect` component in ebilet's lazily-loaded `4696.*.chunk.js`, which parses exactly six query variables (`binisIstasyonId`, `inisIstasyonId`, `gidisTarih`, `donusTarih`, `seyahatTuru`, `yolcuSayisi`). `EBILET_DEFAULT_TEMPLATE` in `src/lib/trains/booking.ts` fills those in by default; `TCDD_BOOKING_URL_TEMPLATE` overrides it if TCDD changes the format. Confirmed in a browser on 2026-08-12, both directions: the link lands on `/sefer-listesi` with the right stations, date and passenger count, and the real timetable rendered.

  **`donusTarih` must be sent even on a one-way link.** `SeferListRedirect` runs `JSON.parse(JSON.stringify(getVars.donusTarih))` *before* it branches on `seyahatTuru`, so omitting the key is `JSON.parse(undefined)` — it throws, unwinds into the station loader's `.catch`, and silently bounces the pilot to the ebilet home page with a "station list could not be reached" alert. The template sends it empty. That is also why the default is not simply "the six params"; the failure looked exactly like a WAF or station-id problem and was neither.

### Buying tickets

CrewRest cannot sell tickets. TCDD settles card payments through a bank 3-D Secure redirect where the cardholder authenticates on the bank's page, so purchase always finishes on TCDD's site. The app hands off — a prefilled ebilet link per train — and a PNR pasted back into `CommuteCommitment.bookingReference` marks a committed window as actually ticketed rather than merely planned.

**Never store passenger identity** (TC kimlik, passport). It is out of scope by decision, not oversight; see Privacy.

Reachability is separate from the timetable and encodes the feeder metro's hours: `isBoardable` (07:30–01:30, a band that wraps past midnight, hence an OR rather than a range test) and `isAlightable` (arrival at or after 06:00). The spec's "roll over to the next day" behaviour is achieved implicitly — `searchTrainsInWindow` queries every Turkey-local date the window touches, so the earliest acceptable train simply lands on a later date.

### Data model

`prisma/schema.prisma`. `OffWindow` has no foreign key to the duty that precedes it; the window page recovers it by querying the latest `DutyPeriod` ending at or before the window start. `DutyPeriod.flightLegs` and `CommuteCommitment.outboundTrain`/`returnTrain` are JSON columns cast to `FlightLeg[]` / `SerializedTrainOption` on read — these casts are unchecked, so changing either shape means migrating existing rows or handling both.

Prisma 7 runs through the `better-sqlite3` driver adapter (`src/lib/prisma.ts`), the client is generated to `src/generated/prisma` (not `node_modules`), and `prisma.config.ts` loads `DATABASE_URL` via `dotenv`. Prisma-specific skills live in `.claude/skills/prisma-*` — consult them before non-trivial Prisma work.

## Privacy

`/data` is gitignored on purpose. A real roster PDF contains the holder's passport number, medical record dates, a month of their movements, and the full names of every colleague they flew with. Never commit a roster, never paste roster contents into a commit message or issue, and never add a fixture built from a real one.

`dev.db` and `.env` are gitignored for the same reason — the database holds the parsed roster, which is the same personal data in another shape. Don't attach or upload either when debugging.

Timetable responses are the one exception: `src/lib/trains/__fixtures__/` holds real TCDD
availability payloads, which contain public departure data and no passenger information. See the
README there.

## Other constraints

- `pdfjs-dist` is in `serverExternalPackages` (`next.config.ts`) — it resolves its worker relative to its own package directory at runtime, so it must not be bundled.
- `AGENTS.md` carries a Next.js 16 warning block that `next dev` rewrites; when it shows up as an uncommitted change, commit it with your work rather than reverting it.
- Next.js 16 supplies the `PageProps<"...">` and `RouteContext<"...">` globals used in pages and route handlers; `params` is a promise and must be awaited.
