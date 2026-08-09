export interface TrainStation {
  code: string;
  name: string;
  city: string;
}

export interface TrainOption {
  trainNumber: string;
  originCode: string;
  destinationCode: string;
  departureAt: Date;
  arrivalAt: Date;
  durationMinutes: number;
}

export interface TrainProvider {
  /** Cities reachable from the Istanbul base by a direct YHT service. */
  listDestinationsFromIstanbul(): TrainStation[];
  searchTrains(
    originCode: string,
    destinationCode: string,
    date: Date,
  ): Promise<TrainOption[]>;
}
