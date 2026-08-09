import type { ParsedDutyBlock } from "@/lib/pdf/scheduleParser";

export type OffWindowKind = "DAYOFF_BLOCK" | "DUTY_GAP";

export interface ComputedOffWindow {
  startAt: Date;
  endAt: Date;
  durationMinutes: number;
  kind: OffWindowKind;
  /**
   * False when either neighboring duty is a home-standby (HSBY) block: the
   * pilot must stay reachable near base for that duty, so committing to a
   * commute isn't advisable even though the time is technically off.
   */
  travelEligible: boolean;
}

const DEFAULT_MIN_DURATION_MINUTES = 24 * 60;

export function computeOffWindows(
  dutyBlocks: ParsedDutyBlock[],
  options: { minDurationMinutes?: number } = {},
): ComputedOffWindow[] {
  const minDurationMinutes =
    options.minDurationMinutes ?? DEFAULT_MIN_DURATION_MINUTES;

  const sorted = [...dutyBlocks].sort(
    (a, b) => a.startAt.getTime() - b.startAt.getTime(),
  );
  const busyBlocks = sorted.filter((b) => b.type !== "DAYOFF");
  const dayOffBlocks = sorted.filter((b) => b.type === "DAYOFF");

  const windows: ComputedOffWindow[] = [];

  for (let i = 0; i < busyBlocks.length - 1; i++) {
    const current = busyBlocks[i];
    const next = busyBlocks[i + 1];
    // Free time runs from duty release (MS) to the next report time (MB). Deliberately NOT
    // from the preceding duty's `restEndsAt` (DSB): minimum rest constrains when the airline
    // may roster the pilot again, not when the pilot may travel.
    const gapStart = current.endAt;
    const gapEnd = next.startAt;

    if (gapEnd.getTime() <= gapStart.getTime()) continue;

    const durationMinutes = Math.round(
      (gapEnd.getTime() - gapStart.getTime()) / 60_000,
    );
    if (durationMinutes < minDurationMinutes) continue;

    const overlapsDayOff = dayOffBlocks.some(
      (d) => d.startAt.getTime() < gapEnd.getTime() && d.endAt.getTime() > gapStart.getTime(),
    );
    const travelEligible = current.type !== "HSBY" && next.type !== "HSBY";

    windows.push({
      startAt: gapStart,
      endAt: gapEnd,
      durationMinutes,
      kind: overlapsDayOff ? "DAYOFF_BLOCK" : "DUTY_GAP",
      travelEligible,
    });
  }

  return windows;
}
