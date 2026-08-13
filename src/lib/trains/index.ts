import { StaticTrainProvider } from "@/lib/trains/StaticTrainProvider";
import { FallbackTrainProvider } from "@/lib/trains/FallbackTrainProvider";
import { TcddTrainProvider, readTcddConfigFromEnv } from "@/lib/trains/TcddTrainProvider";
import type { TrainProvider } from "@/lib/trains/TrainProvider";

const staticProvider = new StaticTrainProvider();

/**
 * Live TCDD data, with the curated timetable standing by.
 *
 * The live path needs no credential and no configuration — the endpoint is known and the token is
 * scraped at runtime — so it is on by default. It is also unofficial and may fail at any time,
 * which is exactly what `FallbackTrainProvider` is for: a failed request degrades to estimates,
 * and the `source` on each `TrainOption` tells the UI which one answered.
 */
export const trainProvider: TrainProvider = new FallbackTrainProvider(
  new TcddTrainProvider(readTcddConfigFromEnv()),
  staticProvider,
);

export type {
  TrainOption,
  TrainStation,
  TrainProvider,
  TrainFare,
  TrainDataSource,
  TrainProviderCapabilities,
} from "@/lib/trains/TrainProvider";
export { searchTrainsInWindow } from "@/lib/trains/searchWindow";
export { buildBookingUrl } from "@/lib/trains/booking";
export type { SerializedTrainOption } from "@/lib/trains/serialized";
export {
  serializeTrainOption,
  toDatedTrainOption,
  findCommittedIndex,
} from "@/lib/trains/serialized";
