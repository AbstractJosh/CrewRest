export interface TrainStation {
  code: string;
  name: string;
  city: string;
}

export interface TrainFare {
  /** Cabin/seat class as the provider names it, e.g. "Ekonomi", "Business". */
  className: string;
  /** Price in the currency's minor unit (kuruş) — integers avoid float drift. */
  priceMinor: number;
  currency: string;
  /** Seats left in this class, when the provider reports it. */
  availableSeats?: number;
}

export interface TrainOption {
  trainNumber: string;
  originCode: string;
  destinationCode: string;
  departureAt: Date;
  arrivalAt: Date;
  durationMinutes: number;
  /**
   * Whether this came off a live feed or the curated timetable. Carried on the option itself so
   * it survives serialization to the client and into a stored commitment.
   */
  source: TrainDataSource;
  /** The provider's own identifier — stable across timetable edits, unlike a synthesized number. */
  providerTrainId?: string;
  fares?: TrainFare[];
  /** Seats left across all classes. */
  availableSeats?: number;
  isSoldOut?: boolean;
}

export type TrainDataSource = "live" | "estimate";

/**
 * What a provider can actually answer. TCDD has no official API, so a live provider's real
 * surface isn't known until it's pointed at something — the UI reads these flags rather than
 * assuming, and degrades when one is false.
 */
export interface TrainProviderCapabilities {
  liveTimetable: boolean;
  fares: boolean;
  seatAvailability: boolean;
  /** Creating a real reservation. False means buying happens by handing off to ebilet. */
  booking: boolean;
}

export interface TrainProvider {
  readonly capabilities: TrainProviderCapabilities;
  /** Cities reachable from the Istanbul base by a direct YHT service. */
  listDestinationsFromIstanbul(): TrainStation[];
  searchTrains(
    originCode: string,
    destinationCode: string,
    date: Date,
  ): Promise<TrainOption[]>;
}
