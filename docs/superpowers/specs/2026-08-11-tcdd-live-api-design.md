# Replacing the guessed TCDD live path with the verified ebilet API

**Date:** 2026-08-11
**Status:** Approved, not yet implemented

## Why

`TcddTrainProvider` and `tcddResponse` were written against a guess. TCDD publishes no API
contract, so the transport, the auth scheme, the station identifiers and the response shape were
all placeholders chosen to be plausible and easy to correct later.

Every one of them is wrong. Pointed at the real endpoint today, the provider would send a request
TCDD rejects; if it somehow got a response, `findTrainArray` would match `trainLegs`, hand the
mapper leg objects that carry no `departureTime`, and return an empty array. The failure would be
silent — estimates everywhere, no error.

`madnoc/tcdd-bilet-bulucu-yeni-api` documents the API that ebilet itself uses. A live probe from
a developer machine on 2026-08-11 confirmed it still works: `200`, 573 KB, 20 real
Istanbul→Eskişehir departures for 2026-08-15 with fares and per-class seat counts, and 19 in the
return direction. That is the whole of what `capabilities` has been claiming and never delivering.

## What was verified

Probe captures are in the scratchpad; trimmed versions become test fixtures (see Testing).

| Aspect | What we assumed | What is true |
| --- | --- | --- |
| Transport | `GET {baseUrl}/search?from&to&date` | `POST https://web-api-prod-ytp.tcddtasimacilik.gov.tr/tms/train/train-availability?environment=dev&userId=1`, JSON body |
| Body | — | `searchRoutes[{departureStationId, departureStationName, arrivalStationId, arrivalStationName, departureDate}]`, `passengerTypeCounts: [{id: 0, count: 1}]`, `searchReservation: false`, `searchType: "DOMESTIC"` |
| Date format | `YYYY-MM-DD` | `DD-MM-YYYY 00:00:00` |
| Auth | `Authorization: Bearer <token>` from env | Static JWT scraped from the site's own `/js/index~*.js` bundle, sent as bare `Authorization: <jwt>`. No account, no API key. |
| WAF | not considered | `sec-ch-ua*`, `sec-fetch-*`, `Origin`, `Referer`, `User-Agent`, `unit-id: 3895` are load-bearing; without them the endpoint answers `403` |
| Stations | names only | numeric id **and** name, both required in the body |
| Trains | flat array | `trainLegs[].trainAvailabilities[].trains[]` |
| Times | Türkiye wall-clock strings | epoch milliseconds (true instants) |
| Fares | `fares[]` / `cabins[]` | `availableFareInfo[].cabinClasses[]` → `{cabinClass: {code, name}, minPrice, minPriceCurrency, availabilityCount}` |
| Seats | `availableSeats` | `cabinClassAvailabilities[].availabilityCount`, per cabin class |

Station ids, from TCDD's own station service: `İSTANBUL(SÖĞÜTLÜÇEŞME)` 1325, `ESKİŞEHİR` 93,
`ANKARA GAR` 98, `KONYA` 796, `KARAMAN` 791.

## Design

### 1. Live by default, self-bootstrapping

The provider is currently gated behind `TCDD_API_BASE_URL` because we did not know the endpoint.
We do now, and there is no credential to obtain, so the real base URL becomes the built-in default
and the JWT is fetched at runtime. A fresh clone gets live times with no `.env` setup.

`FallbackTrainProvider` still stands behind it, so the failure mode is unchanged — an unofficial
endpoint going away degrades to the curated timetable. It simply stops being the permanent state.
Env vars remain as overrides, not as the on-switch.

### 2. Auth and transport split into two new modules

**`src/lib/trains/tcddAuth.ts`** owns the token: fetch the site HTML, extract `/js/index~*.js`
bundle URLs, regex the JWT out of them, cache it. The cache is pinned to `globalThis` for the same
reason the timetable cache and the Prisma client are — Next re-evaluates modules on every edit in
dev, and a module-local variable would mean re-scraping TCDD's bundles on every keystroke. Exposes
a `refresh()` that the client calls once on a `401`.

**`src/lib/trains/tcddClient.ts`** owns the browser header set, the `POST`, the timeout, the
single 401-retry, and the translation of every failure into `TcddProviderError`.

Both take an injectable `fetch` so tests never touch the network.

`TcddTrainProvider` shrinks to orchestration: cache lookup → client → mapper. Its existing
10-minute per-route/date cache and 3-at-a-time day batching stay as they are; the token cache is
separate and process-wide.

### 3. `tcddResponse.ts` rewritten against the real shape

`findTrainArray` and the multi-spelling `pick*` helpers are deleted. They existed only to hedge
the guess, and now they would actively hurt: they turn a genuine upstream shape change into a
silent empty result instead of a `TcddProviderError` that fails over to estimates. Walk
`trainLegs[].trainAvailabilities[].trains[]` directly.

Per train: departure is `segments[0].departureTime`; arrival is the **last** segment's
`arrivalTime`. A train carries every intermediate segment of its run (9 for Söğütlüçeşme→Eskişehir),
so reading `segments[0].arrivalTime` would report arrival at Bostancı, nine minutes down the line.

`parseTcddInstant` is kept — it is still the correct guard if a field ever comes back as a string —
but the live path passes epoch millis, so its wall-clock branch is dead here. Malformed rows are
still dropped rather than thrown on: a partial timetable beats losing the pilot's whole day.

### 4. Cabin classes become a first-class concept

On the probed day, 14 of 20 trains had availability only in `DSB` — wheelchair spaces. A naive
`availableSeats > 0` would plan a commute onto a train the pilot cannot board.

```ts
/**
 * Cabin classes a pilot cannot book. Everything else counts.
 *
 * A denylist rather than an allowlist: TCDD returns five cabin classes today (Y1 EKONOMİ,
 * C BUSİNESS, L LOCA, B YATAKLI, DSB TEKERLEKLİ SANDALYE), and an allowlist would silently
 * drop any class added later — including B, the sleeper berth on the overnight service, which
 * is one of the more attractive commutes on offer.
 */
const EXCLUDED_CABIN_CODES = ["DSB"]; // wheelchair spaces
```

`availableSeats` sums everything else. `isSoldOut` is true when they are all zero, whatever DSB says.

**Cabin codes and booking codes are different namespaces and they collide.** Cabin class `B` is
YATAKLI (sleeper); booking class `B` is EKONOMİ STANDART. Read the code off
`cabinClasses[].cabinClass.code`, never off `bookingClassAvailabilities[].bookingClass.code`.
`fares[]` maps one entry per cabin class from `availableFareInfo[].cabinClasses[]`, carrying its
`minPrice` and its own count, so the UI can show "Business ×12, Economy ×133" and the pilot sees
which class is actually left.

`TrainFare.priceMinor` stays in kuruş; TCDD reports major-unit TRY, so multiply by 100.

### 5. `tcddStations.ts` carries id and name

```ts
IST: { id: 1325, name: "İSTANBUL(SÖĞÜTLÜÇEŞME)" }
```

CrewRest's own codes stay in `Pilot.homeStationCode`, so there is no data migration — the mapping
at the edge is exactly what that file exists for. `TCDD_STATION_IDS` keeps working as an override;
its value shape changes to `{"IST": {"id": 1325, "name": "..."}}`.

### 6. The booking deep link

`CLAUDE.md` records that the ebilet link format "cannot be discovered from code — [the params]
have to be read off a real search in a browser." That is not correct, and the note should be
fixed: the params are in a lazily-loaded chunk that an initial-bundle scan misses. The
`SeferListRedirect` component in `4696.*.chunk.js` reads exactly six query variables.

```
https://ebilet.tcddtasimacilik.gov.tr/sefer-listesi-yonlendirme
  ?binisIstasyonId=1325&inisIstasyonId=93&gidisTarih=2026-08-15&yolcuSayisi=1&seyahatTuru=1
```

`seyahatTuru=0` means round-trip and additionally reads `donusTarih`. `gidisTarih` is parsed with
`new Date(...)`, so `YYYY-MM-DD` is accepted.

This becomes the built-in default for `buildBookingUrl`, with `TCDD_BOOKING_URL_TEMPLATE` retained
as an override and a `{fromId}`/`{toId}` placeholder pair added for the numeric ids.

**This is the one part not verified by execution.** It was derived from TCDD's router code, but
ebilet is an SPA — a server-side fetch returns only the shell, so the link cannot be exercised from
here. It needs one click in a real browser before the default ships. Until confirmed, the existing
"fall back to the plain search page" behaviour is the safety net.

## Testing

Timetable responses contain **no personal data**. Unlike a roster, they are safe to commit — this
is the exception to the fixture rule in CLAUDE.md's Privacy section, and worth stating explicitly
so it does not read as a violation later.

Both probe captures get trimmed and committed as fixtures. Trimming **deletes only** — no retained
value is edited, so every field left is verbatim what TCDD sent. Removed: trains outside the
chosen set, the `cars` seat maps, `bookingClassCapacities`, `trainSegments`, and all station
fields except `id` and `name`. That takes the pair from 573 KB to 43 KB + 23 KB. A README beside
them records exactly this.

Istanbul → Eskişehir (`tcdd-ist-esk.json`):

- `81034` — several classes at once (C ×12, Y1 ×133, DSB ×2), 7 segments
- `81030` — DSB-only, must report `isSoldOut: true`, 8 segments
- `12002` — overnight, 22:47 → 03:19 crossing midnight

Eskişehir → Istanbul (`tcdd-esk-ist.json`):

- `81001` — only 2 segments, so a mapper that hardcodes "last of many" is still exercised at the
  short end
- `22001` — the sleeper (B ×8 alongside Y1 ×153), 10 segments, 01:28 → 06:26. Doubles as the
  reachability case: departure inside the metro's post-midnight band, arrival after the 06:00
  alighting floor.

`tcddResponse.test.ts` currently asserts against a fixture we invented; it will assert against what
TCDD actually sent. Its `TZ` pin and the guard assertion proving the pin took effect both stay —
the mapper is still capable of seeing a string timestamp, and the guard is what stops the suite
passing vacuously.

New tests for `tcddAuth` (token extraction from a sample bundle, refresh on 401) and `tcddClient`
(header set present, 401 retried once and only once, non-200 becomes `TcddProviderError`) run
against an injected `fetch`.

`FallbackTrainProvider.test.ts` already covers degradation and should keep passing untouched — if
it does not, the seam has been broken.

## Out of scope

- Buying tickets. Unchanged: `capabilities.booking` stays `false`, and payment still finishes on
  TCDD's site behind a bank 3-D Secure redirect.
- Storing passenger identity. Still out of scope by decision.
- Seat-level selection, the seat map endpoint, and alarms for sold-out trains.
