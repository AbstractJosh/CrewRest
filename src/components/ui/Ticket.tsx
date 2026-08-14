/**
 * Which of the three states a ticket is in, drawn as the colour of its spine. Colour is the only
 * thing that changes between them, so it is never the sole carrier of the distinction — each
 * accented ticket also shows a Stamp or an action naming its state in words.
 */
export type TicketAccent = "open" | "committed" | "dropped";

const ACCENTS: Record<TicketAccent, string> = {
  open: "bg-accent-open",
  committed: "bg-accent-committed",
  dropped: "bg-accent-dropped",
};

/**
 * A ticket is the app's one card shape. The perforation is a dashed rule rather than a notched
 * cutout: notches and a vertical tear-off stub are the parts of a real ticket that break at narrow
 * widths, and mobile is a stated direction.
 *
 * An accented ticket grows a full-height colour spine down its left edge, the way a boarding pass
 * carries its carrier band. The spine sits outside the body/perforation column rather than inside
 * it, so the dashed tear line stops at the band instead of cutting the colour in half — a real
 * pass tears across the card, not across its spine.
 */
export function Ticket({
  as: Tag = "div",
  muted = false,
  accent,
  className = "",
  children,
}: {
  as?: "div" | "li" | "article" | "section";
  /** Cancelled plans and other de-emphasised tickets sit on the sunken surface. */
  muted?: boolean;
  /** Omit on tickets that aren't one of a list of states — the planner's own editing card. */
  accent?: TicketAccent;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Tag
      className={`flex overflow-hidden rounded-xl border border-rule ${
        muted ? "bg-sunken" : "bg-card"
      } ${className}`}
    >
      {accent && (
        <div
          className={`w-6 shrink-0 border-r border-rule sm:w-8 ${ACCENTS[accent]}`}
          aria-hidden="true"
        />
      )}
      {/* min-w-0 so a long unbroken string in the body shrinks instead of shoving the spine off. */}
      <div className="min-w-0 flex-1">{children}</div>
    </Tag>
  );
}

export function TicketBody({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={`p-5 ${className}`}>{children}</div>;
}

export function Perforation() {
  return <div className="border-t border-dashed border-perf" aria-hidden="true" />;
}

export function TicketStub({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={`bg-sunken px-5 py-3 ${className}`}>{children}</div>;
}
