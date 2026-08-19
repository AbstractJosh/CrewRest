# Handoff: Roster Calendar (read-only month view)

## Overview
A read-only month calendar that displays a pilot's roster as day-long / multi-day blocks: **Flight duty**, **Transit to stn**, and **Train ride**. Off days are deliberately empty. Each event renders as one continuous piece across the days it covers, labelled with its type and Türkiye-local time range, sitting on a bold coloured underline. There is no editing, no month navigation, and no summary — it is an information display only.

## About the Design Files
`Roster Calendar v2.dc.html` (+ `support.js`) in this bundle is a **design reference created in HTML** — a prototype showing intended look and behaviour, not production code to copy. The task is to **recreate this design in the target codebase's existing environment** (React, Vue, SwiftUI, native, etc.) using its established patterns, component library and styling approach. If no environment exists yet, pick the most appropriate framework and implement it there.

Open the HTML file in a browser to see the live reference. All styling is inline; layout logic lives in the script at the bottom of the file (`renderVals()`), which is the authoritative source for the geometry described below.

## Fidelity
**High-fidelity.** Colours, type, spacing and block geometry are final. Recreate pixel-closely using the codebase's own primitives. The visual language is the CrewRest design system (warm paper, no pure white/black, Geist + Geist Mono, mono for machine data such as dates and times).

## Screens / Views

### Roster month view (single screen)
**Purpose:** the pilot reads which days are duty / transit / train and at what times; empty cells mean off.

**Layout**
- Page: `min-height: 100vh`, background `#faf9f7`, padding `2.5rem 1.5rem 4rem`.
- Content column: `max-width: 68rem`, centred, vertical flex, `gap: 1.25rem`.
- Header block: title + meta line. No controls.
- Calendar: a `border-top: 1px solid #e3e0da` container holding
  1. a weekday header row — `display: grid; grid-template-columns: repeat(7, minmax(0,1fr))`;
  2. one **week row** per calendar week, each `position: relative` and containing
     - a 7-column grid of day cells (date number only), and
     - an absolutely-positioned **overlay** in which event blocks are placed by percentage.
- Legend row below: one item per event type (bold 6px colour bar + label).

**Weekday header cells**
- Padding `0.5rem 0 0.6rem`; Geist Mono, `0.6rem`, weight 500, uppercase, `letter-spacing: 0.14em`, colour `#b5b1a9`.
- Labels: `MO TU WE TH FR SA SU` (Monday-first default; Sunday-first supported via the `weekStart` prop).

**Day cells**
- Height `4.2rem` desktop / `3rem` narrow (< 700px viewport).
- Padding `0.35rem 0.15rem` desktop, `0.3rem 0.1rem` narrow.
- `border-bottom: 1px solid #ece9e3`; **no** vertical grid lines; background transparent.
- Flex column, contents top-left aligned.
- Date number: Geist Mono, tabular nums, `0.75rem` desktop / `0.7rem` narrow, weight 500, `line-height: 1.1`, colour `#1a1a17` (in-month) or `#8a8780` (adjacent month).
- Adjacent-month cells: `opacity: 0.35`.

**Event blocks (the signature element)**
- Rendered in the week's overlay, absolutely positioned; **not** inside the day cell.
- Overlay: `position: absolute; left: 0; right: 0; pointer-events: none;`
  - `top = max(topPad, (cellH − lanes × blockH) / 2)` where `topPad = 1.15rem` desktop / `1.1rem` narrow, `blockH = 1.55rem` desktop / `0.5rem` narrow — this vertically centres the blocks in the cell.
  - `height = lanes × laneH`, `laneH = 1.8rem` desktop / `0.65rem` narrow.
- Block geometry (percentages of the week row width, one day column = `100 / 7`%):
  - `dayStart = (col − 1) × colW`, `dayEnd = (col − 1 + span) × colW` where `col` is the 1-based weekday index of the block's first day in that week and `span` its day count within the week.
  - True width from times: `(span − 1 + endFrac − startFrac) × colW`, where `startFrac = startHour / 24` (only if the segment is the event's real start) and `endFrac = endHour / 24` (only if it is the real end), else `0` / `1`.
  - Readability floor: `width = max(trueWidth, 10.4%)`, then clamped to `dayEnd − dayStart`.
  - `left = clamp(dayStart, dayStart + (dayEnd − dayStart − width) / 2, 100 − width)` — i.e. the block is **centred within its own day span** and can never bleed into a neighbouring day.
  - `top = lane × laneH` inside the overlay; lanes pack greedily so overlapping events stack.
- Block box: flex row, `align-items: center`, `justify-content: flex-start`, `gap 0.4rem` (`0.3rem` when tight), height `1.55rem` (narrow `0.5rem`), padding `0 0.15rem`, `overflow: hidden`, `line-height: 1.1`, `cursor: default`, `pointer-events: auto`.
- **No fill, no border, no radius** — only `border-bottom: 6px solid <type colour>` (narrow: `5px`). This is the whole visual identity of a block; keep it bold.
- Label (Geist, `0.7rem`, weight 500, `line-height: 1.35`, `white-space: nowrap`, colour `#1a1a17`) then the time (Geist Mono, tabular nums, `0.62rem`, colour `#8a8780`).
- **Week-boundary continuation:** an event crossing Sunday/Monday is split into two segments. The continuation segment is labelled `continues`, italic, colour `#b5b1a9`, and carries no time.
- **Narrow blocks:** when the computed width is < `11.5%`, the label shortens (`Duty` / `Transit` / `Train`) and only the **start** time is shown.
- **Narrow viewport (< 700px):** labels and times are hidden entirely; the block is just the coloured bar.
- `title` attribute (native tooltip) always carries the full record: `"<type> · <start ISO> → <end ISO> · <local range>"`.

**Legend**
- Flex wrap row, `gap: 1.25rem`, padding `0.25rem 0.15rem`.
- Item: `1.25rem × 6px` solid colour bar + label (Geist `0.75rem`, colour `#8a8780`).

**Header copy (exact)**
- Title: `Roster calendar` — Geist `1.5rem`, weight 600, `letter-spacing: -0.02em`, colour `#1a1a17`.
- Meta: `AUGUST 2026 · CREW 41827 · A320` — Geist Mono `0.75rem`, uppercase, `letter-spacing: 0.1em`, colour `#8a8780`. The month/year part is generated from state.

## Interactions & Behavior
- **None by design.** No clicks, no editing, no month navigation. Cells and blocks are non-interactive (`cursor: default`).
- Only affordance: the native `title` tooltip on a block.
- **Responsive:** a resize listener flips a `narrow` flag at `window.innerWidth < 700`, which switches cell height, block height and label visibility as described above. In a real codebase prefer a container query / media query or `ResizeObserver` on the calendar element.
- No hover, loading, error or validation states.

## State Management
Read-only view state:
- `year`, `month` (0-based) — the displayed period. Mock: `2026 / 7` (August 2026).
- `events: [{ id, type: "duty" | "transit" | "train", start: "YYYY-MM-DD", end: "YYYY-MM-DD" }]` — the roster. `start === end` for single-day events. This is the only data the view needs; in production it comes from the roster API.
- `narrow: boolean` — viewport flag (derive from CSS/observer instead if the platform allows).

Per-type time metadata (start/end hour + label + colours) is static config in the prototype. In production, times belong on the event record (`startAt` / `endAt`), and the block geometry should use those instead of the per-type constants.

Derived per render: week rows, per-week segment list (event ∩ week), lane packing, and each segment's left/width/top percentages.

**All data in the prototype is mock.**

## Design Tokens
Colours (CrewRest):
- Paper background `#faf9f7`; ink `#1a1a17`; muted ink `#5c5a54`; faint ink `#8a8780`; extra-faint label `#b5b1a9`
- Rules: header rule `#e3e0da`; cell rule `#ece9e3`
- Event colours (bold, used for the underline + legend): duty `#4d78ac`, transit `#4f9070`, train `#c4635a`
- Softer counterparts kept in config (`soft`): duty `#8fadd0`, transit `#a3cbb2`, train `#e8a79f`

Typography:
- Sans: Geist 400/500/600 — all human-written text
- Mono: Geist Mono 400/500, `font-variant-numeric: tabular-nums` — dates, times, crew/aircraft IDs
- Sizes used: `1.5rem/600` title · `0.75rem` meta · `0.75rem` date number · `0.7rem/500` block label · `0.62rem` block time · `0.6rem` weekday header · `0.75rem` legend

Spacing / geometry:
- Page padding `2.5rem 1.5rem 4rem`; content `max-width: 68rem`; section gap `1.25rem`
- Cell height `4.2rem` / narrow `3rem`; block height `1.55rem` / narrow `0.5rem`; lane height `1.8rem` / narrow `0.65rem`; date reserve `1.15rem`
- Block underline `6px` (narrow `5px`); legend bar `1.25rem × 6px`
- Radii: none on blocks (deliberate); no shadows anywhere

## Assets
None. No images or icons — the only graphics are CSS rules and coloured bars. Fonts are Geist and Geist Mono (Google Fonts in the prototype; use the codebase's existing font loading).

## Files
- `Roster Calendar v2.dc.html` — the design reference (markup + layout logic).
- `support.js` — runtime needed only to open the reference file in a browser. Not part of the design; do not port it.
