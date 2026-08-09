# Crew Flight-to-Home Travel Planner — Build Spec

## Context

Personal app for a Turkish Airlines crew member (source data: "EKİP PLANLAMA
SİSTEMİ" monthly flight roster export — a table with flight numbers, duty
codes, and departure/arrival times in **GMT**). The goal: given the monthly
roster, automatically figure out *when the crew member can actually go home*
between flights — accounting for timezone conversion, travel time, and
eventually train connections — not just raw idle time.

## Roster structure (input data)

- The roster groups flights into **blocks** (a box in the schedule =
  one trip made of back-to-back connecting flights).
- Idle time **inside** a block does NOT mean free time at home — the crew
  stays abroad for the duration of that trip.
- Only gaps **between** blocks are candidate "home time."
- All times in the source table are GMT and must be converted to Istanbul
  local time (UTC+3, no DST) before any of the math below.

## Core business rule: computing the home window

For each gap between two flight blocks:

```
home_arrival_time   = (local end time of last flight in block)  + buffer_in
next_departure_time = (local start time of first flight in next block) − 2:00
rest_window          = [home_arrival_time, next_departure_time]
```

- If `rest_window` is zero or negative, there's no home time for that gap —
  the crew stays in the destination city.
- `buffer_in` covers "get from airport to home": the notes give two
  different values (**+1:00** in one pass, **+1:30** in a later pass) —
  **flag this to the user and confirm which is current** before hardcoding it.
- The `−2:00` before the next flight covers getting ready and traveling
  back to the airport.

## Feature phases

**Phase 1 — Core gap calculator**
Parse roster → convert to local time → for every gap between blocks, output
whether the crew can go home, and if so `home_arrival_time`,
`next_departure_time`, and the rest duration.

**Phase 2 — Train integration**
- From `home_arrival_time`, find the earliest catchable train home.
- Feeder metro only runs 06:00–24:00, which bounds reachable trains:
  earliest ~07:30, latest ~01:30 (next day, if past-midnight trains exist).
- Don't want to wait more than 2 hours at the station — if the only option
  needs a longer wait, roll over to checking the next day instead.
- Nice-to-have: show live seat/ticket availability per train — a train that
  exists but is sold out doesn't count as a way home.

**Phase 3 — Multi-destination / multi-user**
- Generalize beyond "me": let a user pick a destination city and a
  transport mode (train, bus, plane, personal car), not just the one
  train route.
- Same "gap → can I get there and back in time" logic, parameterized by
  mode/route instead of hardcoded to the train.

**Phase 4 — Partner shared-schedule visit planner (stretch)**
- Import a second person's schedule (e.g. a partner in another city —
  airline crews often already use a "shared roster" tool that shows
  common days off).
- Compute overlapping free windows between both schedules.
- Recommend whether it makes more sense for the user to travel to the
  partner or vice versa. (Decision logic — e.g. whoever has the tighter
  schedule stays put — needs to be defined with the user; not specified
  in the source notes.)

## Open questions to resolve before/while building

1. Is the home-arrival buffer +1:00 or +1:30? (Notes are inconsistent
   across passes — Phase 3's version, +1:30, looks like the latest/final
   one, but confirm.)
2. Train timetable source: real API/GTFS feed, or hardcoded/user-entered
   schedule for v1?
3. Exact "next day" fallback behavior when no same-day train fits the
   2-hour-max-wait rule.
4. What defines "home city" vs. a Phase 3 arbitrary destination — is it
   just a config setting per user?
5. Data source for the partner's schedule in Phase 4 — manual entry,
   shared file, or an integration with whatever "share roster" tool they
   already use?

## Implementation notes

- The roster is a screenshot/table image, not clean structured data — OCR
  on it is unreliable for the exact time formatting used. For v1, better to
  have the user paste/enter flight legs as structured data (CSV or a small
  entry form) rather than parse the image directly. Image parsing can be a
  later stretch goal.
- Treat all roster times as GMT internally; convert to Europe/Istanbul
  (fixed UTC+3) only at the point of computing home/departure windows and
  displaying to the user.
- Build Phase 1 as a standalone, testable function (roster legs in →
  home windows out) before touching train data or UI — it's the part
  every later phase depends on.
