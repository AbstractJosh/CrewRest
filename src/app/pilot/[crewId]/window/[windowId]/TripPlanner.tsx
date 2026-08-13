"use client";

import { useMemo, useState } from "react";
import { evaluateCommuteFeasibility } from "@/lib/trains/commuteFeasibility";
import { formatDurationMinutes, formatTurkeyRange } from "@/lib/time/turkeyTime";
import { toDatedTrainOption } from "@/lib/trains/serialized";
import type { TrainFare } from "@/lib/trains/TrainProvider";
import type { SerializedTrainOption } from "@/lib/trains/serialized";

export type { SerializedTrainOption };

function cheapestFare(option: SerializedTrainOption): TrainFare | null {
  if (!option.fares || option.fares.length === 0) return null;
  return option.fares.reduce((cheapest, fare) =>
    fare.priceMinor < cheapest.priceMinor ? fare : cheapest,
  );
}

/** Exact to the kuruş — rounding a ₺450,50 fare to ₺451 misstates what the ticket costs. */
function formatPrice(fare: TrainFare): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: fare.currency,
  }).format(fare.priceMinor / 100);
}

/**
 * One `<option>` label. Price and seats-left only appear when the provider supplied them, so the
 * same component renders live data and curated estimates without branching on the source.
 */
function optionLabel(option: SerializedTrainOption): string {
  const parts = [
    formatTurkeyRange(new Date(option.departureAt), new Date(option.arrivalAt)),
    `(${formatDurationMinutes(option.durationMinutes)})`,
  ];

  const fare = cheapestFare(option);
  if (fare) parts.push(`· ${formatPrice(fare)}`);

  if (option.availableSeats !== undefined && option.availableSeats <= 10) {
    parts.push(`· ${option.availableSeats} seats left`);
  }

  return parts.join(" ");
}

function TrainSelect({
  label,
  options,
  selectedIndex,
  onSelect,
}: {
  label: React.ReactNode;
  options: SerializedTrainOption[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}) {
  const selected = options[selectedIndex];

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{label}</span>
        <select
          value={selectedIndex}
          onChange={(e) => onSelect(Number(e.target.value))}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          {options.map((option, index) => (
            <option key={option.trainNumber + option.departureAt} value={index}>
              {optionLabel(option)}
            </option>
          ))}
        </select>
      </label>
      {selected && (
        <a
          href={selected.bookingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="self-start text-sm font-medium text-zinc-600 underline underline-offset-4 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          Buy on TCDD ↗
        </a>
      )}
    </div>
  );
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
  initialBookingReference,
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
  /** PNR previously pasted back after buying on TCDD, if any. */
  initialBookingReference: string;
}) {
  const [outboundIndex, setOutboundIndex] = useState(initialOutboundIndex);
  const [returnIndex, setReturnIndex] = useState(initialReturnIndex);
  const [bookingReference, setBookingReference] = useState(initialBookingReference);
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
    return evaluateCommuteFeasibility(
      travelWindow,
      toDatedTrainOption(outbound),
      toDatedTrainOption(returnTrain),
    );
  }, [travelWindow, outbound, returnTrain]);

  // Estimates and live data can mix: the live provider may answer for one direction and fail
  // over to the curated timetable for the other. Say so only when something shown is estimated.
  const hasEstimates = [...outboundOptions, ...returnOptions].some(
    (option) => option.source === "estimate",
  );

  async function handleCommit() {
    if (!outbound || !returnTrain) return;
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/off-windows/${windowId}/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outbound,
          return: returnTrain,
          bookingReference: bookingReference.trim() || null,
        }),
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
        <TrainSelect
          label={
            <>
              Outbound to {homeCity}{" "}
              <span className="font-normal text-zinc-500 dark:text-zinc-400">(local time)</span>
            </>
          }
          options={outboundOptions}
          selectedIndex={outboundIndex}
          onSelect={setOutboundIndex}
        />

        <TrainSelect
          label={
            <>
              Return to Istanbul{" "}
              <span className="font-normal text-zinc-500 dark:text-zinc-400">(local time)</span>
            </>
          }
          options={returnOptions}
          selectedIndex={returnIndex}
          onSelect={setReturnIndex}
        />
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

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          PNR / booking reference{" "}
          <span className="font-normal text-zinc-500 dark:text-zinc-400">
            (optional — paste it back once you&apos;ve bought on TCDD)
          </span>
        </span>
        <input
          value={bookingReference}
          onChange={(e) => setBookingReference(e.target.value)}
          placeholder="e.g. 1234567890"
          className="max-w-xs rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>

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
          {bookingReference.trim()
            ? `Ticketed — booking reference ${bookingReference.trim()}.`
            : "You're committed to this trip — buy the tickets on TCDD to lock it in."}
        </p>
      )}

      <p className="text-xs text-zinc-500 dark:text-zinc-500">
        {hasEstimates
          ? "Some times shown are approximate planning estimates, not a live feed — confirm exact times and book on ebilet.tcddtasimacilik.gov.tr."
          : "Live TCDD times and fares. Seat availability can change between loading this page and paying."}
      </p>
    </div>
  );
}
