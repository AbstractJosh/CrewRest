import Link from "next/link";
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
import MinOffHoursControl from "./MinOffHoursControl";
import TransferBufferControl from "./TransferBufferControl";

const DUTY_TYPE_LABEL: Record<string, string> = {
  FLIGHT: "Flight duty",
  HSBY: "Home standby",
  DAYOFF: "Day off",
};

function OffWindowCard({
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
    <li className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-medium text-zinc-900 dark:text-zinc-100">
            {formatTurkeyRange(travel.startAt, travel.endAt)}
          </p>
          <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
            {formatUtcRange(travel.startAt, travel.endAt)} GMT
          </p>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {formatDurationMinutes(travel.minutes)} to travel
            {!window.travelEligible && (
              <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                adjacent to standby
              </span>
            )}
          </p>
          <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
            duty ends {formatTurkeyDateTime(window.dutyEndsAt)} ·{" "}
            {formatDurationMinutes(transferMinutes)} to reach the station
          </p>
        </div>
        <Link
          href={`/pilot/${crewId}/window/${window.id}`}
          className="shrink-0 rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          Plan trip
        </Link>
      </div>
    </li>
  );
}

function DutyPeriodCard({ duty }: { duty: ScheduleDutyView }) {
  return (
    <li className="rounded-md border border-zinc-100 px-4 py-3 text-sm dark:border-zinc-900">
      <p className="font-medium text-zinc-800 dark:text-zinc-200">
        {formatTurkeyRange(duty.startAt, duty.endAt)}
      </p>
      <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
        {formatUtcRange(duty.startAt, duty.endAt)} GMT
      </p>
      <p className="mt-1 text-zinc-500 dark:text-zinc-400">
        {DUTY_TYPE_LABEL[duty.type] ?? duty.type} · {duty.rawCode}
      </p>

      {duty.flightLegs.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1.5">
          {duty.flightLegs.map((leg, i) => (
            <li key={i}>
              <span className="text-zinc-700 dark:text-zinc-300">
                {leg.flightNumber} {leg.origin}/{leg.departureTime} →{" "}
                {leg.destination}/{leg.arrivalTime}
              </span>
              {leg.departureTimeUtc && leg.arrivalTimeUtc && (
                <span className="block text-xs text-zinc-400 dark:text-zinc-500">
                  {leg.departureTimeUtc} → {leg.arrivalTimeUtc} GMT
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
    <div className="mx-auto w-full max-w-3xl px-6 py-12">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            {view.name}
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Crew ID {view.crewId}
            {view.aircraftType ? ` · ${view.aircraftType}` : ""}
            {view.period ? ` · ${view.period}` : ""}
          </p>
        </div>
        <Link
          href="/"
          className="text-sm font-medium text-zinc-600 underline underline-offset-4 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          Upload new schedule
        </Link>
      </div>

      {!view.hasSchedule ? (
        <p className="mt-8 text-zinc-600 dark:text-zinc-400">
          No schedule uploaded yet.
        </p>
      ) : (
        <>
          <section className="mt-10">
            <h2 className="text-lg font-medium text-zinc-950 dark:text-zinc-50">
              Commute opportunities
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Windows are measured from when you can actually be moving — duty release plus
              your transfer time — to your next report time. Türkiye local; GMT underneath.
            </p>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <MinOffHoursControl crewId={crewId} initialMinOffHours={view.minOffHours} />
              <TransferBufferControl
                crewId={crewId}
                initialMinutes={view.airportTransferMinutes}
              />
            </div>

            {shownWindows.length === 0 ? (
              <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
                No off-periods meet your {view.minOffHours}h threshold this period.
              </p>
            ) : (
              <ul className="mt-4 flex flex-col gap-3">
                {shownWindows.map((window) => (
                  <OffWindowCard
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
                <summary className="cursor-pointer text-sm font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200">
                  {hiddenWindows.length} shorter break
                  {hiddenWindows.length === 1 ? "" : "s"} below your threshold
                </summary>
                <ul className="mt-3 flex flex-col gap-3">
                  {hiddenWindows.map((window) => (
                    <OffWindowCard
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
            <h2 className="text-lg font-medium text-zinc-950 dark:text-zinc-50">
              Full schedule
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Duty spans run report → release, in Türkiye local time. Flight legs are local at
              each station.
            </p>
            <ul className="mt-4 flex flex-col gap-2">
              {view.dutyPeriods.map((duty) => (
                <DutyPeriodCard key={duty.id} duty={duty} />
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
