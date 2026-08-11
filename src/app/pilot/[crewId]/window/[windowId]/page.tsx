import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  trainProvider,
  searchTrainsInWindow,
  buildBookingUrl,
  type TrainOption,
} from "@/lib/trains";
import { computeTravelWindow } from "@/lib/schedule/travelWindow";
import {
  chooseOutbound,
  isAlightable,
  isBoardable,
  MAX_STATION_WAIT_MINUTES,
} from "@/lib/trains/reachability";
import {
  formatDurationMinutes,
  formatTurkeyDateTime,
  formatTurkeyRange,
  formatUtcRange,
  formatUtcTime,
} from "@/lib/time/turkeyTime";
import HomeCityForm from "./HomeCityForm";
import TripPlanner, { type SerializedTrainOption } from "./TripPlanner";

/**
 * How many days of timetable to pull for one window. Against a live provider each day is an HTTP
 * request, and a gap long enough to be worth commuting home for is measured in days, not weeks —
 * so the static provider's month-wide default buys nothing here.
 */
const MAX_DAYS_TO_SEARCH = 8;

/**
 * Finds a committed train among the options currently offered.
 *
 * Prefers the provider's own id, which survives a timetable edit. A commitment made against the
 * curated timetable has no such id — and its train number is synthesized from list position, so
 * it moves if the data changes — hence the departure-time fallback.
 */
function findCommittedIndex(
  options: SerializedTrainOption[],
  committed: SerializedTrainOption,
): number {
  if (committed.providerTrainId) {
    const byId = options.findIndex((o) => o.providerTrainId === committed.providerTrainId);
    if (byId >= 0) return byId;
  }
  return options.findIndex(
    (o) =>
      o.trainNumber === committed.trainNumber && o.departureAt === committed.departureAt,
  );
}

function serialize(option: TrainOption): SerializedTrainOption {
  return {
    ...option,
    departureAt: option.departureAt.toISOString(),
    arrivalAt: option.arrivalAt.toISOString(),
    bookingUrl: buildBookingUrl(option),
  };
}

export default async function OffWindowPage({
  params,
}: PageProps<"/pilot/[crewId]/window/[windowId]">) {
  const { crewId, windowId } = await params;

  const offWindow = await prisma.offWindow.findUnique({
    where: { id: windowId },
    include: { schedule: { include: { pilot: true } }, commitment: true },
  });
  if (!offWindow || offWindow.schedule.pilot.crewId !== crewId) notFound();

  const pilot = offWindow.schedule.pilot;
  const destinations = trainProvider.listDestinationsFromIstanbul();

  // The duty this window follows. OffWindow has no FK to it, but a window always starts at the
  // preceding duty's release time, so the latest duty ending at or before the window start is it.
  const precedingDuty = await prisma.dutyPeriod.findFirst({
    where: {
      scheduleId: offWindow.scheduleId,
      endAt: { lte: offWindow.startAt },
    },
    orderBy: { endAt: "desc" },
  });
  const restEndsAt =
    precedingDuty?.restEndsAt &&
    precedingDuty.restEndsAt.getTime() > offWindow.startAt.getTime()
      ? precedingDuty.restEndsAt
      : null;

  const travel = computeTravelWindow(offWindow, pilot.airportTransferMinutes);

  let outboundOptions: TrainOption[] = [];
  let returnOptions: TrainOption[] = [];
  if (pilot.homeStationCode) {
    const [outboundAll, returnAll] = await Promise.all([
      searchTrainsInWindow(
        trainProvider,
        "IST",
        pilot.homeStationCode,
        travel.startAt,
        travel.endAt,
        MAX_DAYS_TO_SEARCH,
      ),
      searchTrainsInWindow(
        trainProvider,
        pilot.homeStationCode,
        "IST",
        travel.startAt,
        travel.endAt,
        MAX_DAYS_TO_SEARCH,
      ),
    ]);
    // A train in the timetable isn't necessarily one you can get to: the feeder metro bounds
    // when you can board in Istanbul, and the return has to land early enough to still reach
    // the airport before report time. And a sold-out train is not a way home at all — when the
    // provider reports availability, drop those before they can be chosen.
    outboundOptions = outboundAll.filter(
      (t) => isBoardable(t.departureAt) && t.isSoldOut !== true,
    );
    returnOptions = returnAll.filter(
      (t) =>
        isAlightable(t.arrivalAt) &&
        t.arrivalAt.getTime() <= travel.latestReturnArrivalAt.getTime() &&
        t.isSoldOut !== true,
    );
  }

  const serializedOutbound = outboundOptions.map(serialize);
  const serializedReturn = returnOptions.map(serialize);

  // Leave on the first train that doesn't strand you at the station, come home on the last
  // one that still clears the transfer back to the airport.
  const outboundChoice = chooseOutbound(outboundOptions, travel.startAt);
  let initialOutboundIndex = outboundChoice?.index ?? 0;
  let initialReturnIndex = Math.max(serializedReturn.length - 1, 0);
  if (offWindow.commitment) {
    const outboundJson = offWindow.commitment.outboundTrain as unknown as SerializedTrainOption;
    const returnJson = offWindow.commitment.returnTrain as unknown as SerializedTrainOption;
    const matchedOutbound = findCommittedIndex(serializedOutbound, outboundJson);
    const matchedReturn = findCommittedIndex(serializedReturn, returnJson);
    if (matchedOutbound >= 0) initialOutboundIndex = matchedOutbound;
    if (matchedReturn >= 0) initialReturnIndex = matchedReturn;
  }

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
        {!offWindow.travelEligible && " · adjacent to a standby duty"}
      </p>
      <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
        duty ends {formatTurkeyDateTime(offWindow.startAt)}, report back by{" "}
        {formatTurkeyDateTime(offWindow.endAt)} ·{" "}
        {formatDurationMinutes(pilot.airportTransferMinutes)} airport ↔ station each way
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

      {restEndsAt && (
        <div className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Minimum rest runs to {formatTurkeyDateTime(restEndsAt)} — you&apos;re free to
            travel before then, you just can&apos;t be rostered until it ends.
          </p>
          <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
            {formatUtcTime(restEndsAt)} GMT
          </p>
        </div>
      )}

      {!pilot.homeStationCode ? (
        <HomeCityForm crewId={crewId} destinations={destinations} />
      ) : (
        <TripPlanner
          windowId={windowId}
          windowStart={travel.startAt.toISOString()}
          latestReturnArrival={travel.latestReturnArrivalAt.toISOString()}
          homeCity={pilot.homeCity ?? pilot.homeStationName ?? "home"}
          outboundOptions={serializedOutbound}
          returnOptions={serializedReturn}
          initialOutboundIndex={initialOutboundIndex}
          initialReturnIndex={initialReturnIndex}
          alreadyCommitted={Boolean(offWindow.commitment)}
          initialBookingReference={offWindow.commitment?.bookingReference ?? ""}
        />
      )}
    </div>
  );
}
