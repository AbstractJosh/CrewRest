# CrewRest

Airline crew based in one city often live in another. Between duties there are gaps — but a
gap on the roster is not the same as time you can actually spend at home. CrewRest reads a
monthly crew roster PDF, works out which gaps are genuinely long enough to commute home on
the high-speed train, and helps commit to a specific trip.

## What it does

- **Parses the roster.** Upload the monthly "EKİP PLANLAMA SİSTEMİ" PDF. It reads the
  local-time section, groups flights into duty blocks, and pulls out report time (MB), duty
  release (MS) and the minimum-rest deadline (DSB), plus every flight leg in both local and
  GMT.
- **Finds real off-windows.** Gaps run from duty release to the next report time. Idle time
  *inside* a trip doesn't count — you're down route, not at home. Minimum rest is shown for
  context but never shortens the window: it constrains when the airline may roster you, not
  when you may travel.
- **Turns a gap into a travel window.** Your airport↔station transfer time is subtracted from
  both ends, so what you see is time you can actually be moving.
- **Suggests trains you can catch.** Only departures the feeder metro can get you to
  (07:30–01:30), only returns that land early enough to reach the airport again, and a warning
  when the first reachable train is more than two hours after you're free.
- **Lets you commit** to a chosen outbound/return pair per window.

Two settings are per-pilot and adjustable at any time: the minimum gap worth a trip, and the
airport↔station transfer time.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Prisma 7 on SQLite · Tailwind 4 ·
`pdfjs-dist` for PDF text extraction.

## Running it

```bash
npm install
cp .env.example .env
npx prisma migrate dev
npm run dev
```

Then open http://localhost:3000 and upload a roster.

```bash
npm test          # unit tests for the window and train-reachability logic
npm run lint
npm run build
```

To reach it from other devices on your network, `npm run build && npm run start` binds to
`0.0.0.0:3000`; you may need a firewall rule for the port.

## Roster data is not in this repo

`data/` is gitignored on purpose. A real roster PDF contains the holder's passport number,
medical record dates, a month of their movements, and the full names of every colleague they
flew with. Keep rosters local; don't commit them.

This means there's no sample roster here to try the parser against. The parser is written
against the local-time table of the Turkish Airlines monthly roster export specifically, so it
won't generalise to other airlines' formats without changes.

## Train data

TCDD has no usable public timetable API — the legacy endpoint is dead and the current one sits
behind bot protection that rejects server-to-server requests. So `src/lib/trains/data/` holds a
curated, approximate YHT timetable behind a `TrainProvider` interface, ready to swap for a live
source. **Treat the times as planning estimates and confirm on
[ebilet.tcddtasimacilik.gov.tr](https://ebilet.tcddtasimacilik.gov.tr) before booking.**

## Status

Personal project. Phases 1 and 2 of `crew-travel-planner-spec.md` are built. Not affiliated
with or endorsed by Turkish Airlines or TCDD.
