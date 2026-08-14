/**
 * A ticket is the app's one card shape. The perforation is a dashed rule rather than a notched
 * cutout: notches and a vertical tear-off stub are the parts of a real ticket that break at narrow
 * widths, and mobile is a stated direction.
 */
export function Ticket({
  as: Tag = "div",
  muted = false,
  className = "",
  children,
}: {
  as?: "div" | "li" | "article" | "section";
  /** Cancelled plans and other de-emphasised tickets sit on the sunken surface. */
  muted?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Tag
      className={`overflow-hidden rounded-xl border border-rule ${
        muted ? "bg-sunken" : "bg-card"
      } ${className}`}
    >
      {children}
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
