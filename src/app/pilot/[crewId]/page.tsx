import { notFound } from "next/navigation";
import { formatDurationMinutes, formatTurkeyDateTime } from "@/lib/time/turkeyTime";
import {
  buildPilotScheduleView,
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

function OffWindowTicket({
  crewId,
  window,
  transferMinutes,
}: {
  crewId: string;
  window: ScheduleWindowView;
  transferMinutes: number;
}) {
  const { travel, planState } = window;
  return (
    <Ticket as="li" accent={planState} muted={planState === "dropped"}>
      <TicketBody className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <TimeStack at={travel.startAt} to={travel.endAt} />
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            {planState === "committed" && <Stamp tone="ok">Committed</Stamp>}
            {planState === "dropped" && <Stamp tone="neutral">Cancelled</Stamp>}
            {!window.travelEligible && <Stamp tone="warn">Adjacent to standby</Stamp>}
          </div>
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
          {planState === "committed" ? "Open plan" : planState === "dropped" ? "Plan again" : "Plan trip"}
        </ButtonLink>
      </TicketStub>
    </Ticket>
  );
}

export default async function PilotPage({
  params,
}: PageProps<"/pilot/[crewId]">) {
  const { crewId } = await params;

  // Passed explicitly rather than left to the builder's default, so the clock enters the render
  // at one visible point — same as /plans.
  const view = await buildPilotScheduleView(crewId, new Date());
  if (!view) notFound();

  const { shownWindows, hiddenWindows, pastWindowCount } = view;

  return (
    <PageShell>
      <PageHeader
        title={view.name}
        meta={[`Crew ${view.crewId}`, view.aircraftType, view.period]
          .filter(Boolean)
          .join(" · ")}
        action={
          <ButtonLink href={`/pilot/${crewId}/roster`} size="sm" variant="ghost">
            Roster
          </ButtonLink>
        }
      />

      {!view.hasSchedule ? (
        <div className="mt-10">
          <EmptyState>No schedule uploaded yet.</EmptyState>
        </div>
      ) : (
        <section className="mt-10">
          <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
            Commute opportunities
          </h2>
          <p className="mt-2 text-sm text-ink-muted">
            Windows run from when you can actually be moving — duty release plus your transfer
            time — to your next report time. Türkiye local; GMT underneath.
          </p>

          {/*
            Without this a pilot opening a half-used roster sees the month start partway through
            and has no way to tell a filtered list from a badly parsed one.
          */}
          {pastWindowCount > 0 && (
            <p className="mt-2 text-xs text-ink-faint">
              {pastWindowCount} earlier window{pastWindowCount === 1 ? " has" : "s have"} already
              passed and {pastWindowCount === 1 ? "isn't" : "aren't"} shown.
            </p>
          )}

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
                {pastWindowCount > 0
                  ? `Nothing left in this roster meets your ${view.minOffHours}h threshold.`
                  : `No off-periods meet your ${view.minOffHours}h threshold this period.`}
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
      )}
    </PageShell>
  );
}
