import {
  formatTurkeyDateTime,
  formatTurkeyRange,
  formatUtcRange,
  formatUtcTime,
} from "@/lib/time/turkeyTime";

const SIZES = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-xl",
} as const;

/**
 * Türkiye-local prominent, GMT faint beneath. This pairing was hand-written in six places and is
 * a standing project rule — one component makes it structural rather than remembered, and routes
 * every instance through the turkeyTime helpers so no caller touches a Date method directly.
 */
export default function TimeStack({
  at,
  to,
  size = "md",
}: {
  at: Date;
  /** Supply for a range; omit for a single instant. */
  to?: Date;
  size?: keyof typeof SIZES;
}) {
  const local = to ? formatTurkeyRange(at, to) : formatTurkeyDateTime(at);
  const utc = to ? formatUtcRange(at, to) : formatUtcTime(at);

  return (
    <span className="block">
      <span className={`block font-mono tabular-nums text-ink ${SIZES[size]}`}>{local}</span>
      <span className="mt-0.5 block font-mono text-xs tabular-nums text-ink-faint">
        {utc} GMT
      </span>
    </span>
  );
}
