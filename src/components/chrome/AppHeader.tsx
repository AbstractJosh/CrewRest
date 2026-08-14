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
      className={`rounded-sm text-sm outline-none transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action ${
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
          className="rounded-sm font-mono text-sm font-semibold uppercase tracking-[0.18em] text-ink outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
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
