import Link from "next/link";
import { notFound } from "next/navigation";
import { buildOffWindowView } from "@/lib/views/offWindowView";
import { MAX_STATION_WAIT_MINUTES } from "@/lib/trains/reachability";
import {
  formatDurationMinutes,
  formatTurkeyDateTime,
  formatTurkeyRange,
  formatUtcRange,
  formatUtcTime,
} from "@/lib/time/turkeyTime";
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
    <div className="mx-auto w-full max-w-3xl px-6 py-12">
      <Link
        href={`/pilot/${crewId}`}
        className="text-sm font-medium text-zinc-600 underline underline-offset-4 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
      >
        ← Back to schedule
      </Link>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
        {formatTurkeyRange(travel.startAt, travel.endAt)}
      </h1>
      <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
        {formatUtcRange(travel.startAt, travel.endAt)} GMT
      </p>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        {formatDurationMinutes(travel.minutes)} to travel
        {!view.travelEligible && " · adjacent to a standby duty"}
      </p>
      <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
        duty ends {formatTurkeyDateTime(view.dutyEndsAt)}, report back by{" "}
        {formatTurkeyDateTime(view.reportBackAt)} ·{" "}
        {formatDurationMinutes(view.airportTransferMinutes)} airport ↔ station each way
      </p>

      {!travel.isViable && (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          Once the transfer at each end is accounted for, there isn&apos;t enough of this gap
          left to get anywhere and back.
        </p>
      )}

      {outboundChoice?.isLongWait && (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          Nothing leaves within {formatDurationMinutes(MAX_STATION_WAIT_MINUTES)} of you being
          free — the first train you can reach is{" "}
          {formatDurationMinutes(outboundChoice.waitMinutes)} away, so you&apos;d head home
          first rather than wait at the station.
        </p>
      )}

      {view.restEndsAt && (
        <div className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Minimum rest runs to {formatTurkeyDateTime(view.restEndsAt)} — you&apos;re free to
            travel before then, you just can&apos;t be rostered until it ends.
          </p>
          <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
            {formatUtcTime(view.restEndsAt)} GMT
          </p>
        </div>
      )}

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
    </div>
  );
}
