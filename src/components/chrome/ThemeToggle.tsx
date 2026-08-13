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
    // The standard client-mount detection idiom: there is no external store to subscribe to
    // here, only "has hydration happened yet", so an unconditional setState on mount is exactly
    // what's needed.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
