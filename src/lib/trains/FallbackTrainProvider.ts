/**
 * Runs a primary provider with a second one standing by.
 *
 * The live TCDD endpoint is unofficial: it can rate-limit, change shape, or disappear without
 * notice. None of that should cost the pilot the planner — a page that renders approximate times
 * clearly labelled as estimates is far more useful than one that 500s. So a throw from the
 * primary falls through to the curated timetable, and the `source` already carried on each
 * `TrainOption` lets the UI say which one answered.
 */

import type {
  TrainOption,
  TrainProvider,
  TrainProviderCapabilities,
  TrainStation,
} from "@/lib/trains/TrainProvider";

export class FallbackTrainProvider implements TrainProvider {
  /** Logged once per process — a repeatedly-unreachable endpoint shouldn't flood the console. */
  private hasLoggedFailure = false;

  constructor(
    private readonly primary: TrainProvider,
    private readonly fallback: TrainProvider,
  ) {}

  /**
   * The primary's, since it is what normally answers. A caller reading these is deciding how hard
   * to work (how many days to request, whether to show a price column), and over-preparing for a
   * fallback that may never be used is the wrong default.
   */
  get capabilities(): TrainProviderCapabilities {
    return this.primary.capabilities;
  }

  listDestinationsFromIstanbul(): TrainStation[] {
    const destinations = this.primary.listDestinationsFromIstanbul();
    return destinations.length > 0
      ? destinations
      : this.fallback.listDestinationsFromIstanbul();
  }

  async searchTrains(
    originCode: string,
    destinationCode: string,
    date: Date,
  ): Promise<TrainOption[]> {
    try {
      return await this.primary.searchTrains(originCode, destinationCode, date);
    } catch (error) {
      if (!this.hasLoggedFailure) {
        this.hasLoggedFailure = true;
        console.warn(
          "[trains] Live provider failed; falling back to the curated timetable.",
          error,
        );
      }
      return this.fallback.searchTrains(originCode, destinationCode, date);
    }
  }
}
