"use client";

import { useEffect, useState } from "react";
import { FOCUS_RING } from "@/components/ui/focusRing";

/**
 * Two states, not three. The OS preference is deliberately not consulted: CrewRest opens as light
 * ticket stock for everyone, and dark is a choice the pilot makes and the browser remembers.
 */
export type Theme = "light" | "dark";

const STORAGE_KEY = "crewrest-theme";

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

const ICONS: Record<Theme, React.ReactNode> = {
  light: (
    <>
      <circle cx="8" cy="8" r="3.2" />
      <path d="M8 1v1.6M8 13.4V15M1 8h1.6M13.4 8H15M3 3l1.1 1.1M11.9 11.9L13 13M13 3l-1.1 1.1M4.1 11.9L3 13" />
    </>
  ),
  dark: <path d="M13 9.5A5.5 5.5 0 016.5 3a5.5 5.5 0 108.5 6.5z" />,
};

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");
  // The server cannot know the stored choice, so render the light affordance until mounted —
  // otherwise the first client render disagrees with the HTML and React warns.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // The standard client-mount detection idiom: there is no external store to subscribe to
    // here, only "has hydration happened yet", so an unconditional setState on mount is exactly
    // what's needed.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    try {
      if (localStorage.getItem(STORAGE_KEY) === "dark") setTheme("dark");
    } catch {
      // localStorage throws outright in some privacy modes; light is the default anyway.
    }
  }, []);

  const shown = mounted ? theme : "light";
  const next: Theme = shown === "dark" ? "light" : "dark";

  function toggle() {
    setTheme(next);
    applyTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Preference simply won't persist. The applied theme still took effect.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Theme: ${shown}. Switch to ${next}.`}
      title={`Switch to ${next} theme`}
      className={`rounded-md border border-rule p-1.5 text-ink-muted outline-none transition-colors hover:border-ink-faint hover:text-ink ${FOCUS_RING}`}
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
