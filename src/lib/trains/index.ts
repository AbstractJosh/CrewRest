import { StaticTrainProvider } from "@/lib/trains/StaticTrainProvider";
import { FallbackTrainProvider } from "@/lib/trains/FallbackTrainProvider";
import { TcddTrainProvider, readTcddConfigFromEnv } from "@/lib/trains/TcddTrainProvider";
import type { TrainProvider } from "@/lib/trains/TrainProvider";

const staticProvider = new StaticTrainProvider();
const tcddConfig = readTcddConfigFromEnv();

/**
 * Live TCDD data when it's configured, the curated timetable otherwise — and the curated
 * timetable again if the live endpoint fails mid-request. Without `TCDD_API_BASE_URL` set, the
 * app behaves exactly as it did before the integration existed.
 */
export const trainProvider: TrainProvider = tcddConfig
  ? new FallbackTrainProvider(new TcddTrainProvider(tcddConfig), staticProvider)
  : staticProvider;

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
