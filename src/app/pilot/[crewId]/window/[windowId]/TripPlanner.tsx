"use client";

import { useMemo, useState } from "react";
import { evaluateCommuteFeasibility } from "@/lib/trains/commuteFeasibility";
import { formatDurationMinutes, formatTurkeyRange } from "@/lib/time/turkeyTime";

export interface SerializedTrainOption {
  trainNumber: string;
  originCode: string;
  destinationCode: string;
  departureAt: string;
  arrivalAt: string;
  durationMinutes: number;
}

function toDated(option: SerializedTrainOption) {
  return {
    ...option,
    departureAt: new Date(option.departureAt),
    arrivalAt: new Date(option.arrivalAt),
  };
}

export default function TripPlanner({
  windowId,
  windowStart,
  latestReturnArrival,
  homeCity,
  outboundOptions,
  returnOptions,
  initialOutboundIndex,
  initialReturnIndex,
  alreadyCommitted,
}: {
  windowId: string;
  /** Earliest the pilot can be at the station — duty release plus their transfer time. */
  windowStart: string;
  /** Latest a return train may arrive and still leave time to reach the airport. */
  latestReturnArrival: string;
  homeCity: string;
  outboundOptions: SerializedTrainOption[];
  returnOptions: SerializedTrainOption[];
  initialOutboundIndex: number;
  initialReturnIndex: number;
  alreadyCommitted: boolean;
}) {
  const [outboundIndex, setOutboundIndex] = useState(initialOutboundIndex);
  const [returnIndex, setReturnIndex] = useState(initialReturnIndex);
  const [isSaving, setIsSaving] = useState(false);
  const [committed, setCommitted] = useState(alreadyCommitted);
  const [error, setError] = useState<string | null>(null);

  const travelWindow = useMemo(
    () => ({
      startAt: new Date(windowStart),
      latestReturnArrivalAt: new Date(latestReturnArrival),
    }),
    [windowStart, latestReturnArrival],
  );

  const outbound = outboundOptions[outboundIndex];
  const returnTrain = returnOptions[returnIndex];

  const feasibility = useMemo(() => {
    if (!outbound || !returnTrain) return null;
    return evaluateCommuteFeasibility(travelWindow, toDated(outbound), toDated(returnTrain));
  }, [travelWindow, outbound, returnTrain]);

  async function handleCommit() {
    if (!outbound || !returnTrain) return;
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/off-windows/${windowId}/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outbound, return: returnTrain }),
      });
      if (!response.ok) {
        const data = await response.json();
        setError(data.error ?? "Could not save this commitment.");
        return;
      }
      setCommitted(true);
    } finally {
      setIsSaving(false);
    }
  }

  if (outboundOptions.length === 0 || returnOptions.length === 0) {
    return (
      <p className="mt-6 rounded-lg border border-zinc-200 bg-white p-5 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
        No {outboundOptions.length === 0 ? "outbound" : "return"} trains to{" "}
        {homeCity} fit inside this off-window.
      </p>
    );
  }

  return (
    <div className="mt-6 flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
            Outbound to {homeCity}{" "}
            <span className="font-normal text-zinc-500 dark:text-zinc-400">(local time)</span>
          </span>
          <select
            value={outboundIndex}
            onChange={(e) => setOutboundIndex(Number(e.target.value))}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            {outboundOptions.map((option, index) => (
              <option key={option.trainNumber + option.departureAt} value={index}>
                {formatTurkeyRange(
                  new Date(option.departureAt),
                  new Date(option.arrivalAt),
                )}{" "}
                ({formatDurationMinutes(option.durationMinutes)})
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
            Return to Istanbul{" "}
            <span className="font-normal text-zinc-500 dark:text-zinc-400">(local time)</span>
          </span>
          <select
            value={returnIndex}
            onChange={(e) => setReturnIndex(Number(e.target.value))}
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            {returnOptions.map((option, index) => (
              <option key={option.trainNumber + option.departureAt} value={index}>
                {formatTurkeyRange(
                  new Date(option.departureAt),
                  new Date(option.arrivalAt),
                )}{" "}
                ({formatDurationMinutes(option.durationMinutes)})
              </option>
            ))}
          </select>
        </label>
      </div>

      {feasibility && (
        <div
          className={`rounded-lg border p-4 text-sm ${
            feasibility.isFeasible
              ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40"
              : "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40"
          }`}
        >
          <p className="font-medium text-zinc-900 dark:text-zinc-100">
            Time at home: {formatDurationMinutes(feasibility.netTimeAtHomeMinutes)}
          </p>
          <p className="mt-1 text-zinc-600 dark:text-zinc-400">
            {formatDurationMinutes(feasibility.bufferBeforeOutboundMinutes)} waiting before
            the outbound departs ·{" "}
            {formatDurationMinutes(feasibility.bufferAfterReturnMinutes)} to spare on the
            way back
          </p>
          {feasibility.warnings.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-amber-700 dark:text-amber-400">
              {feasibility.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <button
        onClick={handleCommit}
        disabled={isSaving || !feasibility?.isFeasible}
        className="self-start rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
      >
        {committed
          ? "Update commitment"
          : isSaving
            ? "Saving..."
            : "Commit to this commute"}
      </button>
      {committed && (
        <p className="text-sm text-emerald-700 dark:text-emerald-400">
          You&apos;re committed to this trip.
        </p>
      )}

      <p className="text-xs text-zinc-500 dark:text-zinc-500">
        Train times are approximate planning estimates, not a live feed —
        confirm exact times and book on ebilet.tcddtasimacilik.gov.tr.
      </p>
    </div>
  );
}
