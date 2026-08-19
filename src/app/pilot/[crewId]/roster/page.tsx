import { Suspense } from "react";
import { notFound } from "next/navigation";
import { formatTurkeyRange, formatUtcRange } from "@/lib/time/turkeyTime";
import { buildPilotRosterView, type RosterDutyView } from "@/lib/views/pilotRosterView";
import {
  buildRosterCalendarHeader,
  buildRosterCalendarView,
  type RosterCalendarHeader,
} from "@/lib/views/rosterCalendarView";
import RosterCalendar from "@/components/domain/RosterCalendar";
import SourceNote from "@/components/domain/SourceNote";
import type { FlightLeg } from "@/lib/pdf/scheduleParser";
import PageShell from "@/components/chrome/PageShell";
import PageHeader from "@/components/chrome/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { ButtonLink } from "@/components/ui/Button";
import ViewSwitch, { toRosterViewMode } from "./ViewSwitch";

const DUTY_TYPE_LABEL: Record<string, string> = {
  FLIGHT: "Flight duty",
  HSBY: "Home standby",
  DAYOFF: "Day off",
};

function FlightLegRow({ leg }: { leg: FlightLeg }) {
  return (
    <li className="font-mono text-xs tabular-nums text-ink-muted">
      {leg.flightNumber} {leg.origin}/{leg.departureTime} → {leg.destination}/{leg.arrivalTime}
      {leg.departureTimeUtc && leg.arrivalTimeUtc && (
        <span className="ml-2 text-ink-faint">
          ({leg.departureTimeUtc} → {leg.arrivalTimeUtc} GMT)
        </span>
      )}
    </li>
  );
}

/**
 * The legs of one duty, all of them behind one disclosure.
 *
 * The row above already says this was a flight duty and when it ran, which is what a pilot
 * scanning for the gap after it needs; the sectors are detail they open when they want them.
 *
 * A `<details>` rather than state and a button: this page is a server component with nothing else
 * interactive on it, and the disclosure the browser already has works without shipping any
 * JavaScript for it — the same trade the schedule page makes for its short breaks.
 */
function FlightLegs({ legs }: { legs: FlightLeg[] }) {
  if (legs.length === 0) return null;

  return (
    <details className="mt-1.5">
      <summary className="cursor-pointer text-xs text-ink-faint hover:text-ink">Flights</summary>
      <ul className="mt-1 flex flex-col gap-1">
        {legs.map((leg, i) => (
          <FlightLegRow key={i} leg={leg} />
        ))}
      </ul>
    </details>
  );
}

/** The roster reads as a printed timetable: one dense row per duty, mono times. */
function DutyRow({ duty }: { duty: RosterDutyView }) {
  return (
    <li className="border-b border-rule py-3 last:border-b-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="font-mono text-sm tabular-nums text-ink">
          {formatTurkeyRange(duty.startAt, duty.endAt)}
        </span>
        <span className="text-xs text-ink-muted">{DUTY_TYPE_LABEL[duty.type] ?? duty.type}</span>
      </div>
      <p className="mt-0.5 font-mono text-xs tabular-nums text-ink-faint">
        {formatUtcRange(duty.startAt, duty.endAt)} GMT
      </p>

      <FlightLegs legs={duty.flightLegs} />
    </li>
  );
}

export default async function PilotRosterPage({
  params,
  searchParams,
}: PageProps<"/pilot/[crewId]/roster">) {
  const { crewId } = await params;
  const mode = toRosterViewMode((await searchParams).view);

  /*
   * One builder per mode rather than one that answers both: the list needs flight legs and no
   * commitments, the calendar needs commitments and no legs, and only one of them is ever drawn.
   *
   * In calendar mode only the *header* is awaited here. The grid runs a live TCDD search per open
   * window, this is the roster's default view, and none of the chrome below needs any of it — so
   * it is streamed in behind a Suspense boundary, the same split the window planner makes. The
   * list view has nothing to wait on and is awaited whole.
   */
  const roster = mode === "list" ? await buildPilotRosterView(crewId) : null;
  const header: RosterCalendarHeader | null =
    roster ?? (mode === "calendar" ? await buildRosterCalendarHeader(crewId) : null);
  if (!header) notFound();

  return (
    <PageShell>
      <PageHeader
        title="Roster"
        meta={[header.name, `Crew ${header.crewId}`, header.aircraftType, header.period]
          .filter(Boolean)
          .join(" · ")}
        subtitle="Duty spans run report → release, in Türkiye local time. Flight legs are local at each station."
        action={<ButtonLink href={`/pilot/${crewId}`} size="sm" variant="ghost">
            Commute windows
          </ButtonLink>}
      />

      {!header.hasSchedule ? (
        <div className="mt-10">
          <EmptyState>No schedule uploaded yet.</EmptyState>
        </div>
      ) : (
        <>
          <div className="mt-8">
            <ViewSwitch crewId={crewId} mode={mode} />
          </div>

          {roster ? (
            <ul className="mt-4 rounded-xl border border-rule bg-card px-5">
              {roster.dutyPeriods.map((duty) => (
                <DutyRow key={duty.id} duty={duty} />
              ))}
            </ul>
          ) : (
            <div className="mt-4">
              <Suspense fallback={<CalendarSkeleton />}>
                <Calendar crewId={crewId} />
              </Suspense>
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}

/**
 * The train-dependent half of the calendar: the grid itself, plus the note saying whether the
 * times on it came off the live feed. Suspended above, so a slow or failing TCDD request delays
 * the month rather than the page — `buildRosterCalendarView` still degrades to `estimate`-sourced
 * trains rather than throwing, and `SourceNote` is what tells the pilot that happened.
 */
async function Calendar({ crewId }: { crewId: string }) {
  const view = await buildRosterCalendarView(crewId);
  if (!view) notFound();

  /*
   * The grids come from the events, not from the roster's period, and a day off is not an event —
   * so a month of leave has nothing to draw. Saying so beats a legend and an empty frame, which
   * read as a page that failed to render.
   */
  if (view.months.length === 0) {
    return <EmptyState>No duties in this roster.</EmptyState>;
  }

  return (
    <>
      <RosterCalendar months={view.months} />
      <div className="mt-4">
        <SourceNote hasEstimates={view.hasEstimates} />
      </div>
    </>
  );
}

/** Holds the month's place while the search runs, so the page below it doesn't jump. */
function CalendarSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite" className="flex flex-col gap-1">
      <span className="sr-only">Loading the month…</span>
      {[0, 1, 2, 3, 4].map((row) => (
        <div key={row} className="h-[4.2rem] animate-pulse rounded bg-sunken" />
      ))}
    </div>
  );
}
