export type CalloutTone = "ok" | "warn" | "danger" | "neutral";

const TONES: Record<CalloutTone, string> = {
  ok: "border-ok bg-ok-bg",
  warn: "border-warn bg-warn-bg",
  danger: "border-danger bg-danger-bg",
  neutral: "border-rule bg-sunken",
};

/**
 * Replaces five hand-rolled coloured boxes: the feasibility panel, the rest-period note, the
 * long-wait warning, the not-viable warning and the estimates footnote.
 */
export function Callout({
  tone = "neutral",
  title,
  children,
}: {
  tone?: CalloutTone;
  title?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${TONES[tone]}`}>
      {title && <p className="font-medium text-ink">{title}</p>}
      {children && <div className={title ? "mt-1 text-ink-muted" : "text-ink-muted"}>{children}</div>}
    </div>
  );
}
