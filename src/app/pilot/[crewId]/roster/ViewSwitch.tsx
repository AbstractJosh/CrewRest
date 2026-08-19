import Link from "next/link";
import { FOCUS_RING } from "@/components/ui/focusRing";

/**
 * Which way the roster is drawn. Carried in the URL rather than in component state, so the two
 * views are separately linkable and the back button steps between them — and so this page can
 * stay a server component with no client bundle behind the toggle.
 */
export type RosterViewMode = "calendar" | "list";

/** Anything unrecognised — a stale link, a typo, nothing at all — is the calendar. */
export function toRosterViewMode(raw: string | string[] | undefined): RosterViewMode {
  return raw === "list" ? "list" : "calendar";
}

const OPTIONS: { mode: RosterViewMode; label: string }[] = [
  { mode: "calendar", label: "Calendar view" },
  { mode: "list", label: "List view" },
];

/**
 * The two roster views, as links rather than buttons: each one is a real address, so it is the
 * browser doing the navigation and no JavaScript is needed to switch.
 *
 * `calendar` is the default and drops the parameter entirely rather than writing `?view=calendar`,
 * so the roster has one canonical URL instead of two that render the same page.
 */
export default function ViewSwitch({
  crewId,
  mode,
}: {
  crewId: string;
  mode: RosterViewMode;
}) {
  return (
    <div
      role="group"
      aria-label="Roster view"
      className="inline-flex rounded-full border border-rule bg-sunken p-0.5"
    >
      {OPTIONS.map((option) => {
        const active = option.mode === mode;
        return (
          <Link
            key={option.mode}
            href={
              option.mode === "calendar"
                ? `/pilot/${crewId}/roster`
                : `/pilot/${crewId}/roster?view=${option.mode}`
            }
            aria-current={active ? "page" : undefined}
            className={`rounded-full px-3 py-1.5 text-sm font-medium outline-none transition-colors ${FOCUS_RING} ${
              active ? "bg-card text-ink shadow-sm" : "text-ink-muted hover:text-ink"
            }`}
          >
            {option.label}
          </Link>
        );
      })}
    </div>
  );
}
