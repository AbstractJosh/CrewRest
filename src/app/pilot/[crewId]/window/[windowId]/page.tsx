import { Suspense } from "react";
import { notFound } from "next/navigation";
import { buildOffWindowHeader, buildOffWindowView } from "@/lib/views/offWindowView";
import { MAX_STATION_WAIT_MINUTES } from "@/lib/trains/reachability";
import { formatDurationMinutes, formatTurkeyDateTime, formatUtcTime } from "@/lib/time/turkeyTime";
import PageShell from "@/components/chrome/PageShell";
import PageHeader from "@/components/chrome/PageHeader";
import TimeStack from "@/components/domain/TimeStack";
import { Callout } from "@/components/ui/Callout";
import HomeCityForm from "./HomeCityForm";
import TripPlanner from "./TripPlanner";
import PlannerSkeleton from "./PlannerSkeleton";

export default async function OffWindowPage({
  params,
}: PageProps<"/pilot/[crewId]/window/[windowId]">) {
  const { crewId, windowId } = await params;

  // Database only — no train search, so this can be awaited directly without blocking the shell
  // on the live TCDD fetch. See `Planner` below for the part that does search.
  const header = await buildOffWindowHeader(crewId, windowId);
  if (!header) notFound();

  const { travel } = header;

  return (
    <PageShell>
      <PageHeader
        title={<TimeStack at={travel.startAt} to={travel.endAt} size="lg" />}
        subtitle={
          <>
            {formatDurationMinutes(travel.minutes)} to travel
            {!header.travelEligible && " · adjacent to a standby duty"}
            {" · "}duty ends {formatTurkeyDateTime(header.dutyEndsAt)}, report back by{" "}
            {formatTurkeyDateTime(header.reportBackAt)} ·{" "}
            {formatDurationMinutes(header.airportTransferMinutes)} airport ↔ station each way
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

        {header.restEndsAt && (
          <Callout
            tone="neutral"
            title={`Minimum rest runs to ${formatTurkeyDateTime(header.restEndsAt)}`}
          >
            You&apos;re free to travel before then, you just can&apos;t be rostered until it ends.{" "}
            <span className="font-mono text-xs">{formatUtcTime(header.restEndsAt)} GMT</span>
          </Callout>
        )}
      </div>

      <Suspense fallback={<PlannerSkeleton />}>
        <Planner crewId={crewId} windowId={windowId} />
      </Suspense>
    </PageShell>
  );
}

/**
 * The train-dependent half: awaits the full view (which runs the live TCDD search) and renders
 * the long-wait callout plus the home-city form or trip planner. Suspended above so a slow or
 * failing search never blocks the header from painting — `buildOffWindowView` still degrades to
 * `estimate`-sourced trains on a failing live request rather than throwing; nothing here changes
 * that.
 */
async function Planner({ crewId, windowId }: { crewId: string; windowId: string }) {
  const view = await buildOffWindowView(crewId, windowId);
  if (!view) notFound();

  return (
    <>
      {view.outboundChoice?.isLongWait && (
        <div className="mt-6">
          <Callout tone="warn">
            Nothing leaves within {formatDurationMinutes(MAX_STATION_WAIT_MINUTES)} of you being
            free — the first train you can reach is{" "}
            {formatDurationMinutes(view.outboundChoice.waitMinutes)} away, so you&apos;d head home
            first rather than wait at the station.
          </Callout>
        </div>
      )}

      {!view.homeStationCode ? (
        <HomeCityForm crewId={crewId} destinations={view.destinations} />
      ) : (
        <TripPlanner
          windowId={windowId}
          windowStart={view.travel.startAt.toISOString()}
          latestReturnArrival={view.travel.latestReturnArrivalAt.toISOString()}
          homeCity={view.homeCity}
          outboundOptions={view.outboundOptions}
          returnOptions={view.returnOptions}
          initialOutboundIndex={view.initialOutboundIndex}
          initialReturnIndex={view.initialReturnIndex}
          alreadyCommitted={view.isCommitted}
          initialBookingReference={view.bookingReference}
        />
      )}
    </>
  );
}
