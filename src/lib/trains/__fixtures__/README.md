# TCDD response fixtures

Real responses from `POST web-api-prod-ytp.tcddtasimacilik.gov.tr/tms/train/train-availability`,
captured 2026-08-11 for travel on 2026-08-15.

## Why these are committed when roster fixtures are not

CLAUDE.md forbids fixtures built from real data. That rule protects roster PDFs, which contain the
holder's passport number, medical record dates and the names of every colleague they flew with.

A timetable response contains none of that: train numbers, times, prices and seat counts, all of
which TCDD publishes to anyone who loads its website. There is no passenger data in these files —
the request is an anonymous availability search, not a booking.

## How they were trimmed

The pre-trim captures total ~2.8 MB; trimming takes them to ~66 KB combined. Trimming **deleted only** — no retained value was edited, so
every field present is verbatim what TCDD sent. Removed:

- all trains except the ones listed below
- `cars` (per-carriage seat maps)
- `bookingClassCapacities` and `trainSegments`
- every station field except `id` and `name`

## What each train is here to test

`tcdd-ist-esk.json` — İstanbul(Söğütlüçeşme) → Eskişehir

| Train | Why |
| --- | --- |
| 81034 | Several cabin classes at once: C ×12, Y1 ×133, DSB ×2; also carries L (LOCA) at availabilityCount: 0 |
| 81030 | DSB-only — must map to `isSoldOut: true`, because a pilot cannot book a wheelchair space; also carries L (LOCA) at availabilityCount: 0 |
| 12002 | Overnight, 22:47 → 03:19, crossing midnight |

`tcdd-esk-ist.json` — Eskişehir → İstanbul(Söğütlüçeşme)

| Train | Why |
| --- | --- |
| 81001 | Only 2 segments, so "arrival is the last segment" is exercised at the short end too |
| 22001 | The sleeper: cabin class B ×8 alongside Y1 ×153. Departs 01:28, arrives 06:26 — inside the metro's post-midnight boarding band and after the 06:00 alighting floor |

## Refreshing them

Only if TCDD changes shape. Re-run the capture, re-trim, and expect to update the pinned instants
in `tcddResponse.test.ts` — they are absolute epoch values tied to the captured date.
