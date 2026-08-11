import type {
  TrainOption,
  TrainProvider,
  TrainProviderCapabilities,
  TrainStation,
} from "@/lib/trains/TrainProvider";
import { STATIONS, YHT_ROUTES } from "@/lib/trains/data/yhtRoutes";
import { buildTurkeyDate } from "@/lib/time/turkeyTime";

export class StaticTrainProvider implements TrainProvider {
  /** A curated timetable knows nothing beyond approximate departure times. */
  readonly capabilities: TrainProviderCapabilities = {
    liveTimetable: false,
    fares: false,
    seatAvailability: false,
    booking: false,
  };

  listDestinationsFromIstanbul(): TrainStation[] {
    return YHT_ROUTES.filter((route) => route.originCode === "IST").map(
      (route) => STATIONS[route.destinationCode],
    );
  }

  async searchTrains(
    originCode: string,
    destinationCode: string,
    date: Date,
  ): Promise<TrainOption[]> {
    const route = YHT_ROUTES.find(
      (r) => r.originCode === originCode && r.destinationCode === destinationCode,
    );
    if (!route) return [];

    const turkeyMs = date.getTime() + 3 * 60 * 60_000;
    const shifted = new Date(turkeyMs);
    const year = shifted.getUTCFullYear();
    const monthIndex = shifted.getUTCMonth();
    const day = shifted.getUTCDate();

    return route.departureTimes.map((time, index) => {
      const [hour, minute] = time.split(":").map(Number);
      const departureAt = buildTurkeyDate(year, monthIndex, day, hour, minute);
      const arrivalAt = new Date(
        departureAt.getTime() + route.durationMinutes * 60_000,
      );
      return {
        trainNumber: `YHT${String(index + 1).padStart(2, "0")}`,
        originCode,
        destinationCode,
        departureAt,
        arrivalAt,
        durationMinutes: route.durationMinutes,
        source: "estimate",
      };
    });
  }
}
