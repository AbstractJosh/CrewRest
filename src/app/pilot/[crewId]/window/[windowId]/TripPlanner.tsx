"use client";

import { useMemo, useState } from "react";
import { evaluateCommuteFeasibility } from "@/lib/trains/commuteFeasibility";
import { formatDurationMinutes } from "@/lib/time/turkeyTime";
import { toDatedTrainOption } from "@/lib/trains/serialized";
import type { SerializedTrainOption } from "@/lib/trains/serialized";
import { Ticket, TicketBody, Perforation, TicketStub } from "@/components/ui/Ticket";
import { Stamp } from "@/components/ui/Stamp";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Field, TextInput } from "@/components/ui/Field";
import SourceNote from "@/components/domain/SourceNote";
import TrainPicker from "@/components/domain/TrainPicker";

export type { SerializedTrainOption };

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
      <div className="mt-6">
        <Callout tone="warn">
          No {outboundOptions.length === 0 ? "outbound" : "return"} trains to {homeCity} fit inside
          this off-window.
        </Callout>
      </div>
    );
  }

  return (
    <div className="mt-6 flex flex-col gap-4">
      <Ticket>
        <TicketBody className="flex flex-col gap-5">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <TrainPicker
              label={
                <>
                  Outbound to {homeCity}{" "}
                  <span className="font-normal text-ink-muted">(local time)</span>
                </>
              }
              options={outboundOptions}
              selectedIndex={outboundIndex}
              onSelect={setOutboundIndex}
            />
            <TrainPicker
              label={
                <>
                  Return to Istanbul{" "}
                  <span className="font-normal text-ink-muted">(local time)</span>
                </>
              }
              options={returnOptions}
              selectedIndex={returnIndex}
              onSelect={setReturnIndex}
            />
          </div>

          <Field
            label={
              <>
                PNR / booking reference{" "}
                <span className="font-normal text-ink-muted">
                  (optional — paste it back once you&apos;ve bought on TCDD)
                </span>
              </>
            }
            htmlFor="booking-reference"
          >
            <TextInput
              id="booking-reference"
              value={bookingReference}
              onChange={(e) => setBookingReference(e.target.value)}
              placeholder="e.g. 1234567890"
              className="max-w-xs font-mono"
            />
          </Field>
        </TicketBody>

        <Perforation />

        {feasibility && (
          <TicketStub className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-ink-faint">
                Time at home
              </p>
              <p className="font-mono text-xl tabular-nums text-ink">
                {formatDurationMinutes(feasibility.netTimeAtHomeMinutes)}
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                {formatDurationMinutes(feasibility.bufferBeforeOutboundMinutes)} waiting before the
                outbound departs · {formatDurationMinutes(feasibility.bufferAfterReturnMinutes)} to
                spare on the way back
              </p>
            </div>
            <Stamp tone={feasibility.isFeasible ? "ok" : "danger"}>
              {feasibility.isFeasible ? "Fits" : "Does not fit"}
            </Stamp>
          </TicketStub>
        )}
      </Ticket>

      {feasibility && feasibility.warnings.length > 0 && (
        <Callout tone="warn">
          <ul className="list-disc pl-5">
            {feasibility.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Callout>
      )}

      {error && <Callout tone="danger">{error}</Callout>}

      <Button onClick={handleCommit} disabled={isSaving || !feasibility?.isFeasible} className="self-start">
        {committed ? "Update commitment" : isSaving ? "Saving…" : "Commit to this commute"}
      </Button>

      {committed && (
        <p className="text-sm text-ok">
          {bookingReference.trim()
            ? `Ticketed — booking reference ${bookingReference.trim()}.`
            : "You're committed to this trip — buy the tickets on TCDD to lock it in."}
        </p>
      )}

      <SourceNote hasEstimates={hasEstimates} />
    </div>
  );
}
