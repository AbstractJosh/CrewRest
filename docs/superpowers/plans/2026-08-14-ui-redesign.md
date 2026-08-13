# Ticket-Grammar UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace CrewRest's undesigned, copy-pasted UI with a semantic token layer, a three-state theme, ~20 extracted components, and five rebuilt screens in a train-ticket idiom.

**Architecture:** All colour moves into semantic CSS custom properties exposed to Tailwind 4 via `@theme inline`, so no component ever writes a literal colour or a `dark:` colour variant again. Components live in `src/components/` (never `src/lib/`, which `portability.test.ts` keeps free of `next/*`) and take view-model props, never Prisma models — the property that keeps a future phone client cheap. Two small additive `src/lib` modules carry the only new logic, and they are the only test-driven tasks here.

**Tech Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind 4.3.3 · `node:test` via `tsx`

**Spec:** `docs/superpowers/specs/2026-08-13-ui-redesign-design.md`

## Global Constraints

Every task's requirements implicitly include these.

- **Never** call `getHours()`, `toLocaleString()`, `new Date(y, m, d)`, or `new Date("2026-08-15T07:30:00")` on a zoneless string. All formatting goes through `src/lib/time/turkeyTime.ts` helpers. Turkey is a fixed UTC+3 with no DST.
- Any test asserting on Türkiye-local times **must** set `process.env.TZ` to a non-Türkiye zone before its first import, and **must** carry a guard assertion proving the pin took effect. Without the guard the suite passes vacuously on a UTC+3 host.
- Components live in `src/components/`. Nothing under `src/lib/` may import `next/*`; nothing outside the `SERVER_ONLY` allowlist may import Prisma. `src/lib/portability.test.ts` enforces both and **must pass without being edited**.
- Components take view-model props (`PlanCardView`, `ScheduleWindowView`, …), never Prisma models and never raw rows.
- No component writes a literal colour (`zinc-500`, `#fff`) or a `dark:` variant for colour. Use the semantic tokens.
- Pages that are server components today stay server components. Only `ThemeToggle`, `AppHeader`, `InlineEdit`, `TrainPicker`, `UploadForm`, `PlanCard`, `TripPlanner`, `HomeCityForm`, `MinOffHoursControl` and `TransferBufferControl` carry `"use client"`.
- Body and secondary text must meet WCAG AA (4.5:1) against the surface behind them, in **both** themes. `--ink-faint` is metadata-only and held to 3:1.
- `npm test`, `npm run lint` and `npm run build` must be green at every commit.
- **Do not change these behaviours** (restyle only, and move their explanatory comments with them):
  - `PlanCard`'s `lastSavedTripName` / `lastSavedNotes` refs — the blur race fixed in `c101112`.
  - The omit-a-key PATCH contract: each field sends only its own key.
  - The cancel two-step's button ordering — "Keep it" occupies the slot "Cancel plan" vacated.
  - `assembleOffWindowView` ignoring cancelled commitments.

---

## Task Order and Dependencies

```
1  tokens+theme ──┬─ 3 chrome ──┐
                  ├─ 4 ticket   │
                  ├─ 5 button   ├──> 8 landing ─ 9 upload ─ 11 plans ─ 12 pilot ─ 15 window ─ 16 skeleton ─ 17 verify
                  ├─ 6 forms    │                    ↑                    ↑
                  └─ 7 domain ──┘              10 codes(TDD)      13 midnight(TDD) → 14 timeline(TDD) → mount
```

---

### Task 1: Token layer and three-state theme

**Files:**
- Modify: `src/app/globals.css` (full rewrite — 31 lines today)
- Modify: `src/app/layout.tsx`
- Create: `src/components/chrome/ThemeToggle.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: Tailwind utilities `bg-paper`, `bg-card`, `bg-sunken`, `text-ink`, `text-ink-muted`, `text-ink-faint`, `border-rule`, `border-perf`, `bg-action`, `text-action-ink`, and `{text,bg,border}-{ok,warn,danger}` plus `bg-{ok,warn,danger}-bg`. Also `font-sans` / `font-mono`. Default export `ThemeToggle` from `@/components/chrome/ThemeToggle`.

- [ ] **Step 1: Replace `src/app/globals.css` entirely**

```css
@import "tailwindcss";

/*
 * Tailwind's built-in `dark:` keys off prefers-color-scheme alone, which desynchronises from the
 * tokens below in BOTH directions once a manual override exists: in auto-on-a-dark-OS the tokens
 * go dark but `dark:` never fires, and with light forced on a dark OS the tokens go light while
 * `dark:` still fires. These two rules are the same two rules as the media query and the attribute
 * selector below — EDIT THEM TOGETHER.
 */
@custom-variant dark {
  @media (prefers-color-scheme: dark) {
    &:where(:not([data-theme="light"]) *) { @slot; }
  }
  &:where([data-theme="dark"] *) { @slot; }
}

/* Light — ticket stock. Warm off-white, never pure #fff; ink, never pure black. */
:root {
  --paper: #faf9f7;
  --card: #ffffff;
  --sunken: #f4f2ef;
  --ink: #1a1a17;
  --ink-muted: #5c5a54;
  --ink-faint: #94918a;
  --rule: #e3e0da;
  --perf: #cfcbc3;
  --action: #1a1a17;
  --action-ink: #faf9f7;
  --ok: #1f6f4a;
  --ok-bg: #e8f3ec;
  --warn: #8a5a12;
  --warn-bg: #fbf1de;
  --danger: #9b2c2c;
  --danger-bg: #fbeaea;
}

/*
 * Dark is not light inverted — it is ink on a dark card. The two blocks below are duplicated on
 * purpose: CSS cannot share one declaration block between a media query and an attribute
 * selector. KEEP THEM IDENTICAL.
 */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --paper: #0f0f0e;
    --card: #1a1a18;
    --sunken: #141413;
    --ink: #f2f0eb;
    --ink-muted: #a3a09a;
    --ink-faint: #6e6b65;
    --rule: #2e2d2a;
    --perf: #3d3b37;
    --action: #f2f0eb;
    --action-ink: #1a1a18;
    --ok: #7fcfa4;
    --ok-bg: #14291f;
    --warn: #e8b96a;
    --warn-bg: #2b2216;
    --danger: #f08a8a;
    --danger-bg: #2e1919;
  }
}

:root[data-theme="dark"] {
  --paper: #0f0f0e;
  --card: #1a1a18;
  --sunken: #141413;
  --ink: #f2f0eb;
  --ink-muted: #a3a09a;
  --ink-faint: #6e6b65;
  --rule: #2e2d2a;
  --perf: #3d3b37;
  --action: #f2f0eb;
  --action-ink: #1a1a18;
  --ok: #7fcfa4;
  --ok-bg: #14291f;
  --warn: #e8b96a;
  --warn-bg: #2b2216;
  --danger: #f08a8a;
  --danger-bg: #2e1919;
}

@theme inline {
  --color-paper: var(--paper);
  --color-card: var(--card);
  --color-sunken: var(--sunken);
  --color-ink: var(--ink);
  --color-ink-muted: var(--ink-muted);
  --color-ink-faint: var(--ink-faint);
  --color-rule: var(--rule);
  --color-perf: var(--perf);
  --color-action: var(--action);
  --color-action-ink: var(--action-ink);
  --color-ok: var(--ok);
  --color-ok-bg: var(--ok-bg);
  --color-warn: var(--warn);
  --color-warn-bg: var(--warn-bg);
  --color-danger: var(--danger);
  --color-danger-bg: var(--danger-bg);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

/*
 * `font-family` here previously hardcoded Arial, silently overriding the Geist fonts layout.tsx
 * loads. The app rendered in Arial from the first commit until this change.
 */
body {
  background: var(--paper);
  color: var(--ink);
  font-family: var(--font-sans);
}
```

The starter's `--background` / `--foreground` are deleted, not renamed — nothing referenced them.

- [ ] **Step 2: Create `src/components/chrome/ThemeToggle.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";

export type Theme = "auto" | "light" | "dark";

const STORAGE_KEY = "crewrest-theme";
const ORDER: Theme[] = ["auto", "light", "dark"];

/** "auto" removes the attribute, which is what hands control back to the media query. */
function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "auto") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

const ICONS: Record<Theme, React.ReactNode> = {
  auto: (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 2a6 6 0 000 12z" fill="currentColor" stroke="none" />
    </>
  ),
  light: (
    <>
      <circle cx="8" cy="8" r="3.2" />
      <path d="M8 1v1.6M8 13.4V15M1 8h1.6M13.4 8H15M3 3l1.1 1.1M11.9 11.9L13 13M13 3l-1.1 1.1M4.1 11.9L3 13" />
    </>
  ),
  dark: <path d="M13 9.5A5.5 5.5 0 016.5 3a5.5 5.5 0 108.5 6.5z" />,
};

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("auto");
  // The server cannot know the stored choice, so render the "auto" affordance until mounted —
  // otherwise the first client render disagrees with the HTML and React warns.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "light" || stored === "dark") setTheme(stored);
    } catch {
      // localStorage throws outright in some privacy modes; auto is a fine fallback.
    }
  }, []);

  function cycle() {
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    setTheme(next);
    applyTheme(next);
    try {
      if (next === "auto") localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Preference simply won't persist. The applied theme still took effect.
    }
  }

  const shown = mounted ? theme : "auto";

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`Theme: ${shown}. Click to change.`}
      title={`Theme: ${shown}`}
      className="rounded-md border border-rule p-1.5 text-ink-muted transition-colors hover:border-ink-faint hover:text-ink"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        aria-hidden="true"
      >
        {ICONS[shown]}
      </svg>
    </button>
  );
}
```

- [ ] **Step 3: Add the no-flash script to `src/app/layout.tsx`**

Replace the `RootLayout` function body. Keep the existing font and metadata declarations exactly as they are.

```tsx
/*
 * Must run before first paint, or every load flashes the wrong theme. A plain <script> rather
 * than next/script because this needs to be synchronous and inline. The try/catch is load-bearing:
 * localStorage throws outright in some privacy modes, and an uncaught throw here would take the
 * whole document down.
 */
const THEME_SCRIPT =
  "try{var t=localStorage.getItem('crewrest-theme');" +
  "if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t)}catch(e){}";

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col bg-paper text-ink">{children}</body>
    </html>
  );
}
```

- [ ] **Step 4: Verify the build and the theme**

Run: `npm run lint && npm run build`
Expected: both clean.

Then `npm run dev` and check in a browser:
- Body text renders in **Geist**, not Arial (inspect computed `font-family`).
- Toggle is not yet mounted anywhere — that is Task 3. Confirm only that the build passes and the page background is `--paper` (`#faf9f7`), not white.
- Switch the OS to dark; the background becomes `#0f0f0e`.

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css src/app/layout.tsx src/components/chrome/ThemeToggle.tsx
git commit -m "Add a semantic token layer and three-state theming

globals.css was still the Next starter: --background/--foreground were
referenced by nothing, so every colour in the app was written twice as a
dark: pair. It also set body{font-family:Arial}, which overrode the Geist
fonts layout.tsx loads — the app has rendered in Arial since the first commit.

Tokens are semantic and exposed via @theme inline so a selector can swap
them. Tailwind's dark: variant is redefined in block form because the
built-in one keys off prefers-color-scheme alone, which desynchronises from
the tokens in both directions once a manual override exists."
```

---

### Task 2: Promote `turkeyMidnight` into the time module

Test-driven. This is a pure move — behaviour must not change — and the tests exist to prove that.

**Files:**
- Modify: `src/lib/time/turkeyTime.ts`
- Modify: `src/lib/trains/searchWindow.ts:17-25` (delete the private copy, import instead)
- Create: `src/lib/time/turkeyTime.test.ts`

**Interfaces:**
- Consumes: `TURKEY_UTC_OFFSET_MINUTES` from `@/lib/time/turkeyTime`.
- Produces: `export function turkeyMidnight(date: Date): Date` from `@/lib/time/turkeyTime` — midnight Türkiye-local, as a UTC instant, for the day the given instant falls on. Task 14 depends on this.

- [ ] **Step 1: Write the failing test**

Create `src/lib/time/turkeyTime.test.ts`:

```ts
/**
 * Forced before anything parses a date. Turkey-local derivations are correct by accident on a
 * UTC+3 host, so without a non-Türkiye pin these assertions could pass vacuously.
 */
process.env.TZ = "America/New_York";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { turkeyMidnight } from "@/lib/time/turkeyTime";

describe("turkeyMidnight", () => {
  it("runs with a non-Türkiye host zone, so the assertions below can't pass vacuously", () => {
    assert.notEqual(
      new Date("2026-08-15T07:30:00").toISOString(),
      "2026-08-15T04:30:00.000Z",
      "TZ pin did not take effect — a naive `new Date` parse would match the correct answer here",
    );
  });

  it("returns 21:00Z the previous day, which is Türkiye midnight", () => {
    assert.equal(
      turkeyMidnight(new Date("2026-08-15T10:00:00Z")).toISOString(),
      "2026-08-14T21:00:00.000Z",
    );
  });

  it("is idempotent — midnight of a midnight is the same instant", () => {
    const midnight = turkeyMidnight(new Date("2026-08-15T10:00:00Z"));
    assert.equal(turkeyMidnight(midnight).getTime(), midnight.getTime());
  });

  it("keeps an instant that is late evening UTC on the following Türkiye day", () => {
    // 22:30Z on the 15th is 01:30 on the 16th in Türkiye, so its midnight is the 16th's.
    assert.equal(
      turkeyMidnight(new Date("2026-08-15T22:30:00Z")).toISOString(),
      "2026-08-15T21:00:00.000Z",
    );
  });

  it("does not shift across a month boundary", () => {
    assert.equal(
      turkeyMidnight(new Date("2026-09-01T00:30:00Z")).toISOString(),
      "2026-08-31T21:00:00.000Z",
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --import tsx --test src/lib/time/turkeyTime.test.ts`
Expected: FAIL — `turkeyMidnight` is not exported from `@/lib/time/turkeyTime`.

- [ ] **Step 3: Move the function into `src/lib/time/turkeyTime.ts`**

Append to `src/lib/time/turkeyTime.ts`, copying the body verbatim from `searchWindow.ts`:

```ts
/**
 * Midnight Türkiye-local, as a UTC instant, for the day the given instant falls on.
 *
 * Shifts into UTC first rather than reading local components — the server's zone is not Istanbul,
 * so `getFullYear()` and friends would silently derive the wrong day.
 */
export function turkeyMidnight(date: Date): Date {
  const shifted = new Date(date.getTime() + TURKEY_UTC_OFFSET_MINUTES * 60_000);
  const midnightShiftedMs = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
  );
  return new Date(midnightShiftedMs - TURKEY_UTC_OFFSET_MINUTES * 60_000);
}
```

- [ ] **Step 4: Delete the private copy in `searchWindow.ts` and import instead**

Remove lines 16-25 of `src/lib/trains/searchWindow.ts` (the comment and the `function turkeyMidnight` block), and change the existing import:

```ts
import { TURKEY_UTC_OFFSET_MINUTES, turkeyMidnight } from "@/lib/time/turkeyTime";
```

If `TURKEY_UTC_OFFSET_MINUTES` is left with no remaining references in that file, drop it from the import to keep lint clean.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS — including `src/lib/trains/searchWindow.test.ts`, which is the real proof the move changed nothing.

- [ ] **Step 6: Commit**

```bash
git add src/lib/time/turkeyTime.ts src/lib/time/turkeyTime.test.ts src/lib/trains/searchWindow.ts
git commit -m "Promote turkeyMidnight into the time module

The schedule timeline needs Türkiye-local day boundaries, and deriving one
is exactly the operation that must never be improvised — so it reuses this
rather than growing a second copy. Body moves verbatim; searchWindow's
existing tests are what prove the move changed nothing.

turkeyMinutesOfDay stays private to reachability.ts: nothing new consumes it."
```

---

### Task 3: Page chrome

**Files:**
- Create: `src/components/chrome/PageShell.tsx`
- Create: `src/components/chrome/PageHeader.tsx`
- Create: `src/components/chrome/AppHeader.tsx`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Consumes: `ThemeToggle` (Task 1).
- Produces: default `PageShell({ width?: "default" | "narrow"; children })`; default `PageHeader({ title, meta?, subtitle?, action? })`; default `AppHeader()`.

- [ ] **Step 1: Create `src/components/chrome/PageShell.tsx`**

```tsx
export default function PageShell({
  width = "default",
  children,
}: {
  width?: "default" | "narrow";
  children: React.ReactNode;
}) {
  return (
    <div
      className={`mx-auto w-full px-6 py-10 ${width === "narrow" ? "max-w-xl" : "max-w-4xl"}`}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Create `src/components/chrome/PageHeader.tsx`**

```tsx
export default function PageHeader({
  title,
  meta,
  subtitle,
  action,
}: {
  title: React.ReactNode;
  /** Small mono line under the title — crew ID, aircraft, period. */
  meta?: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {meta && (
          <p className="mt-1 font-mono text-xs uppercase tracking-[0.1em] text-ink-faint">
            {meta}
          </p>
        )}
        {subtitle && <p className="mt-2 text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
```

- [ ] **Step 3: Create `src/components/chrome/AppHeader.tsx`**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "./ThemeToggle";

/**
 * The crew ID is read from the URL rather than passed down. CrewRest has no session and no user
 * concept, so there is nothing to remember — but on a /pilot/... route the ID is right there, and
 * reading it is what lets "Schedule" appear without inventing an identity or drilling a prop
 * through every page.
 */
function crewIdFromPath(pathname: string): string | null {
  const match = /^\/pilot\/([^/]+)/.exec(pathname);
  return match ? match[1] : null;
}

function NavLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`text-sm transition-colors ${
        active ? "font-medium text-ink" : "text-ink-muted hover:text-ink"
      }`}
    >
      {children}
    </Link>
  );
}

export default function AppHeader() {
  const pathname = usePathname() ?? "/";
  const crewId = crewIdFromPath(pathname);

  return (
    <header className="sticky top-0 z-10 border-b border-rule bg-paper/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-4xl items-center gap-6 px-6 py-3">
        <Link
          href="/"
          className="font-mono text-sm font-semibold uppercase tracking-[0.18em] text-ink"
        >
          CrewRest
        </Link>
        <nav className="flex flex-1 items-center gap-5">
          {crewId && (
            <NavLink href={`/pilot/${crewId}`} active={pathname === `/pilot/${crewId}`}>
              Schedule
            </NavLink>
          )}
          <NavLink href="/plans" active={pathname.startsWith("/plans")}>
            Plans
          </NavLink>
          <NavLink href="/upload" active={pathname.startsWith("/upload")}>
            Upload
          </NavLink>
        </nav>
        <ThemeToggle />
      </div>
    </header>
  );
}
```

- [ ] **Step 4: Mount the header in `src/app/layout.tsx`**

Add the import and wrap the children. The `<body>` becomes:

```tsx
<body className="flex min-h-full flex-col bg-paper text-ink">
  <AppHeader />
  <div className="flex flex-1 flex-col">{children}</div>
</body>
```

- [ ] **Step 5: Verify**

Run: `npm run lint && npm run build`
Expected: clean.

In a browser: the header appears on every page; the theme toggle cycles auto → light → dark → auto and **persists across a reload with no flash**; "Schedule" appears only on `/pilot/...` routes; `/` and `/plans` show only Plans and Upload.

- [ ] **Step 6: Commit**

```bash
git add src/components/chrome src/app/layout.tsx
git commit -m "Add shared page chrome

Every page hand-rolled its own navigation — 'Upload new schedule' on the
pilot page, 'Home' on plans, '← Back to schedule' on the window page — and
there was no way to reach /plans from the pilot page at all.

AppHeader reads the crew ID from the URL rather than taking it as a prop:
there is no session to consult, but on a /pilot/... route the ID is already
in the path, so 'Schedule' can appear without inventing an identity."
```

---

### Task 4: Ticket primitives

**Files:**
- Create: `src/components/ui/Ticket.tsx`
- Create: `src/components/ui/Stamp.tsx`

**Interfaces:**
- Produces: named exports `Ticket`, `TicketBody`, `Perforation`, `TicketStub` from `@/components/ui/Ticket`; named export `Stamp` and type `StampTone` from `@/components/ui/Stamp`.

- [ ] **Step 1: Create `src/components/ui/Ticket.tsx`**

```tsx
/**
 * A ticket is the app's one card shape. The perforation is a dashed rule rather than a notched
 * cutout: notches and a vertical tear-off stub are the parts of a real ticket that break at narrow
 * widths, and mobile is a stated direction.
 */
export function Ticket({
  as: Tag = "div",
  muted = false,
  className = "",
  children,
}: {
  as?: "div" | "li" | "article" | "section";
  /** Cancelled plans and other de-emphasised tickets sit on the sunken surface. */
  muted?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Tag
      className={`overflow-hidden rounded-xl border border-rule ${
        muted ? "bg-sunken" : "bg-card"
      } ${className}`}
    >
      {children}
    </Tag>
  );
}

export function TicketBody({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={`p-5 ${className}`}>{children}</div>;
}

export function Perforation() {
  return <div className="border-t border-dashed border-perf" aria-hidden="true" />;
}

export function TicketStub({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={`bg-sunken px-5 py-3 ${className}`}>{children}</div>;
}
```

- [ ] **Step 2: Create `src/components/ui/Stamp.tsx`**

```tsx
export type StampTone = "ok" | "warn" | "danger" | "neutral";

const TONES: Record<StampTone, string> = {
  ok: "border-ok text-ok bg-ok-bg",
  warn: "border-warn text-warn bg-warn-bg",
  danger: "border-danger text-danger bg-danger-bg",
  neutral: "border-rule text-ink-muted bg-sunken",
};

/** Status reads as a stamp — bordered, letterspaced caps — rather than a filled pill. */
export function Stamp({
  tone = "neutral",
  children,
}: {
  tone?: StampTone;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded border px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.12em] ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}
```

- [ ] **Step 3: Verify**

Run: `npm run lint && npm run build`
Expected: clean. Nothing consumes these yet — this task only proves they compile and the token utilities resolve.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/Ticket.tsx src/components/ui/Stamp.tsx
git commit -m "Add ticket and stamp primitives

The card class string was copy-pasted eight times across the UI. The
perforation is a dashed rule, not a notched cutout — notches and a vertical
tear-off stub are exactly what breaks at narrow widths."
```

---

### Task 5: Button, Callout, EmptyState

**Files:**
- Create: `src/components/ui/Button.tsx`
- Create: `src/components/ui/Callout.tsx`
- Create: `src/components/ui/EmptyState.tsx`

**Interfaces:**
- Produces: named exports `Button`, `ButtonLink`, types `ButtonVariant`, `ButtonSize` from `@/components/ui/Button`; named export `Callout` and type `CalloutTone` from `@/components/ui/Callout`; named export `EmptyState` from `@/components/ui/EmptyState`.

- [ ] **Step 1: Create `src/components/ui/Button.tsx`**

```tsx
import Link from "next/link";
import type { ComponentProps } from "react";

export type ButtonVariant = "primary" | "ghost" | "link" | "danger";
export type ButtonSize = "sm" | "md";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "rounded-full bg-action text-action-ink hover:opacity-90 disabled:opacity-50",
  ghost: "rounded-full border border-rule bg-card text-ink hover:bg-sunken disabled:opacity-50",
  link: "text-ink-muted underline underline-offset-4 hover:text-ink disabled:opacity-50",
  danger: "text-danger underline underline-offset-4 hover:opacity-80 disabled:opacity-50",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-5 py-2.5 text-sm",
};

/** `link` and `danger` are inline text actions, so they take no pill padding. */
function classesFor(variant: ButtonVariant, size: ButtonSize, className: string) {
  const base = "inline-flex items-center justify-center font-medium transition-colors";
  const padding = variant === "link" || variant === "danger" ? "text-sm" : SIZES[size];
  return `${base} ${padding} ${VARIANTS[variant]} ${className}`;
}

/** No hooks, so this is importable from server and client components alike. */
export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button {...props} className={classesFor(variant, size, className)} />;
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <Link {...props} className={classesFor(variant, size, className)} />;
}
```

- [ ] **Step 2: Create `src/components/ui/Callout.tsx`**

```tsx
export type CalloutTone = "ok" | "warn" | "danger" | "neutral";

const TONES: Record<CalloutTone, string> = {
  ok: "border-ok bg-ok-bg",
  warn: "border-warn bg-warn-bg",
  danger: "border-danger bg-danger-bg",
  neutral: "border-rule bg-sunken",
};

/**
 * Replaces five hand-rolled coloured boxes: the feasibility panel, the rest-period note, the
 * long-wait warning, the not-viable warning and the estimates footnote.
 */
export function Callout({
  tone = "neutral",
  title,
  children,
}: {
  tone?: CalloutTone;
  title?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${TONES[tone]}`}>
      {title && <p className="font-medium text-ink">{title}</p>}
      {children && <div className={title ? "mt-1 text-ink-muted" : "text-ink-muted"}>{children}</div>}
    </div>
  );
}
```

- [ ] **Step 3: Create `src/components/ui/EmptyState.tsx`**

```tsx
export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-perf bg-card px-5 py-8 text-center text-sm text-ink-muted">
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Verify and commit**

Run: `npm run lint && npm run build`
Expected: clean.

```bash
git add src/components/ui/Button.tsx src/components/ui/Callout.tsx src/components/ui/EmptyState.tsx
git commit -m "Add button, callout and empty-state primitives

Retires four copies of the pill-button class string, eight of the underline
link, and five hand-rolled coloured message boxes. Button and ButtonLink are
separate exports rather than one polymorphic component — simpler types, and
the call sites always know which they want."
```

---

### Task 6: Form controls

**Files:**
- Create: `src/components/ui/Field.tsx`
- Create: `src/components/ui/SaveHint.tsx`
- Create: `src/components/ui/InlineEdit.tsx`

**Interfaces:**
- Produces: named exports `Field`, `TextInput`, `TextArea`, `Select` from `@/components/ui/Field`; named export `SaveHint` and type `SaveState` from `@/components/ui/SaveHint`; named export `InlineEdit` from `@/components/ui/InlineEdit`.

- [ ] **Step 1: Create `src/components/ui/Field.tsx`**

```tsx
import type { ComponentProps } from "react";

/** Shared by every control so they stay visually identical. */
const CONTROL =
  "w-full rounded-md border border-rule bg-card px-3 py-2 text-sm text-ink " +
  "placeholder:text-ink-faint focus:border-ink-muted focus:outline-none";

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-ink-faint">{hint}</p>}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}

export function TextInput({ className = "", ...props }: ComponentProps<"input">) {
  return <input {...props} className={`${CONTROL} ${className}`} />;
}

export function TextArea({ className = "", ...props }: ComponentProps<"textarea">) {
  return <textarea {...props} className={`${CONTROL} ${className}`} />;
}

export function Select({ className = "", ...props }: ComponentProps<"select">) {
  return <select {...props} className={`${CONTROL} ${className}`} />;
}
```

- [ ] **Step 2: Create `src/components/ui/SaveHint.tsx`**

Moved out of `PlanCard`, unchanged in behaviour.

```tsx
export type SaveState = "idle" | "saving" | "saved" | "error";

export function SaveHint({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  const text =
    state === "saving" ? "Saving…" : state === "saved" ? "Saved" : "Could not save";
  return (
    <span className={`text-xs ${state === "error" ? "text-danger" : "text-ink-faint"}`}>
      {text}
    </span>
  );
}
```

- [ ] **Step 3: Create `src/components/ui/InlineEdit.tsx`**

Deliberately dumb: it owns only the borderless-until-hover styling and the Enter-to-blur gesture. The save semantics stay in `PlanCard`, where the `lastSaved*` refs live.

```tsx
"use client";

import type { ComponentProps } from "react";

export function InlineEdit({ className = "", ...props }: ComponentProps<"input">) {
  return (
    <input
      {...props}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        props.onKeyDown?.(event);
      }}
      className={`w-full truncate rounded border border-transparent bg-transparent px-1 py-0.5 font-medium text-ink hover:border-rule focus:border-ink-faint focus:outline-none ${className}`}
    />
  );
}
```

- [ ] **Step 4: Verify and commit**

Run: `npm run lint && npm run build`
Expected: clean.

```bash
git add src/components/ui/Field.tsx src/components/ui/SaveHint.tsx src/components/ui/InlineEdit.tsx
git commit -m "Add form controls, save hint and inline edit

Retires five copies of the input class string. InlineEdit owns only the
styling and the Enter-to-blur gesture — the save semantics stay in PlanCard,
where the lastSaved* refs that fix the blur race live."
```

---

### Task 7: Domain display components

**Files:**
- Create: `src/components/domain/TimeStack.tsx`
- Create: `src/components/domain/RouteLine.tsx`
- Create: `src/components/domain/SourceNote.tsx`

**Interfaces:**
- Consumes: `formatTurkeyDateTime`, `formatTurkeyRange`, `formatUtcRange`, `formatUtcTime` from `@/lib/time/turkeyTime`.
- Produces: default `TimeStack({ at, to?, size? })`; default `RouteLine({ from, to, middle? })`; default `SourceNote({ hasEstimates })`.

- [ ] **Step 1: Create `src/components/domain/TimeStack.tsx`**

```tsx
import {
  formatTurkeyDateTime,
  formatTurkeyRange,
  formatUtcRange,
  formatUtcTime,
} from "@/lib/time/turkeyTime";

const SIZES = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-xl",
} as const;

/**
 * Türkiye-local prominent, GMT faint beneath. This pairing was hand-written in six places and is
 * a standing project rule — one component makes it structural rather than remembered, and routes
 * every instance through the turkeyTime helpers so no caller touches a Date method directly.
 */
export default function TimeStack({
  at,
  to,
  size = "md",
}: {
  at: Date;
  /** Supply for a range; omit for a single instant. */
  to?: Date;
  size?: keyof typeof SIZES;
}) {
  const local = to ? formatTurkeyRange(at, to) : formatTurkeyDateTime(at);
  const utc = to ? formatUtcRange(at, to) : formatUtcTime(at);

  return (
    <span className="block">
      <span className={`block font-mono tabular-nums text-ink ${SIZES[size]}`}>{local}</span>
      <span className="mt-0.5 block font-mono text-xs tabular-nums text-ink-faint">
        {utc} GMT
      </span>
    </span>
  );
}
```

- [ ] **Step 2: Create `src/components/domain/RouteLine.tsx`**

```tsx
/**
 * The signature element: `IST ●────────● ESK`. Codes are shown as-is in caps — callers pass
 * station codes, not city names, so the line stays short enough to survive a narrow column.
 */
export default function RouteLine({
  from,
  to,
  middle,
}: {
  from: string;
  to: string;
  /** Optional centred label, e.g. the journey duration. */
  middle?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="font-mono text-sm font-semibold uppercase tracking-[0.14em] text-ink">
        {from}
      </span>
      <span className="flex flex-1 items-center gap-1.5">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ink-muted" aria-hidden="true" />
        <span className="h-px flex-1 bg-rule" aria-hidden="true" />
        {middle && <span className="font-mono text-xs text-ink-faint">{middle}</span>}
        <span className="h-px flex-1 bg-rule" aria-hidden="true" />
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ink-muted" aria-hidden="true" />
      </span>
      <span className="font-mono text-sm font-semibold uppercase tracking-[0.14em] text-ink">
        {to}
      </span>
    </div>
  );
}
```

- [ ] **Step 3: Create `src/components/domain/SourceNote.tsx`**

```tsx
/**
 * Copy is driven by whether anything shown is estimated, never hardcoded — a failing live request
 * is this integration's documented steady state, and estimates and live data can mix when one
 * direction answers and the other falls back.
 */
export default function SourceNote({ hasEstimates }: { hasEstimates: boolean }) {
  return (
    <p className="text-xs text-ink-faint">
      {hasEstimates
        ? "Some times shown are approximate planning estimates, not a live feed — confirm exact times and book on ebilet.tcddtasimacilik.gov.tr."
        : "Live TCDD times and fares. Seat availability can change between loading this page and paying."}
    </p>
  );
}
```

- [ ] **Step 4: Verify and commit**

Run: `npm run lint && npm run build`
Expected: clean.

```bash
git add src/components/domain
git commit -m "Add TimeStack, RouteLine and SourceNote

TimeStack is the highest-value extraction here: showing Türkiye local time
with GMT underneath is a standing project rule that was hand-written in six
places. One component makes it structural, and routes every instance through
the turkeyTime helpers so no caller touches a Date method directly."
```

---

### Task 8: Landing page

**Files:**
- Modify: `src/app/page.tsx` (full rewrite — 53 lines today)

**Interfaces:**
- Consumes: `PageShell` (Task 3), `Ticket`/`TicketBody` (Task 4).
- Produces: nothing.

- [ ] **Step 1: Rewrite `src/app/page.tsx`**

```tsx
import Link from "next/link";
import PageShell from "@/components/chrome/PageShell";
import { Ticket, TicketBody } from "@/components/ui/Ticket";

/**
 * Deliberately static and database-free: it names the two things CrewRest does and gets out of
 * the way. Adding a plan count here would make the first paint wait on a query.
 */
const ENTRIES = [
  {
    href: "/upload",
    title: "Plan from schedule",
    body: "Upload your monthly roster PDF and see which off-periods are long enough to travel home.",
  },
  {
    href: "/plans",
    title: "My plans",
    body: "The trips you've committed to, with their trains, tickets and notes.",
  },
];

export default function Home() {
  return (
    <PageShell width="narrow">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">CrewRest</h1>
      <p className="mt-2 text-ink-muted">
        Find the gaps between your duties that are long enough to be worth a train trip home, and
        keep track of the ones you commit to.
      </p>

      <div className="mt-8 flex flex-col gap-3">
        {ENTRIES.map((entry) => (
          <Link key={entry.href} href={entry.href} className="group block">
            <Ticket className="transition-colors group-hover:border-ink-faint">
              <TicketBody>
                <span className="font-mono text-sm font-semibold uppercase tracking-[0.14em] text-ink">
                  {entry.title} →
                </span>
                <span className="mt-2 block text-sm text-ink-muted">{entry.body}</span>
              </TicketBody>
            </Ticket>
          </Link>
        ))}
      </div>

      <p className="mt-6 text-xs text-ink-faint">
        No account needed — after upload you&apos;ll get a link keyed to your crew ID that you can
        come back to.
      </p>
    </PageShell>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npm run lint && npm run build`
Expected: clean.

In a browser at `/`: two ticket cards, header above them, hover lightens the border, and the page reads correctly in light, dark **and** auto. Narrow the window to ~380px — the cards stack and nothing overflows horizontally.

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "Rebuild the landing page on the ticket primitives"
```

---

### Task 9: Upload page and drop zone

**Files:**
- Modify: `src/app/upload/page.tsx` (becomes a thin server component)
- Create: `src/app/upload/UploadForm.tsx` (client — the current page's logic plus drag-and-drop)

**Interfaces:**
- Consumes: `PageShell`, `Button`, `Callout`.
- Produces: default `UploadForm()`.

- [ ] **Step 1: Create `src/app/upload/UploadForm.tsx`**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function UploadForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function accept(candidate: File | undefined) {
    if (!candidate) return;
    if (!candidate.name.toLowerCase().endsWith(".pdf")) {
      setError("That isn't a PDF. Choose your roster PDF.");
      return;
    }
    setError(null);
    setFile(candidate);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError("Choose a schedule PDF first.");
      return;
    }

    setIsUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Upload failed.");
        return;
      }
      router.push(`/pilot/${data.crewId}`);
    } catch {
      setError("Upload failed. Check your connection and try again.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          accept(event.dataTransfer.files[0]);
        }}
        onClick={() => fileInputRef.current?.click()}
        className={`cursor-pointer rounded-xl border border-dashed px-5 py-10 text-center transition-colors ${
          isDragging ? "border-ink-faint bg-sunken" : "border-perf bg-card"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(event) => accept(event.target.files?.[0])}
        />
        {file ? (
          <>
            <p className="font-mono text-sm text-ink">{file.name}</p>
            <p className="mt-1 text-xs text-ink-faint">
              {formatSize(file.size)} · click to choose a different file
            </p>
          </>
        ) : (
          <>
            <p className="text-sm text-ink">Drop your roster PDF here</p>
            <p className="mt-1 text-xs text-ink-faint">or click to browse</p>
          </>
        )}
      </div>

      {error && <Callout tone="danger">{error}</Callout>}

      <Button type="submit" disabled={isUploading || !file} className="self-start">
        {isUploading ? "Reading schedule…" : "Upload schedule"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: Rewrite `src/app/upload/page.tsx` as a server component**

```tsx
import PageShell from "@/components/chrome/PageShell";
import UploadForm from "./UploadForm";

export default function UploadPage() {
  return (
    <PageShell width="narrow">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Upload a roster</h1>
      <p className="mt-2 text-ink-muted">
        CrewRest finds the gaps between your duties that are long enough to be worth a train trip
        home, and helps you decide whether to commit to the commute.
      </p>

      <UploadForm />

      <p className="mt-6 text-xs text-ink-faint">
        No account needed — after upload you&apos;ll get a link keyed to your crew ID that you can
        come back to.
      </p>
    </PageShell>
  );
}
```

Note this is a net improvement: the page was a client component in its entirety and is now a server component wrapping one client island.

- [ ] **Step 3: Verify**

Run: `npm run lint && npm run build`
Expected: clean.

In a browser at `/upload`: dragging a PDF over the zone highlights it; dropping shows the filename and size; dropping a non-PDF shows the error callout; the submit button is disabled until a file is chosen. **Upload a real roster and confirm the redirect to `/pilot/<crewId>` still works.**

- [ ] **Step 4: Commit**

```bash
git add src/app/upload
git commit -m "Rebuild the upload page with a drop zone

The page was a client component in its entirety; it is now a server
component wrapping one client island. The bare file input becomes a drop
zone that reports the chosen filename and size, and rejects non-PDFs before
the request is made."
```

---

### Task 10: Add station codes to `PlanCardView`

Test-driven, against the existing `plansView.test.ts`.

`PlanCardView` currently exposes `originLabel` / `destinationLabel` (resolved city names). `RouteLine` needs the short codes, which `assemblePlansView` already has in hand from `commitment.outboundTrain.originCode`.

**Files:**
- Modify: `src/lib/views/plansView.ts`
- Modify: `src/lib/views/plansView.test.ts`

**Interfaces:**
- Produces: `PlanCardView.originCode: string` and `PlanCardView.destinationCode: string`. Task 11 depends on these.

- [ ] **Step 1: Add a failing test to `src/lib/views/plansView.test.ts`**

Add inside the existing describe block for the card assembly. Reuse whatever fixture builder the file already defines rather than inventing a new one; if it builds a commitment inline, follow that shape.

```ts
it("exposes the raw station codes alongside the resolved labels", () => {
  const view = assemblePlansView({
    now: new Date("2026-08-01T00:00:00Z"),
    stationNames: { IST: "Istanbul", ESK: "Eskişehir" },
    commitments: [buildCommitment()],
  });

  const card = view.upcoming[0] ?? view.past[0];
  assert.equal(card.originCode, "IST");
  assert.equal(card.destinationCode, "ESK");
  // The labels must keep working — the codes are additive.
  assert.equal(card.originLabel, "Istanbul");
  assert.equal(card.destinationLabel, "Eskişehir");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --import tsx --test src/lib/views/plansView.test.ts`
Expected: FAIL — `originCode` is `undefined`.

- [ ] **Step 3: Add the two fields**

In `src/lib/views/plansView.ts`, add to the `PlanCardView` interface:

```ts
  /** Raw station codes, for the route line. `originLabel`/`destinationLabel` are these resolved. */
  originCode: string;
  destinationCode: string;
```

and to the object built in the card assembler, beside the existing label lines:

```ts
    originCode: commitment.outboundTrain.originCode,
    destinationCode: commitment.outboundTrain.destinationCode,
```

- [ ] **Step 4: Run the suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/views/plansView.ts src/lib/views/plansView.test.ts
git commit -m "Expose station codes on PlanCardView

The route line shows short codes; the view resolved them to city names and
discarded the codes. Additive — the labels are unchanged."
```

---

### Task 11: Plans page

**Files:**
- Modify: `src/app/plans/PlanCard.tsx` (restyle only — behaviour frozen)
- Modify: `src/app/plans/page.tsx`

**Interfaces:**
- Consumes: `PlanCardView` with `originCode`/`destinationCode` (Task 10), `Ticket`/`TicketBody`/`Perforation`/`TicketStub`, `Stamp`, `Button`, `TextArea`, `SaveHint`/`SaveState`, `InlineEdit`, `TimeStack`, `RouteLine`, `EmptyState`, `PageShell`, `PageHeader`.

- [ ] **Step 1: Restyle `PlanCard.tsx`**

Keep **every** piece of logic exactly as it is: the two `useRef`s and their comment, the `patch` helper and its comment, the per-field `onBlur` comparisons against the refs, the `confirmingCancel` two-step with its button-ordering comment, and the independent `nameState` / `notesState` / `actionState`. Delete the local `SaveHint` and `SaveState` definitions and import them instead.

Changes to make:

```tsx
// Replace the local SaveState type and SaveHint function with:
import { SaveHint, type SaveState } from "@/components/ui/SaveHint";
import { InlineEdit } from "@/components/ui/InlineEdit";
import { TextArea } from "@/components/ui/Field";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Stamp } from "@/components/ui/Stamp";
import { Ticket, TicketBody, Perforation, TicketStub } from "@/components/ui/Ticket";
import TimeStack from "@/components/domain/TimeStack";
import RouteLine from "@/components/domain/RouteLine";
```

The returned JSX becomes (logic references unchanged):

```tsx
  return (
    <Ticket as="li" muted={plan.isCancelled}>
      <TicketBody className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <InlineEdit
              value={tripName}
              onChange={(e) => {
                setTripName(e.target.value);
                setNameState("idle");
              }}
              onBlur={() => {
                const trimmed = tripName.trim();
                if (trimmed === lastSavedTripName.current) return;
                patch({ tripName }, setNameState, () => {
                  lastSavedTripName.current = trimmed;
                });
              }}
              placeholder={plan.title}
              aria-label="Trip name"
            />
            <p className="mt-1 px-1 text-sm text-ink-muted">
              {plan.originLabel} ⇄ {plan.destinationLabel}
              {showPilot && ` · ${plan.pilotName} (${plan.crewId})`}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            {plan.isCancelled ? (
              <Stamp tone="neutral">Cancelled</Stamp>
            ) : plan.isTicketed ? (
              <Stamp tone="ok">Ticketed</Stamp>
            ) : (
              <Stamp tone="neutral">Planned</Stamp>
            )}
            <SaveHint state={nameState} />
          </div>
        </div>

        <RouteLine from={plan.originCode} to={plan.destinationCode} />

        <div className="flex flex-wrap justify-between gap-4">
          <div>
            <p className="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-ink-faint">
              Out
            </p>
            <TimeStack at={plan.departureAt} size="sm" />
          </div>
          <div>
            <p className="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-ink-faint">
              Back
            </p>
            <TimeStack at={plan.returnArrivalAt} size="sm" />
          </div>
        </div>

        {plan.notes || notesOpen ? (
          <div>
            <TextArea
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                setNotesState("idle");
              }}
              onBlur={() => {
                const trimmed = notes.trim();
                if (trimmed === lastSavedNotes.current) return;
                patch({ notes }, setNotesState, () => {
                  lastSavedNotes.current = trimmed;
                });
              }}
              rows={notesExpanded ? 8 : 3}
              placeholder="Anything worth remembering about this trip — who you're meeting, what to confirm before you travel."
              aria-label="Trip notes"
            />
            <div className="mt-1 flex items-center gap-3">
              {notes.split("\n").length > 3 && (
                <Button
                  type="button"
                  variant="link"
                  onClick={() => setNotesExpanded((v) => !v)}
                  className="text-xs"
                >
                  {notesExpanded ? "Show less" : "Show more"}
                </Button>
              )}
              <SaveHint state={notesState} />
            </div>
          </div>
        ) : (
          <Button
            type="button"
            variant="link"
            onClick={() => setNotesOpen(true)}
            className="self-start"
          >
            Add notes
          </Button>
        )}

        {plan.hasEstimates && (
          <p className="text-xs text-warn">
            Saved from the curated timetable, not a live feed — confirm on ebilet before travelling.
          </p>
        )}
      </TicketBody>

      <Perforation />

      <TicketStub className="flex flex-wrap items-center gap-4">
        <ButtonLink href={plan.href} variant="link">
          Open planner
        </ButtonLink>

        {plan.isCancelled ? (
          <Button type="button" variant="link" onClick={() => patch({ cancelled: false }, setActionState)}>
            Restore
          </Button>
        ) : confirmingCancel ? (
          <>
            {/*
              "Keep it" renders first, in the slot "Cancel plan" occupied — the harmless choice
              lands under a double-click, which is exactly the gesture the two-step guard exists
              to survive. "Confirm cancel" moves one slot over so a double-click can't land on it.
            */}
            <Button type="button" variant="link" onClick={() => setConfirmingCancel(false)}>
              Keep it
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => {
                setConfirmingCancel(false);
                patch({ cancelled: true }, setActionState);
              }}
            >
              Confirm cancel
            </Button>
          </>
        ) : (
          <Button type="button" variant="link" onClick={() => setConfirmingCancel(true)}>
            Cancel plan
          </Button>
        )}

        {plan.bookingReference && (
          <span className="font-mono text-xs text-ink-faint">PNR {plan.bookingReference}</span>
        )}

        <SaveHint state={actionState} />
      </TicketStub>
    </Ticket>
  );
```

Note the `onKeyDown` Enter-to-blur that was on the trip-name input now lives inside `InlineEdit`; do not duplicate it here.

- [ ] **Step 2: Restyle `src/app/plans/page.tsx`**

Keep `export const dynamic = "force-dynamic"` **and its comment** — without it Next prerenders the page and hits SQLite during `next build`.

```tsx
import { buildPlansView, type PlanCardView } from "@/lib/views/plansView";
import PageShell from "@/components/chrome/PageShell";
import PageHeader from "@/components/chrome/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { ButtonLink } from "@/components/ui/Button";
import PlanCard from "./PlanCard";

/**
 * This page reads the database and has no dynamic params, so without this Next would try to
 * prerender it at build time — which means querying SQLite during `next build`.
 */
export const dynamic = "force-dynamic";

function Section({
  title,
  plans,
  showPilot,
}: {
  title: string;
  plans: PlanCardView[];
  showPilot: boolean;
}) {
  if (plans.length === 0) return null;
  return (
    <section className="mt-10">
      <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
        {title} <span className="text-ink-faint">({plans.length})</span>
      </h2>
      <ul className="mt-4 flex flex-col gap-4">
        {plans.map((plan) => (
          <PlanCard key={plan.windowId} plan={plan} showPilot={showPilot} />
        ))}
      </ul>
    </section>
  );
}

export default async function PlansPage() {
  const view = await buildPlansView(new Date());

  return (
    <PageShell>
      <PageHeader
        title="My plans"
        subtitle="Trains as they were when you committed — Türkiye local time, GMT underneath."
      />

      {view.totalCount === 0 ? (
        <div className="mt-10">
          <EmptyState>
            No plans yet. <ButtonLink href="/upload" variant="link">Upload a schedule</ButtonLink> and
            commit to a trip to see it here.
          </EmptyState>
        </div>
      ) : (
        <>
          <Section title="Upcoming" plans={view.upcoming} showPilot={view.showPilot} />
          <Section title="Past" plans={view.past} showPilot={view.showPilot} />
          <Section title="Cancelled" plans={view.cancelled} showPilot={view.showPilot} />
        </>
      )}
    </PageShell>
  );
}
```

The page's own "Home" link is dropped — `AppHeader` provides navigation now.

- [ ] **Step 3: Verify behaviour is unchanged**

Run: `npm run lint && npm run build && npm test`
Expected: all clean.

In a browser at `/plans`, with at least one commitment:
- Rename a trip, blur, confirm "Saved", reload, confirm it stuck.
- Type a name, blur, then immediately edit again and blur before the refresh lands — the second edit must also save. This is the `c101112` race.
- Edit notes and the name in quick succession — neither clobbers the other.
- Click "Cancel plan" then double-click — the double-click must land on "Keep it", not confirm.
- Cancel a plan, confirm it moves to the Cancelled section and reads as muted but legible; restore it.

- [ ] **Step 4: Commit**

```bash
git add src/app/plans
git commit -m "Rebuild the plans page as tickets

Restyle only — the save semantics are untouched: the lastSaved* refs that
fix the c101112 blur race, the omit-a-key PATCH contract, and the cancel
two-step's deliberate button ordering all move across verbatim, comments
included. SaveHint moves to the shared components."
```

---

### Task 12: Pilot schedule page

**Files:**
- Modify: `src/app/pilot/[crewId]/page.tsx`
- Modify: `src/app/pilot/[crewId]/MinOffHoursControl.tsx`
- Modify: `src/app/pilot/[crewId]/TransferBufferControl.tsx`

**Interfaces:**
- Consumes: `PilotScheduleView` (`shownWindows`, `hiddenWindows`, `dutyPeriods`, `minOffHours`, `airportTransferMinutes`, `hasSchedule`, `name`, `crewId`, `aircraftType`, `period`), and the Task 3–7 components.

- [ ] **Step 1: Restyle the two settings controls**

Both keep their save logic exactly. Compact them: drop the surrounding card, use `Field` + the shared controls, and shorten the helper copy so they read as a settings bar rather than content. For `MinOffHoursControl` the outer wrapper becomes:

```tsx
  return (
    <Field
      label={
        <>
          Minimum off-period <span className="font-mono tabular-nums">{value}</span>h
        </>
      }
      htmlFor="min-off-hours"
      hint="How long a gap must be before it's worth suggesting a trip home."
    >
      <div className="flex items-center gap-3">
        <input
          id="min-off-hours"
          type="range"
          min={1}
          max={96}
          step={1}
          value={Math.min(value, 96)}
          onChange={(e) => setValue(Number(e.target.value))}
          onMouseUp={() => save(value)}
          onTouchEnd={() => save(value)}
          onKeyUp={() => save(value)}
          className="w-full accent-ink"
          disabled={isSaving}
        />
        <TextInput
          type="number"
          min={1}
          max={240}
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          onBlur={() => save(value)}
          className="w-16 shrink-0"
          disabled={isSaving}
        />
      </div>
    </Field>
  );
```

For `TransferBufferControl`, keep `OPTIONS`, `label()`, `save()` and the `choices` derivation with its comment exactly — note it saves on **change**, not on blur, and that `choices` exists because a value restored from the database may not be one of the presets:

```tsx
  return (
    <Field
      label="Airport ↔ station transfer"
      htmlFor="transfer-buffer"
      hint="Added after duty release before you can travel, and required again before report time on the way back."
    >
      <Select
        id="transfer-buffer"
        value={value}
        onChange={(e) => save(Number(e.target.value))}
        disabled={isSaving}
        className="font-mono tabular-nums"
      >
        {choices.map((minutes) => (
          <option key={minutes} value={minutes}>
            {label(minutes)}
          </option>
        ))}
      </Select>
    </Field>
  );
```

Both controls import `Field`, `TextInput` and `Select` from `@/components/ui/Field`.

- [ ] **Step 2: Rewrite the page's two card components**

In `src/app/pilot/[crewId]/page.tsx`, replace `OffWindowCard` and `DutyPeriodCard`:

```tsx
function OffWindowTicket({
  crewId,
  window,
  transferMinutes,
}: {
  crewId: string;
  window: ScheduleWindowView;
  transferMinutes: number;
}) {
  const { travel } = window;
  return (
    <Ticket as="li">
      <TicketBody className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <TimeStack at={travel.startAt} to={travel.endAt} />
          {!window.travelEligible && <Stamp tone="warn">Adjacent to standby</Stamp>}
        </div>
        <p className="font-mono text-sm text-ink-muted">
          {formatDurationMinutes(travel.minutes)} to travel
        </p>
      </TicketBody>
      <Perforation />
      <TicketStub className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-ink-faint">
          Duty ends {formatTurkeyDateTime(window.dutyEndsAt)} ·{" "}
          {formatDurationMinutes(transferMinutes)} to reach the station
        </p>
        <ButtonLink href={`/pilot/${crewId}/window/${window.id}`} size="sm">
          Plan trip
        </ButtonLink>
      </TicketStub>
    </Ticket>
  );
}

/** The schedule reads as a printed timetable: one dense row per duty, mono times. */
function DutyRow({ duty }: { duty: ScheduleDutyView }) {
  return (
    <li className="border-b border-rule py-3 last:border-b-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="font-mono text-sm tabular-nums text-ink">
          {formatTurkeyRange(duty.startAt, duty.endAt)}
        </span>
        <span className="text-xs text-ink-muted">
          {DUTY_TYPE_LABEL[duty.type] ?? duty.type} ·{" "}
          <span className="font-mono">{duty.rawCode}</span>
        </span>
      </div>
      <p className="mt-0.5 font-mono text-xs tabular-nums text-ink-faint">
        {formatUtcRange(duty.startAt, duty.endAt)} GMT
      </p>

      {duty.flightLegs.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {duty.flightLegs.map((leg, i) => (
            <li key={i} className="font-mono text-xs tabular-nums text-ink-muted">
              {leg.flightNumber} {leg.origin}/{leg.departureTime} → {leg.destination}/
              {leg.arrivalTime}
              {leg.departureTimeUtc && leg.arrivalTimeUtc && (
                <span className="ml-2 text-ink-faint">
                  ({leg.departureTimeUtc} → {leg.arrivalTimeUtc} GMT)
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
```

- [ ] **Step 3: Rewrite the page body**

Keep `DUTY_TYPE_LABEL`, `buildPilotScheduleView` and `notFound()` exactly. Replace the returned JSX:

```tsx
  return (
    <PageShell>
      <PageHeader
        title={view.name}
        meta={[`Crew ${view.crewId}`, view.aircraftType, view.period]
          .filter(Boolean)
          .join(" · ")}
      />

      {!view.hasSchedule ? (
        <div className="mt-10">
          <EmptyState>No schedule uploaded yet.</EmptyState>
        </div>
      ) : (
        <>
          <section className="mt-10">
            <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
              Commute opportunities
            </h2>
            <p className="mt-2 text-sm text-ink-muted">
              Windows run from when you can actually be moving — duty release plus your transfer
              time — to your next report time. Türkiye local; GMT underneath.
            </p>

            <div className="mt-4 grid grid-cols-1 gap-4 rounded-lg border border-rule bg-sunken p-4 sm:grid-cols-2">
              <MinOffHoursControl crewId={crewId} initialMinOffHours={view.minOffHours} />
              <TransferBufferControl
                crewId={crewId}
                initialMinutes={view.airportTransferMinutes}
              />
            </div>

            {shownWindows.length === 0 ? (
              <div className="mt-4">
                <EmptyState>
                  No off-periods meet your {view.minOffHours}h threshold this period.
                </EmptyState>
              </div>
            ) : (
              <ul className="mt-4 flex flex-col gap-4">
                {shownWindows.map((window) => (
                  <OffWindowTicket
                    key={window.id}
                    crewId={crewId}
                    window={window}
                    transferMinutes={view.airportTransferMinutes}
                  />
                ))}
              </ul>
            )}

            {hiddenWindows.length > 0 && (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm text-ink-muted hover:text-ink">
                  {hiddenWindows.length} shorter break
                  {hiddenWindows.length === 1 ? "" : "s"} below your threshold
                </summary>
                <ul className="mt-3 flex flex-col gap-4">
                  {hiddenWindows.map((window) => (
                    <OffWindowTicket
                      key={window.id}
                      crewId={crewId}
                      window={window}
                      transferMinutes={view.airportTransferMinutes}
                    />
                  ))}
                </ul>
              </details>
            )}
          </section>

          <section className="mt-12">
            <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
              Full schedule
            </h2>
            <p className="mt-2 text-sm text-ink-muted">
              Duty spans run report → release, in Türkiye local time. Flight legs are local at each
              station.
            </p>
            <ul className="mt-4 rounded-xl border border-rule bg-card px-5">
              {view.dutyPeriods.map((duty) => (
                <DutyRow key={duty.id} duty={duty} />
              ))}
            </ul>
          </section>
        </>
      )}
    </PageShell>
  );
```

The page's own "Upload new schedule" link is dropped — `AppHeader` provides it.

- [ ] **Step 4: Verify**

Run: `npm run lint && npm run build && npm test`
Expected: clean.

In a browser at `/pilot/<crewId>` with a real roster: windows render as tickets; the settings bar reads as settings rather than content; changing either setting still updates the list **without re-uploading**; the duty table is dense and legible; the below-threshold disclosure still works.

- [ ] **Step 5: Commit**

```bash
git add src/app/pilot/\[crewId\]/page.tsx src/app/pilot/\[crewId\]/MinOffHoursControl.tsx src/app/pilot/\[crewId\]/TransferBufferControl.tsx
git commit -m "Rebuild the pilot schedule page

Windows become tickets; the two settings controls shrink from full cards
into a settings bar, since they were visually outweighing the windows they
filter; the verbose duty cards become a dense timetable. Both settings are
still applied at read time — changing either must never require a re-upload."
```

---

### Task 13: Timeline layout arithmetic

Test-driven. Pure, framework-free, Prisma-free — it lives in `src/lib` so the existing suite reaches it.

**Files:**
- Create: `src/lib/views/timelineLayout.ts`
- Create: `src/lib/views/timelineLayout.test.ts`

**Interfaces:**
- Consumes: `turkeyMidnight` (Task 2), `formatTurkeyDateLabel` from `@/lib/time/turkeyTime`.
- Produces:

```ts
export interface TimelineBlock {
  id: string;
  kind: "duty" | "window";
  /** Duty type (FLIGHT/HSBY/DAYOFF) for duties; "window" for windows. */
  type: string;
  label: string;
  /** 0–100, percent across the day from Türkiye-local midnight. */
  startPercent: number;
  endPercent: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
  href?: string;
}

export interface TimelineDay {
  /** Türkiye-local midnight for this row, as a UTC instant. */
  date: Date;
  label: string;
  blocks: TimelineBlock[];
}

export function buildTimeline(input: TimelineInput): TimelineDay[];
```

- [ ] **Step 1: Write the failing test**

Create `src/lib/views/timelineLayout.test.ts`:

```ts
/** Türkiye-local day boundaries are correct by accident on a UTC+3 host. Pin a different zone. */
process.env.TZ = "America/New_York";

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTimeline } from "@/lib/views/timelineLayout";

describe("buildTimeline", () => {
  it("runs with a non-Türkiye host zone, so the assertions below can't pass vacuously", () => {
    assert.notEqual(
      new Date("2026-08-15T07:30:00").toISOString(),
      "2026-08-15T04:30:00.000Z",
      "TZ pin did not take effect",
    );
  });

  it("places a duty inside one day as percentages of that day", () => {
    // 06:00 → 12:00 Türkiye local on 15 Aug = 03:00Z → 09:00Z.
    const days = buildTimeline({
      duties: [
        {
          id: "d1",
          startAt: new Date("2026-08-15T03:00:00Z"),
          endAt: new Date("2026-08-15T09:00:00Z"),
          type: "FLIGHT",
          label: "TK1",
        },
      ],
      windows: [],
    });

    assert.equal(days.length, 1);
    assert.equal(days[0].blocks.length, 1);
    assert.equal(days[0].blocks[0].startPercent, 25);
    assert.equal(days[0].blocks[0].endPercent, 50);
    assert.equal(days[0].blocks[0].continuesBefore, false);
    assert.equal(days[0].blocks[0].continuesAfter, false);
  });

  it("splits a duty that crosses Türkiye midnight into two rows", () => {
    // 18:00 on 15 Aug → 06:00 on 16 Aug, local = 15:00Z → 03:00Z.
    const days = buildTimeline({
      duties: [
        {
          id: "d1",
          startAt: new Date("2026-08-15T15:00:00Z"),
          endAt: new Date("2026-08-16T03:00:00Z"),
          type: "FLIGHT",
          label: "TK1",
        },
      ],
      windows: [],
    });

    assert.equal(days.length, 2);
    assert.equal(days[0].blocks[0].startPercent, 75);
    assert.equal(days[0].blocks[0].endPercent, 100);
    assert.equal(days[0].blocks[0].continuesAfter, true);
    assert.equal(days[1].blocks[0].startPercent, 0);
    assert.equal(days[1].blocks[0].endPercent, 25);
    assert.equal(days[1].blocks[0].continuesBefore, true);
  });

  it("emits a row for a day with no blocks so the axis stays continuous", () => {
    const days = buildTimeline({
      duties: [
        {
          id: "d1",
          startAt: new Date("2026-08-15T03:00:00Z"),
          endAt: new Date("2026-08-15T09:00:00Z"),
          type: "FLIGHT",
          label: "TK1",
        },
        {
          id: "d2",
          startAt: new Date("2026-08-17T03:00:00Z"),
          endAt: new Date("2026-08-17T09:00:00Z"),
          type: "FLIGHT",
          label: "TK2",
        },
      ],
      windows: [],
    });

    assert.equal(days.length, 3);
    assert.deepEqual(days[1].blocks, []);
  });

  it("carries a window's href through and marks it as a window", () => {
    const days = buildTimeline({
      duties: [],
      windows: [
        {
          id: "w1",
          startAt: new Date("2026-08-15T03:00:00Z"),
          endAt: new Date("2026-08-15T09:00:00Z"),
          label: "6h",
          href: "/pilot/abc/window/w1",
        },
      ],
    });

    assert.equal(days[0].blocks[0].kind, "window");
    assert.equal(days[0].blocks[0].href, "/pilot/abc/window/w1");
  });

  it("drops a zero-length span rather than emitting a zero-width block", () => {
    const instant = new Date("2026-08-15T03:00:00Z");
    const days = buildTimeline({
      duties: [{ id: "d1", startAt: instant, endAt: instant, type: "FLIGHT", label: "TK1" }],
      windows: [],
    });

    assert.deepEqual(days, []);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --import tsx --test src/lib/views/timelineLayout.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/views/timelineLayout.ts`**

```ts
import { formatTurkeyDateLabel, turkeyMidnight } from "@/lib/time/turkeyTime";

const DAY_MS = 24 * 60 * 60_000;

export interface TimelineSpanInput {
  id: string;
  startAt: Date;
  endAt: Date;
  label: string;
}

export interface TimelineDutyInput extends TimelineSpanInput {
  type: string;
}

export interface TimelineWindowInput extends TimelineSpanInput {
  href: string;
}

export interface TimelineInput {
  duties: TimelineDutyInput[];
  windows: TimelineWindowInput[];
}

export interface TimelineBlock {
  id: string;
  kind: "duty" | "window";
  type: string;
  label: string;
  /** 0–100, percent across the day from Türkiye-local midnight. */
  startPercent: number;
  endPercent: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
  href?: string;
}

export interface TimelineDay {
  /** Türkiye-local midnight for this row, as a UTC instant. */
  date: Date;
  label: string;
  blocks: TimelineBlock[];
}

/**
 * Clip an absolute span to one day row.
 *
 * Works in absolute milliseconds from the row's Türkiye midnight rather than deriving local
 * clock components, so the host's zone never enters the arithmetic. Türkiye has no DST, so a day
 * is always exactly 24h and `+ DAY_MS` is a safe way to step to the next row.
 */
function clipToDay(startAt: Date, endAt: Date, dayStartMs: number) {
  const dayEndMs = dayStartMs + DAY_MS;
  const from = Math.max(startAt.getTime(), dayStartMs);
  const to = Math.min(endAt.getTime(), dayEndMs);
  if (to <= from) return null;

  return {
    startPercent: ((from - dayStartMs) / DAY_MS) * 100,
    endPercent: ((to - dayStartMs) / DAY_MS) * 100,
    continuesBefore: startAt.getTime() < dayStartMs,
    continuesAfter: endAt.getTime() > dayEndMs,
  };
}

export function buildTimeline(input: TimelineInput): TimelineDay[] {
  const spans = [
    ...input.duties.map((duty) => ({ ...duty, kind: "duty" as const, type: duty.type, href: undefined })),
    ...input.windows.map((window) => ({
      ...window,
      kind: "window" as const,
      type: "window",
      href: window.href,
    })),
  ].filter((span) => span.endAt.getTime() > span.startAt.getTime());

  if (spans.length === 0) return [];

  const firstMs = Math.min(...spans.map((span) => span.startAt.getTime()));
  // The last row is the day the final span *ends* on; a span ending exactly at midnight belongs
  // to the day before, so step back a millisecond before asking which day that is.
  const lastMs = Math.max(...spans.map((span) => span.endAt.getTime() - 1));

  const days: TimelineDay[] = [];
  for (
    let dayStartMs = turkeyMidnight(new Date(firstMs)).getTime();
    dayStartMs <= turkeyMidnight(new Date(lastMs)).getTime();
    dayStartMs += DAY_MS
  ) {
    const date = new Date(dayStartMs);
    const blocks: TimelineBlock[] = [];

    for (const span of spans) {
      const clipped = clipToDay(span.startAt, span.endAt, dayStartMs);
      if (!clipped) continue;
      blocks.push({
        id: span.id,
        kind: span.kind,
        type: span.type,
        label: span.label,
        href: span.href,
        ...clipped,
      });
    }

    blocks.sort((a, b) => a.startPercent - b.startPercent);
    days.push({ date, label: formatTurkeyDateLabel(date), blocks });
  }

  return days;
}
```

- [ ] **Step 4: Run the suite**

Run: `npm test`
Expected: PASS, including `portability.test.ts` (this module imports neither `next/*` nor Prisma).

- [ ] **Step 5: Commit**

```bash
git add src/lib/views/timelineLayout.ts src/lib/views/timelineLayout.test.ts
git commit -m "Add timeline layout arithmetic

Clipping duties to day rows has real edge cases — midnight crossings,
multi-day duties, spans ending exactly at midnight — so it belongs in
src/lib where the test suite reaches it, not inside a component. Works in
absolute ms from Türkiye midnight so the host zone never enters the maths."
```

---

### Task 14: Schedule timeline component

**Files:**
- Create: `src/components/domain/ScheduleTimeline.tsx`
- Modify: `src/app/pilot/[crewId]/page.tsx`

**Interfaces:**
- Consumes: `buildTimeline`, `TimelineDay` (Task 13).
- Produces: default `ScheduleTimeline({ days }: { days: TimelineDay[] })`.

- [ ] **Step 1: Create `src/components/domain/ScheduleTimeline.tsx`**

```tsx
import Link from "next/link";
import type { TimelineDay } from "@/lib/views/timelineLayout";

const HOUR_TICKS = [0, 6, 12, 18];

const BLOCK_TONES: Record<string, string> = {
  FLIGHT: "bg-ink text-paper",
  HSBY: "bg-ink-muted text-paper",
  DAYOFF: "bg-rule text-ink",
  window: "bg-ok-bg text-ok border border-ok",
};

export default function ScheduleTimeline({ days }: { days: TimelineDay[] }) {
  if (days.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-xl border border-rule bg-card p-4">
      <div className="min-w-[36rem]">
        <div className="mb-2 flex pl-16">
          {HOUR_TICKS.map((hour) => (
            <span
              key={hour}
              className="flex-1 font-mono text-[0.65rem] tabular-nums text-ink-faint"
            >
              {String(hour).padStart(2, "0")}:00
            </span>
          ))}
        </div>

        {days.map((day) => (
          <div key={day.date.toISOString()} className="flex items-center gap-2 py-1">
            <span className="w-14 shrink-0 font-mono text-[0.65rem] tabular-nums text-ink-faint">
              {day.label}
            </span>
            <div className="relative h-6 flex-1 rounded bg-sunken">
              {day.blocks.map((block) => {
                const style = {
                  left: `${block.startPercent}%`,
                  width: `${block.endPercent - block.startPercent}%`,
                };
                const className = `absolute inset-y-0 flex items-center overflow-hidden rounded px-1 font-mono text-[0.6rem] ${
                  BLOCK_TONES[block.type] ?? BLOCK_TONES.DAYOFF
                }`;

                return block.href ? (
                  <Link
                    key={`${block.id}-${block.startPercent}`}
                    href={block.href}
                    style={style}
                    className={className}
                    title={block.label}
                  >
                    {block.label}
                  </Link>
                ) : (
                  <span
                    key={`${block.id}-${block.startPercent}`}
                    style={style}
                    className={className}
                    title={block.label}
                  >
                    {block.label}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

The `min-w` plus `overflow-x-auto` is the narrow-width behaviour: the band scrolls inside its own container rather than reflowing or forcing the page to scroll sideways.

- [ ] **Step 2: Build the timeline data on the pilot page**

In `src/app/pilot/[crewId]/page.tsx`, after the view is loaded:

```tsx
  const timelineDays = buildTimeline({
    duties: view.dutyPeriods.map((duty) => ({
      id: duty.id,
      startAt: duty.startAt,
      endAt: duty.endAt,
      type: duty.type,
      label: duty.rawCode,
    })),
    windows: shownWindows.map((window) => ({
      id: window.id,
      startAt: window.travel.startAt,
      endAt: window.travel.endAt,
      label: formatDurationMinutes(window.travel.minutes),
      href: `/pilot/${crewId}/window/${window.id}`,
    })),
  });
```

and render it directly above the "Commute opportunities" heading:

```tsx
  <section className="mt-10">
    <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
      This period
    </h2>
    <div className="mt-4">
      <ScheduleTimeline days={timelineDays} />
    </div>
  </section>
```

Only `shownWindows` are plotted — plotting windows below the pilot's threshold would contradict the filter they just set.

- [ ] **Step 3: Verify**

Run: `npm run lint && npm run build && npm test`
Expected: clean.

In a browser: the band shows one row per day of the roster; duties sit at the right times; a duty crossing midnight appears on both rows; clicking a green window band opens its planner; narrowing the window scrolls the band horizontally **without** the page scrolling sideways.

- [ ] **Step 4: Commit**

```bash
git add src/components/domain/ScheduleTimeline.tsx src/app/pilot/\[crewId\]/page.tsx
git commit -m "Add the schedule timeline

The month as day rows against a 24h axis — the main thing laptop-first
buys. Only windows above the pilot's threshold are plotted; showing the rest
would contradict the filter they just set."
```

---

### Task 15: Window planner page

**Files:**
- Modify: `src/app/pilot/[crewId]/window/[windowId]/page.tsx`
- Modify: `src/app/pilot/[crewId]/window/[windowId]/TripPlanner.tsx`
- Modify: `src/app/pilot/[crewId]/window/[windowId]/HomeCityForm.tsx`
- Create: `src/components/domain/TrainPicker.tsx`

**Interfaces:**
- Consumes: everything from Tasks 3–7.
- Produces: default `TrainPicker({ label, options, selectedIndex, onSelect })` where `options: SerializedTrainOption[]`.

- [ ] **Step 1: Extract `TrainPicker` from `TripPlanner`**

Create `src/components/domain/TrainPicker.tsx` — move `cheapestFare`, `formatPrice`, `optionLabel` and `TrainSelect` across verbatim, keeping their comments, and restyle:

```tsx
"use client";

import { formatDurationMinutes, formatTurkeyRange } from "@/lib/time/turkeyTime";
import { Select } from "@/components/ui/Field";
import type { SerializedTrainOption } from "@/lib/trains/serialized";
import type { TrainFare } from "@/lib/trains/TrainProvider";

function cheapestFare(option: SerializedTrainOption): TrainFare | null {
  if (!option.fares || option.fares.length === 0) return null;
  return option.fares.reduce((cheapest, fare) =>
    fare.priceMinor < cheapest.priceMinor ? fare : cheapest,
  );
}

/** Exact to the kuruş — rounding a ₺450,50 fare to ₺451 misstates what the ticket costs. */
function formatPrice(fare: TrainFare): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: fare.currency,
  }).format(fare.priceMinor / 100);
}

/**
 * One `<option>` label. Price and seats-left only appear when the provider supplied them, so the
 * same component renders live data and curated estimates without branching on the source.
 */
function optionLabel(option: SerializedTrainOption): string {
  const parts = [
    formatTurkeyRange(new Date(option.departureAt), new Date(option.arrivalAt)),
    `(${formatDurationMinutes(option.durationMinutes)})`,
  ];

  const fare = cheapestFare(option);
  if (fare) parts.push(`· ${formatPrice(fare)}`);

  if (option.availableSeats !== undefined && option.availableSeats <= 10) {
    parts.push(`· ${option.availableSeats} seats left`);
  }

  return parts.join(" ");
}

export default function TrainPicker({
  label,
  options,
  selectedIndex,
  onSelect,
}: {
  label: React.ReactNode;
  options: SerializedTrainOption[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}) {
  const selected = options[selectedIndex];

  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink">{label}</span>
        <Select
          value={selectedIndex}
          onChange={(e) => onSelect(Number(e.target.value))}
          className="font-mono tabular-nums"
        >
          {options.map((option, index) => (
            <option key={option.trainNumber + option.departureAt} value={index}>
              {optionLabel(option)}
            </option>
          ))}
        </Select>
      </label>
      {selected && (
        <a
          href={selected.bookingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="self-start text-sm font-medium text-ink-muted underline underline-offset-4 hover:text-ink"
        >
          Buy on TCDD ↗
        </a>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Restyle `TripPlanner.tsx`**

Keep **all** state, `useMemo`s, `evaluateCommuteFeasibility` usage, `handleCommit`, and the `hasEstimates` derivation with its comment. Delete the moved helpers and `TrainSelect`, import `TrainPicker` instead, and re-export the type as before. The returned JSX becomes a ticket:

```tsx
  if (outboundOptions.length === 0 || returnOptions.length === 0) {
    return (
      <div className="mt-6">
        <Callout tone="warn">
          No {outboundOptions.length === 0 ? "outbound" : "return"} trains to {homeCity} fit inside
          this off-window.
        </Callout>
      </div>
    );
  }

  return (
    <div className="mt-6 flex flex-col gap-4">
      <Ticket>
        <TicketBody className="flex flex-col gap-5">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <TrainPicker
              label={
                <>
                  Outbound to {homeCity}{" "}
                  <span className="font-normal text-ink-muted">(local time)</span>
                </>
              }
              options={outboundOptions}
              selectedIndex={outboundIndex}
              onSelect={setOutboundIndex}
            />
            <TrainPicker
              label={
                <>
                  Return to Istanbul{" "}
                  <span className="font-normal text-ink-muted">(local time)</span>
                </>
              }
              options={returnOptions}
              selectedIndex={returnIndex}
              onSelect={setReturnIndex}
            />
          </div>

          <Field
            label={
              <>
                PNR / booking reference{" "}
                <span className="font-normal text-ink-muted">
                  (optional — paste it back once you&apos;ve bought on TCDD)
                </span>
              </>
            }
          >
            <TextInput
              value={bookingReference}
              onChange={(e) => setBookingReference(e.target.value)}
              placeholder="e.g. 1234567890"
              className="max-w-xs font-mono"
            />
          </Field>
        </TicketBody>

        <Perforation />

        {feasibility && (
          <TicketStub className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-ink-faint">
                Time at home
              </p>
              <p className="font-mono text-xl tabular-nums text-ink">
                {formatDurationMinutes(feasibility.netTimeAtHomeMinutes)}
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                {formatDurationMinutes(feasibility.bufferBeforeOutboundMinutes)} waiting before the
                outbound departs · {formatDurationMinutes(feasibility.bufferAfterReturnMinutes)} to
                spare on the way back
              </p>
            </div>
            <Stamp tone={feasibility.isFeasible ? "ok" : "danger"}>
              {feasibility.isFeasible ? "Fits" : "Does not fit"}
            </Stamp>
          </TicketStub>
        )}
      </Ticket>

      {feasibility && feasibility.warnings.length > 0 && (
        <Callout tone="warn">
          <ul className="list-disc pl-5">
            {feasibility.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Callout>
      )}

      {error && <Callout tone="danger">{error}</Callout>}

      <Button onClick={handleCommit} disabled={isSaving || !feasibility?.isFeasible} className="self-start">
        {committed ? "Update commitment" : isSaving ? "Saving…" : "Commit to this commute"}
      </Button>

      {committed && (
        <p className="text-sm text-ok">
          {bookingReference.trim()
            ? `Ticketed — booking reference ${bookingReference.trim()}.`
            : "You're committed to this trip — buy the tickets on TCDD to lock it in."}
        </p>
      )}

      <SourceNote hasEstimates={hasEstimates} />
    </div>
  );
```

- [ ] **Step 3: Restyle `HomeCityForm.tsx`**

Keep the submit logic exactly. Wrap in a `Ticket`, and swap the raw `select`/`button`/error paragraph for `Field` + `Select`, `Button`, and `Callout tone="danger"`.

- [ ] **Step 4: Restyle the window page**

Replace the four hand-rolled warning blocks with `Callout`s, the header with `PageHeader` + `TimeStack`, and the wrapper with `PageShell`. Drop the "← Back to schedule" link — `AppHeader` provides it. Keep `buildOffWindowView`, `notFound()` and the `homeStationCode` branch exactly.

```tsx
  return (
    <PageShell>
      <PageHeader
        title={<TimeStack at={travel.startAt} to={travel.endAt} size="lg" />}
        subtitle={
          <>
            {formatDurationMinutes(travel.minutes)} to travel
            {!view.travelEligible && " · adjacent to a standby duty"}
            {" · "}duty ends {formatTurkeyDateTime(view.dutyEndsAt)}, report back by{" "}
            {formatTurkeyDateTime(view.reportBackAt)} ·{" "}
            {formatDurationMinutes(view.airportTransferMinutes)} airport ↔ station each way
          </>
        }
      />

      <div className="mt-6 flex flex-col gap-3">
        {!travel.isViable && (
          <Callout tone="warn">
            Once the transfer at each end is accounted for, there isn&apos;t enough of this gap left
            to get anywhere and back.
          </Callout>
        )}

        {outboundChoice?.isLongWait && (
          <Callout tone="warn">
            Nothing leaves within {formatDurationMinutes(MAX_STATION_WAIT_MINUTES)} of you being
            free — the first train you can reach is{" "}
            {formatDurationMinutes(outboundChoice.waitMinutes)} away, so you&apos;d head home first
            rather than wait at the station.
          </Callout>
        )}

        {view.restEndsAt && (
          <Callout tone="neutral" title={`Minimum rest runs to ${formatTurkeyDateTime(view.restEndsAt)}`}>
            You&apos;re free to travel before then, you just can&apos;t be rostered until it ends.{" "}
            <span className="font-mono text-xs">{formatUtcTime(view.restEndsAt)} GMT</span>
          </Callout>
        )}
      </div>

      {!view.homeStationCode ? (
        <HomeCityForm crewId={crewId} destinations={view.destinations} />
      ) : (
        <TripPlanner
          windowId={windowId}
          windowStart={travel.startAt.toISOString()}
          latestReturnArrival={travel.latestReturnArrivalAt.toISOString()}
          homeCity={view.homeCity}
          outboundOptions={view.outboundOptions}
          returnOptions={view.returnOptions}
          initialOutboundIndex={view.initialOutboundIndex}
          initialReturnIndex={view.initialReturnIndex}
          alreadyCommitted={view.isCommitted}
          initialBookingReference={view.bookingReference}
        />
      )}
    </PageShell>
  );
```

- [ ] **Step 5: Verify**

Run: `npm run lint && npm run build && npm test`
Expected: clean.

In a browser on a real window: both pickers populate; changing a selection updates "Time at home" and the Fits/Does not fit stamp; the commit button is disabled when infeasible; committing works and the plan appears on `/plans`; the estimate-vs-live footnote matches the data source. **Also check a window where the live TCDD call fails** — it must fall back to estimates and never error the page.

- [ ] **Step 6: Commit**

```bash
git add src/app/pilot/\[crewId\]/window src/components/domain/TrainPicker.tsx
git commit -m "Rebuild the window planner as a ticket being filled in

The window is the header, the two trains are the legs, and the feasibility
verdict is the stub — time at home printed where a fare would sit. The four
hand-rolled warning boxes become Callouts."
```

---

### Task 16: Planner loading state

**Files:**
- Modify: `src/app/pilot/[crewId]/window/[windowId]/page.tsx`
- Create: `src/app/pilot/[crewId]/window/[windowId]/PlannerSkeleton.tsx`

The page performs a live TCDD fetch on every render and currently shows nothing while it waits. Split the train-dependent portion behind `<Suspense>` so the header, warnings and rest note paint immediately.

- [ ] **Step 1: Create `PlannerSkeleton.tsx`**

```tsx
import { Ticket, TicketBody, Perforation, TicketStub } from "@/components/ui/Ticket";

export default function PlannerSkeleton() {
  return (
    <div className="mt-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading train times…</span>
      <Ticket>
        <TicketBody className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="flex flex-col gap-2">
              <div className="h-4 w-32 animate-pulse rounded bg-sunken" />
              <div className="h-9 w-full animate-pulse rounded-md bg-sunken" />
            </div>
          ))}
        </TicketBody>
        <Perforation />
        <TicketStub>
          <div className="h-8 w-40 animate-pulse rounded bg-card" />
        </TicketStub>
      </Ticket>
    </div>
  );
}
```

- [ ] **Step 2: Split the page**

Move the `buildOffWindowView` call's train-dependent rendering into an inner async component in the same file, and await nothing before the header. Restructure so the page renders the shell immediately and suspends only on the planner:

```tsx
async function Planner({ crewId, windowId }: { crewId: string; windowId: string }) {
  const view = await buildOffWindowView(crewId, windowId);
  if (!view) notFound();
  return view.homeStationCode ? <TripPlanner {...} /> : <HomeCityForm {...} />;
}
```

Wrap its use:

```tsx
<Suspense fallback={<PlannerSkeleton />}>
  <Planner crewId={crewId} windowId={windowId} />
</Suspense>
```

The outer page still needs the window metadata for its header, so it awaits `buildOffWindowView` too. If the double call proves measurably wasteful, the fix is a `React.cache()` wrapper around the builder — **not** threading the result through props, which would defeat the boundary.

- [ ] **Step 3: Verify**

Run: `npm run lint && npm run build && npm test`
Expected: clean.

In a browser: the window header and warnings paint immediately; the skeleton shows while trains load; a failing live request still degrades to estimates rather than erroring.

- [ ] **Step 4: Commit**

```bash
git add src/app/pilot/\[crewId\]/window
git commit -m "Show a skeleton while train times load

The planner does a live TCDD fetch on every render and showed nothing at
all while it waited. Rendering change only — a failing live request still
degrades to estimates and never errors the page."
```

---

### Task 17: Final verification pass

**Files:** none — this task only verifies and, if needed, tunes.

- [ ] **Step 1: Full suite**

Run: `npm test && npm run lint && npm run build`
Expected: all green, `portability.test.ts` passing **without** its `SERVER_ONLY` allowlist having been edited.

- [ ] **Step 2: Confirm no stale colour classes remain**

Run:
```bash
grep -rn "zinc-\|dark:bg-\|dark:text-\|dark:border-" src/app src/components
```
Expected: **no matches.** Any hit is a component still writing literal colour and must be converted to tokens.

- [ ] **Step 3: Confirm the fonts and the server/client split**

Run:
```bash
grep -rn "Arial" src/
grep -rln "use client" src/app src/components
```
Expected: no `Arial`. The `"use client"` list contains only `ThemeToggle`, `AppHeader`, `InlineEdit`, `TrainPicker`, `UploadForm`, `PlanCard`, `TripPlanner`, `HomeCityForm`, `MinOffHoursControl`, `TransferBufferControl` — no `page.tsx`.

- [ ] **Step 4: Browser matrix**

For each of `/`, `/upload`, `/pilot/<crewId>`, `/pilot/<crewId>/window/<windowId>`, `/plans`:
- light, dark, and auto
- laptop width, then ~380px — **the page body must never scroll horizontally**; wide content scrolls inside its own container
- measure contrast on body and secondary text; both must clear 4.5:1

Fix any token values that miss the bar, in `globals.css` only.

- [ ] **Step 5: Commit any tuning**

```bash
git add -A
git commit -m "Tune token values against measured contrast"
```

---

## Self-Review

**Spec coverage.** §1 tokens → Task 1. §2 theming → Tasks 1, 3. §3 inventory → Tasks 3–7, 15 (`TrainPicker`), 14 (`ScheduleTimeline`). §4 screens → Tasks 8, 9, 11, 12, 15. §5 timeline → Tasks 2, 13, 14. §6 loading state → Task 16. §7 frozen behaviour → Task 11 Step 3 and Task 12 Step 4 verify it. §8 file layout → Tasks 3–7. §9 testing → Task 17. §10 order → this plan's order.

**One addition beyond the spec:** Task 10 adds `originCode`/`destinationCode` to `PlanCardView`. `RouteLine` needs codes and the view discarded them after resolving labels. Additive, test-driven, no behaviour change.

**One refinement beyond the spec:** the spec had `AppHeader` receiving the crew ID as a prop. Task 3 reads it from the URL with `usePathname()` instead — the ID is already in the path on `/pilot/...` routes, so this avoids drilling a prop through every page while still inventing no identity.

**Placeholder scan:** clean. Both settings controls now carry their real markup (Task 12 Step 1) rather than an instruction to work it out — `TransferBufferControl` saves on change, not on blur, and its `choices` derivation handles a stored value that is not one of the presets.

**Type consistency:** `SaveState` is defined once in Task 6 and imported by `PlanCard` in Task 11. `StampTone` and `CalloutTone` are distinct types with the same four members — deliberate, so a tone can be added to one without the other. `TimelineDay` / `TimelineBlock` are produced in Task 13 and consumed unchanged in Task 14. `Ticket`'s `as` prop is a closed union (`"div" | "li" | "article" | "section"`); Task 11 uses `as="li"` and Task 12 uses `as="li"`, both in the union.

**Verification honesty:** Tasks 1 and 3–9 have no automated tests, because they produce presentational components and this project has no React test setup — adding jsdom to assert a `<div>` has a class would be cost without coverage. Their gates are `lint` + `build` + a named browser check. The three tasks carrying real logic (2, 10, 13) are fully test-driven against the existing `node:test` suite.
