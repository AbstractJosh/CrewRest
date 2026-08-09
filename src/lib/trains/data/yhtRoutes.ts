import type { TrainStation } from "@/lib/trains/TrainProvider";

/**
 * Curated, approximate YHT (Yuksek Hizli Tren) timetable data.
 *
 * Live TCDD integration was attempted and is currently blocked (see the
 * CrewRest implementation plan for the investigation): the legacy public
 * endpoint is dead, and the current one sits behind bot protection that
 * rejects server-to-server requests even with a valid-looking token pulled
 * from TCDD's own production frontend. Until a live/scraped provider can be
 * built, this static dataset stands in behind the same TrainProvider
 * interface.
 *
 * Departure times and durations here are reasonable approximations of the
 * real Istanbul-anchored YHT network, NOT a live feed. Treat them as
 * planning estimates only — always confirm exact times on
 * ebilet.tcddtasimacilik.gov.tr before committing to a trip.
 */

export const STATIONS: Record<string, TrainStation> = {
  IST: { code: "IST", name: "Istanbul (Sogutlucesme)", city: "Istanbul" },
  ANK: { code: "ANK", name: "Ankara Gar", city: "Ankara" },
  KNY: { code: "KNY", name: "Konya", city: "Konya" },
  ESK: { code: "ESK", name: "Eskisehir", city: "Eskisehir" },
  KRM: { code: "KRM", name: "Karaman", city: "Karaman" },
};

export interface YhtRoute {
  originCode: string;
  destinationCode: string;
  durationMinutes: number;
  /** Local (Turkey) departure times, "HH:MM", one entry per daily train. */
  departureTimes: string[];
}

export const YHT_ROUTES: YhtRoute[] = [
  {
    originCode: "IST",
    destinationCode: "ANK",
    durationMinutes: 4 * 60 + 30,
    departureTimes: [
      "06:30",
      "08:00",
      "09:30",
      "11:00",
      "13:00",
      "15:00",
      "17:00",
      "18:30",
      "20:00",
      "21:30",
    ],
  },
  {
    originCode: "ANK",
    destinationCode: "IST",
    durationMinutes: 4 * 60 + 30,
    departureTimes: [
      "06:30",
      "08:00",
      "09:30",
      "11:00",
      "13:00",
      "15:00",
      "17:00",
      "18:30",
      "20:00",
      "21:30",
    ],
  },
  {
    originCode: "IST",
    destinationCode: "ESK",
    durationMinutes: 2 * 60,
    departureTimes: [
      "06:30",
      "08:00",
      "09:30",
      "11:00",
      "13:00",
      "15:00",
      "17:00",
      "18:30",
      "20:00",
      "21:30",
    ],
  },
  {
    originCode: "ESK",
    destinationCode: "IST",
    durationMinutes: 2 * 60,
    departureTimes: [
      "06:30",
      "08:00",
      "09:30",
      "11:00",
      "13:00",
      "15:00",
      "17:00",
      "18:30",
      "20:00",
      "21:30",
    ],
  },
  {
    originCode: "IST",
    destinationCode: "KNY",
    durationMinutes: 4 * 60 + 15,
    departureTimes: ["07:15", "13:15", "18:45"],
  },
  {
    originCode: "KNY",
    destinationCode: "IST",
    durationMinutes: 4 * 60 + 15,
    departureTimes: ["07:00", "13:30", "19:00"],
  },
  {
    originCode: "IST",
    destinationCode: "KRM",
    durationMinutes: 5 * 60 + 15,
    departureTimes: ["07:15", "18:45"],
  },
  {
    originCode: "KRM",
    destinationCode: "IST",
    durationMinutes: 5 * 60 + 15,
    departureTimes: ["06:15", "17:45"],
  },
];
