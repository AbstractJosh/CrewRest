/**
 * The link out to ebilet, with the row to look for once it opens.
 *
 * The caption sits under the link rather than in its text because the link only gets the pilot to
 * the right day — ebilet reads six query variables and none of them selects a train, so the last
 * step is done by eye (see `src/lib/trains/bookingTarget.ts`). It is a plain `<a>` rather than
 * `ButtonLink`, which wraps `next/link` and is for internal routes.
 */
export default function BookingHandoff({
  label = "Buy on TCDD",
  url,
  caption,
}: {
  label?: string;
  url: string;
  caption: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="self-start text-sm font-medium text-ink-muted underline underline-offset-4 hover:text-ink"
      >
        {label} ↗
      </a>
      <p className="text-xs text-ink-faint">{caption}</p>
    </div>
  );
}
