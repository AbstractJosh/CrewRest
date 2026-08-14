# A ticket-grammar UI, rebuilt on a real token layer

**Date:** 2026-08-13
**Status:** Approved, not yet implemented

## Why

CrewRest's UI has never been designed. It is the Next.js starter's styling conventions applied
page by page as pages were added, and it now shows in three concrete ways.

**There is no token layer.** `src/app/globals.css` still defines `--background` and `--foreground`
from the starter template, and *nothing in the app references either one* — every page hardcodes
`bg-zinc-50 dark:bg-black` instead. Because there are no tokens, every colour is written twice, in
place, as a `dark:` pair: `text-zinc-500 dark:text-zinc-400` and its siblings appear across all
eleven `.tsx` files. Changing the palette today means a find-and-replace through the whole UI.

**The fonts are broken.** `layout.tsx` loads Geist and Geist Mono via `next/font/google` and wires
them into `@theme inline` as `--font-sans` / `--font-mono`. Then `globals.css` sets
`body { font-family: Arial, Helvetica, sans-serif }`, which overrides both. The app has been
rendering in Arial since the first commit; Geist is downloaded on every page load and used by
nothing.

**There is no shared chrome.** Every page hand-rolls its own navigation — `/pilot/[crewId]` offers
"Upload new schedule", `/plans` offers "Home", the window page offers "← Back to schedule". There
is no header, no consistent way back, and no way to reach `/plans` from the pilot page at all.

Underneath that, a component vocabulary already exists — it is just copy-pasted rather than
extracted. The card (`rounded-lg border border-zinc-200 bg-white p-4 …`) appears eight times, the
pill button four, the underline link eight, the form-field styling five. Semantic colour is already
used consistently: amber for estimates and caveats, emerald for feasible and ticketed, red for
errors and destructive actions.

So this is not a reskin. It is extracting the vocabulary that is already implicitly there, putting
it on tokens, and giving it a deliberate aesthetic.

## The aesthetic: ticket grammar

A committed plan in CrewRest genuinely *is* a ticket — origin, destination, two dated legs, and a
PNR. The design leans into that, but borrows a ticket's **typography and structure**, not its
texture: tabular mono figures for every time, duration, station code and PNR; station codes in caps
joined by a route connector; a dashed "perforation" rule dividing a card from its stub; status as a
letterspaced stamp rather than a filled pill.

No paper texture, no notches, no rotated text, no skeuomorphic shadows. The character comes from
type and structure, which is what survives a phone — and Geist Mono, already loaded and currently
unused, becomes the backbone of the design instead of dead weight.

## Decisions taken during design

| Question | Decision | Why |
| --- | --- | --- |
| Reskin, or redesign? | Redesign — tokens, extracted components, and rebuilt screens | Requested ("from scratch"). A reskin on top of eleven files of hardcoded `dark:` pairs would leave the same maintenance problem with new colours in it. |
| Primary device | Laptop-first, but nothing structural that cannot collapse to one column | Requested. The month is planned sitting down. Mobile is a stated future direction, so no layout may depend on width to remain usable. |
| How literal is the ticket metaphor? | Ticket *grammar* — mono figures, station codes, route line, perforation, stamps. Clean flat surfaces. | Requested ("clean looking … train ticket aesthetic"). The literal boarding-pass alternative — notches, a vertical tear-off stub with rotated text — was rejected because the vertical stub is the first thing to break at narrow widths, which is exactly the direction this is heading, and rotated text is hostile to screen readers. |
| Dark mode | Follow the OS by default, plus a manual toggle cycling auto → light → dark | Requested. Crew work nights; a paper-only aesthetic would mean a white screen at 03:00 in a dark hotel. The toggle also gives the new header a second job. |
| Where do components live? | `src/components/`, never `src/lib/` | `src/lib/portability.test.ts` asserts that nothing under `src/lib` imports `next/*`. Components import `next/link`, so `src/lib` is closed to them — and that boundary is the reason a second client stays cheap to add. |
| What do components receive? | View-model props only — never Prisma models, never raw rows | Preserves the existing architecture, where `assemble*View` is pure and framework-free. A component that takes a `PlanCardView` is reusable by a future phone client; one that takes a Prisma model is not. |
| New test infrastructure for components? | No | The components are presentational; the logic they render is already covered by the `assemble*View` unit tests. Adding jsdom + a React testing library to verify that a `<div>` has a class would be cost without coverage. Verification is the existing suite staying green, plus the real app in a browser. |
| Are the optional extras in scope? | Yes — all three: schedule timeline, planner loading state, drag-and-drop upload | Requested. |

## Design

### 1. Token layer

All tokens are **semantic**. No component writes a literal colour, and no component writes a `dark:`
variant — the variant exists for the rare structural case, not for colour.

```css
/* src/app/globals.css */
@import "tailwindcss";

/* Must mirror §2's three states exactly — see the note there. */
@custom-variant dark {
  @media (prefers-color-scheme: dark) {
    &:where(:not([data-theme="light"]) *) { @slot; }
  }
  &:where([data-theme="dark"] *) { @slot; }
}

:root {
  /* surfaces */
  --paper:      #faf9f7;   /* page — warm off-white, deliberately not #fff */
  --card:       #ffffff;   /* the ticket */
  --sunken:     #f4f2ef;   /* the stub, muted panels, table header */
  /* ink */
  --ink:        #1a1a17;   /* primary text — deliberately not pure black */
  --ink-muted:  #5c5a54;   /* secondary text */
  --ink-faint:  #94918a;   /* GMT lines, meta, timestamps */
  /* lines */
  --rule:       #e3e0da;   /* borders */
  --perf:       #cfcbc3;   /* perforation dashes */
  /* action */
  --action:     #1a1a17;   --action-ink: #faf9f7;
  /* semantics — carried over from the existing implicit scheme */
  --ok:         #1f6f4a;   --ok-bg:      #e8f3ec;   /* feasible, ticketed */
  --warn:       #8a5a12;   --warn-bg:    #fbf1de;   /* estimate, caveat, standby-adjacent */
  --danger:     #9b2c2c;   --danger-bg:  #fbeaea;   /* error, destructive */
}
```

Dark is **not** light inverted. It is ink on a dark card: a near-black warm page, a card lifted
slightly above it, warm off-white text, and accent pairs re-tuned rather than reused.

```css
/* dark values, applied by both blocks in §2 */
--paper: #0f0f0e;  --card: #1a1a18;  --sunken: #141413;
--ink:   #f2f0eb;  --ink-muted: #a3a09a;  --ink-faint: #6e6b65;
--rule:  #2e2d2a;  --perf: #3d3b37;
--action: #f2f0eb; --action-ink: #1a1a18;
--ok:     #7fcfa4; --ok-bg:     #14291f;
--warn:   #e8b96a; --warn-bg:   #2b2216;
--danger: #f08a8a; --danger-bg: #2e1919;
```

These are starting values. They are retuned during implementation against measured contrast, with
one acceptance criterion: **body and secondary text meet WCAG AA (4.5:1) against the surface behind
them, in both themes.** `--ink-faint` is used only for supporting metadata and is held to 3:1.

Tokens are exposed to Tailwind by reference, so a selector can swap them:

```css
@theme inline {
  --color-paper: var(--paper);       --color-card: var(--card);
  --color-sunken: var(--sunken);     --color-ink: var(--ink);
  --color-ink-muted: var(--ink-muted); --color-ink-faint: var(--ink-faint);
  --color-rule: var(--rule);         --color-perf: var(--perf);
  --color-action: var(--action);     --color-action-ink: var(--action-ink);
  --color-ok: var(--ok);             --color-ok-bg: var(--ok-bg);
  --color-warn: var(--warn);         --color-warn-bg: var(--warn-bg);
  --color-danger: var(--danger);     --color-danger-bg: var(--danger-bg);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

body {
  background: var(--paper);
  color: var(--ink);
  font-family: var(--font-sans);   /* fixes the Arial override */
}
```

The starter's `--background` / `--foreground` are deleted, not renamed — nothing references them.

### 2. Theming mechanism

Three states, and the ordering matters: an explicit choice must win in **both** directions, while
the unset default still tracks the OS.

```css
:root { /* light values — see §1 */ }

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { /* dark values */ }
}

:root[data-theme="dark"] { /* dark values */ }
```

**Tailwind's built-in `dark:` variant must be redefined, not left alone.** It keys off
`prefers-color-scheme` only, which desynchronises from the tokens in both directions: in *auto* on a
dark OS the tokens go dark but `dark:` utilities never fire, and with light *forced* on a dark OS the
tokens go light while `dark:` utilities still fire. Neither failure is visible in the common case —
each needs a specific OS-plus-override combination to appear. Hence the block-form
`@custom-variant` in §1, whose two rules are the same two rules as the media query and the attribute
selector below. **If one is ever edited, the other must be edited to match.** In practice colour
goes through tokens and `dark:` should be rare; the variant is correct here so that a stray use is
merely redundant rather than subtly wrong.

`ThemeToggle` (client) cycles **auto → light → dark → auto**, writes the choice to `localStorage`
under `crewrest-theme`, and sets or removes `data-theme` on `document.documentElement`. "Auto"
removes the attribute entirely, which is what hands control back to the media query.

To avoid a flash of the wrong theme on every load, the root layout renders a synchronous inline
`<script>` inside `<head>` that reads `localStorage` and stamps `data-theme` before first paint:

```tsx
<head>
  <script dangerouslySetInnerHTML={{ __html:
    `try{var t=localStorage.getItem('crewrest-theme');if(t==='dark'||t==='light')` +
    `document.documentElement.setAttribute('data-theme',t)}catch(e){}` }} />
</head>
```

A plain `<script>` rather than `next/script`: this must execute before the first paint, and the
`try/catch` matters because `localStorage` throws outright in some privacy modes — an uncaught throw
there would take the whole document down. If ordering proves unreliable in practice, the documented
fallback is `next/script` with `strategy="beforeInteractive"`, which Next injects into `<head>`
from the server regardless of where it is placed.

The toggle renders its three states as an icon with an accessible label, and must not assume a
theme during SSR — it renders the "auto" affordance until mounted, then reflects the stored choice.

### 3. Component inventory

Roughly twenty components in three groups. Only those listed as **client** carry `"use client"`;
everything else stays server-safe so pages remain server components.

**`src/components/chrome/`**

| Component | Job |
| --- | --- |
| `AppHeader` | Wordmark, nav (Schedule · Plans · Upload), `ThemeToggle`. Sticky. Replaces the three ad-hoc per-page back links. |
| `PageShell` | Centred column with `default` and `narrow` variants |
| `PageHeader` | Title, optional subtitle, optional action slot |
| `ThemeToggle` | **client** — the auto/light/dark cycle from §2 |

The `Schedule` nav item needs a crew ID, which the header does not have on `/`, `/upload` or
`/plans`. It renders only when one is in scope, passed down from the page; elsewhere the nav shows
Plans and Upload. No crew ID is ever stored or guessed — that would be inventing the user identity
CrewRest deliberately does not have.

**`src/components/ui/`**

| Component | Job | Replaces |
| --- | --- | --- |
| `Ticket` | The card: border, radius, `--card` surface | 8 copies of the card class string |
| `Perforation` | The dashed rule between body and stub | — |
| `TicketStub` | Muted strip below the perforation | — |
| `Stamp` | Status: uppercase, letterspaced, bordered. Tones `ok`/`warn`/`neutral`/`danger` | Ticketed / Planned / Cancelled / standby badges |
| `Button` | Variants `primary`/`ghost`/`link`/`danger`, sizes `sm`/`md` | 4 pill buttons + 8 underline links |
| `Callout` | Tone-driven message box | 5 hand-rolled coloured boxes |
| `Field` | Label + control + hint + error wrapper | — |
| `TextInput`, `TextArea`, `Select` | Token-styled form controls | 5 copies of the input class string |
| `InlineEdit` | **client** — borderless-until-hover text input | The PlanCard trip-name input |
| `SaveHint` | idle/saving/saved/error microcopy | Promoted from `PlanCard` |
| `EmptyState` | Empty-list messaging | 3 ad-hoc empty paragraphs |

`Button` uses no hooks, so it is importable from both server and client components; only its
`onClick` consumers need to be client components.

**`src/components/domain/`**

| Component | Job |
| --- | --- |
| `TimeStack` | Türkiye-local time prominent, GMT faint beneath, all tabular. Takes an instant or a pair. |
| `RouteLine` | `IST ●──────────● ESK`, optional duration centred |
| `SourceNote` | The live-vs-estimate footnote, driven by `source` |
| `TrainPicker` | **client** — train `<select>` with price and seats-left in the label |
| `ScheduleTimeline` | §5 |

`TimeStack` is the single highest-value extraction. The local-over-GMT pairing is hand-written in
six places today, and showing Türkiye local time with GMT context is a standing project rule
(CLAUDE.md). One component makes that rule structural rather than remembered — and it routes every
instance through the existing `formatTurkey*` / `formatUtc*` helpers, so no component ever touches
a `Date` method directly.

### 4. Screens

**`/`** — narrow shell. Wordmark, one line of copy, the two entry links rendered as tickets. No
database access; stays static.

**`/upload`** — narrow shell. The bare file input becomes a drop zone: dashed `--perf` border,
drag-over state, chosen filename with size, and a progress state while parsing. Errors move into
`Callout`. Behaviour is unchanged — `POST /api/upload`, then redirect to `/pilot/<crewId>`.

**`/pilot/[crewId]`** — the main screen.

- Pilot identity (name, crew ID, aircraft type, period) becomes a ticket header.
- The two settings controls shrink from full-width cards into a **compact settings bar**. They are
  settings, not content, and today they are visually heavier than the windows they filter.
- `ScheduleTimeline` (§5) sits above the opportunities.
- Commute opportunities become tickets: `RouteLine`, `TimeStack`, a prominent "time at home"
  figure, and the standby-adjacent caveat as a `Stamp`.
- The full schedule drops from verbose cards to a **dense timetable-style table** with mono times —
  it reads better on a laptop and is more ticket-native. Flight legs nest inside their duty row.
- The below-threshold `<details>` disclosure is kept as-is behaviourally.

**`/pilot/[crewId]/window/[windowId]`** — where the metaphor earns its keep: a ticket being filled
in. The window is the ticket header; outbound and return are two legs; the feasibility verdict is
the stub, with "time at home" printed where a fare would sit. The four existing warning states
(not-viable, long-wait, rest-period, estimates) all become `Callout`s. Commit is the primary
action; the PNR field sits in the stub, where a booking reference belongs.

**`/plans`** — the most literally ticket-shaped screen. Upcoming / Past / Cancelled sections of
tickets, PNR in the stub, `Stamp` for status. Cancelled tickets are desaturated with a struck
treatment; they must remain legible, not hidden.

The shell widens from `max-w-3xl` toward `4xl`–`5xl`, settled in the browser against real content.

### 5. Schedule timeline

Day rows down the page, a 00:00–24:00 axis across. Duty blocks are positioned by Türkiye-local
minutes-of-day; a duty crossing midnight is clipped and continues on the next row. Commute windows
that meet the pilot's threshold render as a tinted band linking to their planner page.

**The view models already carry the data.** `ScheduleDutyView` has `startAt`, `endAt`, `type` and
`rawCode`; `ScheduleWindowView` has the travel window and its id. No view builder changes.

**Two small `src/lib` additions are required, contrary to an earlier draft of this spec.** That
draft claimed `turkeyMinutesOfDay` was an exported helper in `src/lib/time/turkeyTime.ts`. It is
not — it is a private function inside `src/lib/trains/reachability.ts`, and the day-boundary helper
the timeline actually needs, `turkeyMidnight`, is private to `src/lib/trains/searchWindow.ts`. So:

1. Promote **`turkeyMidnight`** into `src/lib/time/turkeyTime.ts` as an exported helper and have
   `searchWindow.ts` import it. Behaviour is identical — the body moves verbatim. Deriving a
   Türkiye-local midnight is exactly the operation CLAUDE.md warns must never be improvised, so the
   timeline must reuse this rather than grow a second copy. `turkeyMinutesOfDay` stays private to
   `reachability.ts`: nothing new consumes it, and moving it would be churn.
2. Add a pure `src/lib/views/timelineLayout.ts` that turns duties and windows into day rows with
   percentage offsets. It is layout arithmetic with real edge cases — midnight crossings,
   multi-day duties — so it belongs in `src/lib` where the existing test suite reaches it, not
   inside a component.

Both stay framework-free and Prisma-free, so `portability.test.ts` passes unchanged. Positioning
goes through the promoted helper and never through `getHours()`.

Duty types are distinguished by tone: flight duty solid, home standby hatched, day off light. It
degrades to a scrollable band at narrow widths rather than reflowing.

### 6. Planner loading state

`/pilot/[crewId]/window/[windowId]` performs a live TCDD fetch on every render and currently shows
nothing at all while it waits. The train-dependent portion moves behind a `<Suspense>` boundary with
a ticket-shaped skeleton, so the window header, warnings and rest note paint immediately.

This is a rendering change only. It must not alter the failure path: a failing live request still
degrades to estimates and never errors the page.

### 7. Behaviour that must not change

These carry hard-won fixes. They are restyled, never rewritten, and their explanatory comments move
with them:

- **`PlanCard`'s `lastSavedTripName` / `lastSavedNotes` refs.** Comparing a blur against the prop
  instead of the ref is a race that silently drops the second edit; fixed in `c101112`.
- **The omit-a-key PATCH contract.** Each field sends only its own key so an in-flight notes save
  cannot clobber a rename.
- **The cancel two-step's button ordering.** "Keep it" deliberately occupies the slot "Cancel plan"
  vacated, so a double-click lands on the harmless choice.
- **`assembleOffWindowView` ignoring cancelled commitments**, and `POST …/commit` clearing
  `cancelledAt` on its update branch.
- **Every existing computation in `src/lib`.** The pipeline — parsing, off-window computation,
  travel windows, reachability, the train providers — is untouched. The only `src/lib` work is
  additive: the two helper promotions and the new `timelineLayout.ts` in §5. Promoting a helper
  must not change its behaviour, which is what the characterisation tests in that task are for.

### 8. File layout

```
src/components/
  chrome/   AppHeader · PageShell · PageHeader · ThemeToggle*
  ui/       Ticket · Perforation · TicketStub · Stamp · Button · Callout ·
            Field · TextInput · TextArea · Select · InlineEdit* · SaveHint · EmptyState
  domain/   TimeStack · RouteLine · SourceNote · TrainPicker* · ScheduleTimeline
```

`*` = client component. Page-specific components (`PlanCard`, `TripPlanner`, the two settings
controls, `HomeCityForm`) stay colocated with their routes and are rebuilt on top of the above.

### 9. Testing and verification

No new test *infrastructure* — but the two `src/lib` additions in §5 are pure logic and do get real
tests, written test-first in the existing `node:test` setup. `turkeyTime.test.ts` is new and, like
`tcddResponse.test.ts`, **must pin `process.env.TZ` to a non-Türkiye zone before its first import
and carry a guard assertion proving the pin took effect** — without it the suite passes vacuously
on a UTC+3 host. The React components get no tests; they are presentational, and the logic they
render is already covered.

Acceptance is:

- `npm test` green — unchanged, including `src/lib/portability.test.ts`, which must still pass
  without adding anything to its `SERVER_ONLY` allowlist.
- `npm run lint` and `npm run build` clean.
- Every screen checked in a browser against a real roster, in **light, dark and auto**, at laptop
  width and again narrow — confirming no layout depends on width to stay usable.
- Contrast measured against the §1 criterion.
- No page regresses to a client component that is a server component today.

### 10. Order of work

Each step leaves the app running.

1. Token layer, `globals.css`, and `layout.tsx` — theme script, font fix, header mount.
2. `ui/` primitives, then `chrome/`, then `domain/`.
3. Screens, simplest first: `/` → `/upload` → `/plans` → `/pilot/[crewId]` → the window page.
4. The three extras: timeline, planner suspense, drop zone.
5. Full verification pass per §9.

## Risks

**Fixing the Arial override changes every text metric in the app.** Geist has different metrics to
Arial, so spacing, line heights and sizes all need retuning as screens are rebuilt. The redesign
therefore cannot be judged against current screenshots — this is the right fix, but it means there
is no pixel baseline to compare against.

**The diff touches all eleven existing `.tsx` files.** Mitigated by the screen-by-screen order
above, so the app is never half-migrated for long, and by §7's list of behaviour that is restyled
rather than rewritten.

**A ticket aesthetic can tip into kitsch.** The guard is the decision already taken: no texture, no
notches, no rotated text. Character comes from type and structure only.

## Out of scope

- Any change to existing `src/lib` behaviour, the PDF parser, the train providers, or the schema.
  (§5's helper promotions move code without changing what it does; `timelineLayout.ts` is new.)
- Authentication, sessions, or any user concept — CrewRest deliberately has none.
- Storing passenger identity. Out of scope by standing decision.
- The actual mobile port. This redesign only guarantees nothing structural blocks it.
- Phases 3–4 of `crew-travel-planner-spec.md`.
