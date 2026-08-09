import { StaticTrainProvider } from "@/lib/trains/StaticTrainProvider";
import type { TrainProvider } from "@/lib/trains/TrainProvider";

export const trainProvider: TrainProvider = new StaticTrainProvider();

export type { TrainOption, TrainStation, TrainProvider } from "@/lib/trains/TrainProvider";
export { searchTrainsInWindow } from "@/lib/trains/searchWindow";
