export type StampTone = "ok" | "warn" | "danger" | "neutral";

const TONES: Record<StampTone, string> = {
  ok: "border-ok text-ok bg-ok-bg",
  warn: "border-warn text-warn bg-warn-bg",
  danger: "border-danger text-danger bg-danger-bg",
  neutral: "border-rule text-ink-muted bg-sunken",
};

/** Status reads as a stamp — bordered, letterspaced caps — rather than a filled pill. */
export function Stamp({
  tone = "neutral",
  children,
}: {
  tone?: StampTone;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded border px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.12em] ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}
