/**
 * The signature element: `IST ●────────● ESK`. Codes are shown as-is in caps — callers pass
 * station codes, not city names, so the line stays short enough to survive a narrow column.
 */
export default function RouteLine({
  from,
  to,
  middle,
}: {
  from: string;
  to: string;
  /** Optional centred label, e.g. the journey duration. */
  middle?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="font-mono text-sm font-semibold uppercase tracking-[0.14em] text-ink">
        {from}
      </span>
      <span className="flex flex-1 items-center gap-1.5">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ink-muted" aria-hidden="true" />
        <span className="h-px flex-1 bg-rule" aria-hidden="true" />
        {middle && <span className="font-mono text-xs text-ink-faint">{middle}</span>}
        <span className="h-px flex-1 bg-rule" aria-hidden="true" />
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ink-muted" aria-hidden="true" />
      </span>
      <span className="font-mono text-sm font-semibold uppercase tracking-[0.14em] text-ink">
        {to}
      </span>
    </div>
  );
}
