import type { TrainOption } from "@/lib/trains/TrainProvider";

export interface CommuteFeasibility {
  /** Minutes waited at the station between being free to travel and the outbound departing. */
  bufferBeforeOutboundMinutes: number;
  /** Minutes between the return train's arrival and the latest arrival that still makes report time. */
  bufferAfterReturnMinutes: number;
  /** Minutes actually spent at the home city, between outbound arrival and return departure. */
  netTimeAtHomeMinutes: number;
  /** False if the timing doesn't physically work (e.g. train arrives after the next duty starts). */
  isFeasible: boolean;
  warnings: string[];
}

const LOW_NET_TIME_WARNING_THRESHOLD_MINUTES = 2 * 60;
/** Beyond this the pilot would go home and come back rather than sit at the station. */
const LONG_STATION_WAIT_MINUTES = 2 * 60;

/**
 * Evaluates a chosen outbound/return pair against the *travel* window — which already has the
 * airport↔station transfer subtracted at both ends (see `computeTravelWindow`). So the
 * transfer time is deliberately not re-applied here; doing so would double-count it.
 */
export function evaluateCommuteFeasibility(
  travelWindow: { startAt: Date; latestReturnArrivalAt: Date },
  outboundTrain: TrainOption,
  returnTrain: TrainOption,
): CommuteFeasibility {
  const bufferBeforeOutboundMinutes = Math.round(
    (outboundTrain.departureAt.getTime() - travelWindow.startAt.getTime()) / 60_000,
  );
  const bufferAfterReturnMinutes = Math.round(
    (travelWindow.latestReturnArrivalAt.getTime() - returnTrain.arrivalAt.getTime()) / 60_000,
  );
  const netTimeAtHomeMinutes = Math.round(
    (returnTrain.departureAt.getTime() - outboundTrain.arrivalAt.getTime()) / 60_000,
  );

  const warnings: string[] = [];

  if (bufferBeforeOutboundMinutes < 0) {
    warnings.push("This outbound train leaves before you can get to the station.");
  } else if (bufferBeforeOutboundMinutes > LONG_STATION_WAIT_MINUTES) {
    warnings.push(
      "You'd be free more than 2 hours before this train departs — worth going home first rather than waiting at the station.",
    );
  }
  if (bufferAfterReturnMinutes < 0) {
    warnings.push(
      "This return train doesn't get you back with enough time to reach the airport before report.",
    );
  }
  if (netTimeAtHomeMinutes <= 0) {
    warnings.push("The return train departs before the outbound train even arrives.");
  } else if (netTimeAtHomeMinutes < LOW_NET_TIME_WARNING_THRESHOLD_MINUTES) {
    warnings.push("Very little time actually at home — may not be worth the trip.");
  }

  const isFeasible =
    bufferBeforeOutboundMinutes >= 0 &&
    bufferAfterReturnMinutes >= 0 &&
    netTimeAtHomeMinutes > 0;

  return {
    bufferBeforeOutboundMinutes,
    bufferAfterReturnMinutes,
    netTimeAtHomeMinutes,
    isFeasible,
    warnings,
  };
}
