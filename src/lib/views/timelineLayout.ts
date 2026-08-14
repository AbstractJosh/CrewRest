import { formatTurkeyDateLabel, turkeyMidnight } from "@/lib/time/turkeyTime";

const DAY_MS = 24 * 60 * 60_000;

export interface TimelineSpanInput {
  id: string;
  startAt: Date;
  endAt: Date;
  label: string;
}

export interface TimelineDutyInput extends TimelineSpanInput {
  type: string;
}

export interface TimelineWindowInput extends TimelineSpanInput {
  href: string;
}

export interface TimelineInput {
  duties: TimelineDutyInput[];
  windows: TimelineWindowInput[];
}

export interface TimelineBlock {
  id: string;
  kind: "duty" | "window";
  /** Duty type (FLIGHT/HSBY/DAYOFF) for duties; "window" for windows. */
  type: string;
  label: string;
  /** 0–100, percent across the day from Türkiye-local midnight. */
  startPercent: number;
  endPercent: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
  href?: string;
}

export interface TimelineDay {
  /** Türkiye-local midnight for this row, as a UTC instant. */
  date: Date;
  label: string;
  blocks: TimelineBlock[];
}

/**
 * Clip an absolute span to one day row.
 *
 * Works in absolute milliseconds from the row's Türkiye midnight rather than deriving local
 * clock components, so the host's zone never enters the arithmetic. Türkiye has no DST, so a day
 * is always exactly 24h and `+ DAY_MS` is a safe way to step to the next row.
 */
function clipToDay(startAt: Date, endAt: Date, dayStartMs: number) {
  const dayEndMs = dayStartMs + DAY_MS;
  const from = Math.max(startAt.getTime(), dayStartMs);
  const to = Math.min(endAt.getTime(), dayEndMs);
  if (to <= from) return null;

  return {
    startPercent: ((from - dayStartMs) / DAY_MS) * 100,
    endPercent: ((to - dayStartMs) / DAY_MS) * 100,
    continuesBefore: startAt.getTime() < dayStartMs,
    continuesAfter: endAt.getTime() > dayEndMs,
  };
}

export function buildTimeline(input: TimelineInput): TimelineDay[] {
  const spans = [
    ...input.duties.map((duty) => ({ ...duty, kind: "duty" as const, type: duty.type, href: undefined })),
    ...input.windows.map((window) => ({
      ...window,
      kind: "window" as const,
      type: "window",
      href: window.href,
    })),
  ].filter((span) => span.endAt.getTime() > span.startAt.getTime());

  if (spans.length === 0) return [];

  const firstMs = Math.min(...spans.map((span) => span.startAt.getTime()));
  // The last row is the day the final span *ends* on; a span ending exactly at midnight belongs
  // to the day before, so step back a millisecond before asking which day that is.
  const lastMs = Math.max(...spans.map((span) => span.endAt.getTime() - 1));

  const days: TimelineDay[] = [];
  for (
    let dayStartMs = turkeyMidnight(new Date(firstMs)).getTime();
    dayStartMs <= turkeyMidnight(new Date(lastMs)).getTime();
    dayStartMs += DAY_MS
  ) {
    const date = new Date(dayStartMs);
    const blocks: TimelineBlock[] = [];

    for (const span of spans) {
      const clipped = clipToDay(span.startAt, span.endAt, dayStartMs);
      if (!clipped) continue;
      blocks.push({
        id: span.id,
        kind: span.kind,
        type: span.type,
        label: span.label,
        href: span.href,
        ...clipped,
      });
    }

    blocks.sort((a, b) => a.startPercent - b.startPercent);
    days.push({ date, label: formatTurkeyDateLabel(date), blocks });
  }

  return days;
}
