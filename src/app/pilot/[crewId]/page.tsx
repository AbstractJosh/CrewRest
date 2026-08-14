import { notFound } from "next/navigation";
import {
  formatDurationMinutes,
  formatTurkeyDateTime,
  formatTurkeyRange,
  formatUtcRange,
} from "@/lib/time/turkeyTime";
import {
  buildPilotScheduleView,
  type ScheduleDutyView,
  type ScheduleWindowView,
} from "@/lib/views/pilotScheduleView";
import PageShell from "@/components/chrome/PageShell";
import PageHeader from "@/components/chrome/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { ButtonLink } from "@/components/ui/Button";
import { Ticket, TicketBody, Perforation, TicketStub } from "@/components/ui/Ticket";
import { Stamp } from "@/components/ui/Stamp";
import TimeStack from "@/components/domain/TimeStack";
import MinOffHoursControl from "./MinOffHoursControl";
import TransferBufferControl from "./TransferBufferControl";

const DUTY_TYPE_LABEL: Record<string, string> = {
  FLIGHT: "Flight duty",
  HSBY: "Home standby",
  DAYOFF: "Day off",
};

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

export default async function PilotPage({
  params,
}: PageProps<"/pilot/[crewId]">) {
  const { crewId } = await params;

  const view = await buildPilotScheduleView(crewId);
  if (!view) notFound();

  const { shownWindows, hiddenWindows } = view;

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
}
