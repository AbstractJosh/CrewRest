/**
 * Every commitment the server holds, grouped for the "My plans" page.
 *
 * Split the way the other view builders are — a pure `assemblePlansView` with a thin
 * `buildPlansView` around it — so the grouping and the label fallbacks are unit-tested without a
 * database.
 *
 * Nothing here calls the train provider. The trains were serialized into the commitment when the
 * pilot committed, and TCDD is unofficial enough that a failing request is the documented steady
 * state (CLAUDE.md → Trains); making a list page wait on it, for data already stored, would be a
 * bad trade. The consequence is that a card shows the timetable as it was at commit time.
 */

import { formatTurkeyRange } from "@/lib/time/turkeyTime";
import type { SerializedTrainOption } from "@/lib/trains/serialized";

export interface PlanCommitmentInput {
  windowId: string;
  crewId: string;
  pilotName: string;
  tripName: string | null;
  notes: string | null;
  bookingReference: string | null;
  cancelledAt: Date | null;
  /** The window's next report time — the trip is over when the pilot is due back. */
  windowEndAt: Date;
  outboundTrain: SerializedTrainOption;
  returnTrain: SerializedTrainOption;
}

export interface PlansViewInput {
  /** Injected, never read from the clock: the upcoming/past split must be deterministic. */
  now: Date;
  /** CrewRest station code → display name, e.g. `{ IST: "Istanbul" }`. */
  stationNames: Record<string, string>;
  commitments: PlanCommitmentInput[];
}

export interface PlanCardView {
  windowId: string;
  crewId: string;
  pilotName: string;
  /** `tripName` when set, otherwise the trip's own Türkiye-local date range. */
  title: string;
  tripName: string | null;
  notes: string | null;
  originLabel: string;
  destinationLabel: string;
  departureAt: Date;
  returnArrivalAt: Date;
  isTicketed: boolean;
  bookingReference: string | null;
  /** True when either stored leg came from the curated timetable rather than a live feed. */
  hasEstimates: boolean;
  isCancelled: boolean;
  href: string;
}

export interface PlansView {
  upcoming: PlanCardView[];
  past: PlanCardView[];
  cancelled: PlanCardView[];
  totalCount: number;
  /** False for the normal single-pilot case, where labelling every card would be noise. */
  showPilot: boolean;
}

function toCard(
  commitment: PlanCommitmentInput,
  stationNames: Record<string, string>,
): PlanCardView {
  const departureAt = new Date(commitment.outboundTrain.departureAt);
  const returnArrivalAt = new Date(commitment.returnTrain.arrivalAt);
  const label = (code: string) => stationNames[code] ?? code;

  return {
    windowId: commitment.windowId,
    crewId: commitment.crewId,
    pilotName: commitment.pilotName,
    title: commitment.tripName ?? formatTurkeyRange(departureAt, returnArrivalAt),
    tripName: commitment.tripName,
    notes: commitment.notes,
    originLabel: label(commitment.outboundTrain.originCode),
    destinationLabel: label(commitment.outboundTrain.destinationCode),
    departureAt,
    returnArrivalAt,
    isTicketed:
      commitment.bookingReference !== null && commitment.bookingReference.trim() !== "",
    bookingReference: commitment.bookingReference,
    hasEstimates:
      commitment.outboundTrain.source === "estimate" ||
      commitment.returnTrain.source === "estimate",
    isCancelled: commitment.cancelledAt !== null,
    href: `/pilot/${commitment.crewId}/window/${commitment.windowId}`,
  };
}

export function assemblePlansView(input: PlansViewInput): PlansView {
  const upcoming: PlanCardView[] = [];
  const past: PlanCardView[] = [];
  const cancelled: PlanCardView[] = [];

  for (const commitment of input.commitments) {
    const card = toCard(commitment, input.stationNames);
    if (commitment.cancelledAt !== null) {
      // Cancelled wins over the dates: a dropped trip is not "upcoming" however far off it is.
      cancelled.push(card);
    } else if (commitment.windowEndAt.getTime() < input.now.getTime()) {
      past.push(card);
    } else {
      upcoming.push(card);
    }
  }

  const soonestFirst = (a: PlanCardView, b: PlanCardView) =>
    a.departureAt.getTime() - b.departureAt.getTime();
  const mostRecentFirst = (a: PlanCardView, b: PlanCardView) =>
    b.departureAt.getTime() - a.departureAt.getTime();

  upcoming.sort(soonestFirst);
  past.sort(mostRecentFirst);
  cancelled.sort(mostRecentFirst);

  return {
    upcoming,
    past,
    cancelled,
    totalCount: input.commitments.length,
    showPilot: new Set(input.commitments.map((c) => c.crewId)).size > 1,
  };
}
