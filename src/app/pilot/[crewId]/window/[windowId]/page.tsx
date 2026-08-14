import { notFound } from "next/navigation";
import { buildOffWindowView } from "@/lib/views/offWindowView";
import { MAX_STATION_WAIT_MINUTES } from "@/lib/trains/reachability";
import { formatDurationMinutes, formatTurkeyDateTime, formatUtcTime } from "@/lib/time/turkeyTime";
import PageShell from "@/components/chrome/PageShell";
import PageHeader from "@/components/chrome/PageHeader";
import TimeStack from "@/components/domain/TimeStack";
import { Callout } from "@/components/ui/Callout";
import HomeCityForm from "./HomeCityForm";
import TripPlanner from "./TripPlanner";

export default async function OffWindowPage({
  params,
}: PageProps<"/pilot/[crewId]/window/[windowId]">) {
  const { crewId, windowId } = await params;

  const view = await buildOffWindowView(crewId, windowId);
  if (!view) notFound();

  const { travel, outboundChoice } = view;

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
}
