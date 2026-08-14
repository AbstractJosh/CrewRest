import Link from "next/link";
import type { TimelineDay } from "@/lib/views/timelineLayout";

const HOUR_TICKS = [0, 6, 12, 18];

const BLOCK_TONES: Record<string, string> = {
  FLIGHT: "bg-ink text-paper",
  HSBY: "bg-ink-muted text-paper",
  DAYOFF: "bg-rule text-ink",
  window: "bg-ok-bg text-ok border border-ok",
};

export default function ScheduleTimeline({ days }: { days: TimelineDay[] }) {
  if (days.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-xl border border-rule bg-card p-4">
      <div className="min-w-[36rem]">
        <div className="mb-2 flex pl-16">
          {HOUR_TICKS.map((hour) => (
            <span
              key={hour}
              className="flex-1 font-mono text-[0.65rem] tabular-nums text-ink-faint"
            >
              {String(hour).padStart(2, "0")}:00
            </span>
          ))}
        </div>

        {days.map((day) => (
          <div key={day.date.toISOString()} className="flex items-center gap-2 py-1">
            <span className="w-14 shrink-0 font-mono text-[0.65rem] tabular-nums text-ink-faint">
              {day.label}
            </span>
            <div className="relative h-6 flex-1 rounded bg-sunken">
              {day.blocks.map((block) => {
                const style = {
                  left: `${block.startPercent}%`,
                  width: `${block.endPercent - block.startPercent}%`,
                };
                const className = `absolute inset-y-0 flex items-center overflow-hidden rounded px-1 font-mono text-[0.6rem] ${
                  BLOCK_TONES[block.type] ?? BLOCK_TONES.DAYOFF
                }`;

                return block.href ? (
                  <Link
                    key={`${block.id}-${block.startPercent}`}
                    href={block.href}
                    style={style}
                    className={className}
                    title={block.label}
                  >
                    {block.label}
                  </Link>
                ) : (
                  <span
                    key={`${block.id}-${block.startPercent}`}
                    style={style}
                    className={className}
                    title={block.label}
                  >
                    {block.label}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
