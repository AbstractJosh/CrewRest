"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FOCUS_RING } from "@/components/ui/focusRing";
import ThemeToggle from "./ThemeToggle";

/**
 * The crew ID is read from the URL rather than passed down. CrewRest has no session and no user
 * concept, so there is nothing to remember — but on a /pilot/... route the ID is right there, and
 * reading it is what lets "Schedule" link straight to the right pilot without inventing an
 * identity or drilling a prop through every page.
 *
 * Off those routes there is no ID to read, which is why "Schedule" falls back to /schedule — a
 * server route that looks up the most recent upload and redirects. Linking there unconditionally
 * would be simpler but wrong: with two rosters uploaded it could bounce a pilot viewing their own
 * schedule over to someone else's.
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
      className={`rounded-sm text-sm outline-none transition-colors ${FOCUS_RING} ${
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
      <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center gap-6 px-6 py-3">
        <Link
          href="/"
          className={`rounded-sm font-mono text-sm font-semibold uppercase tracking-[0.18em] text-ink outline-none ${FOCUS_RING}`}
        >
          CrewRest
        </Link>
        <nav className="flex flex-1 items-center gap-5">
          {/* Active on the trip planner too — it is reached through the schedule and sits under it. */}
          <NavLink href={crewId ? `/pilot/${crewId}` : "/schedule"} active={pathname.startsWith("/pilot/")}>
            Schedule
          </NavLink>
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
