import Link from "next/link";
import PageShell from "@/components/chrome/PageShell";
import { Ticket, TicketBody } from "@/components/ui/Ticket";

/**
 * Deliberately static and database-free: it names the two things CrewRest does and gets out of
 * the way. Adding a plan count here would make the first paint wait on a query.
 */
const ENTRIES = [
  {
    href: "/upload",
    title: "Plan from schedule",
    body: "Upload your monthly roster PDF and see which off-periods are long enough to travel home.",
  },
  {
    href: "/plans",
    title: "My plans",
    body: "The trips you've committed to, with their trains, tickets and notes.",
  },
];

export default function Home() {
  return (
    <PageShell width="narrow">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">CrewRest</h1>
      <p className="mt-2 text-ink-muted">
        Find the gaps between your duties that are long enough to be worth a train trip home, and
        keep track of the ones you commit to.
      </p>

      <div className="mt-8 flex flex-col gap-3">
        {ENTRIES.map((entry) => (
          <Link key={entry.href} href={entry.href} className="group block">
            <Ticket className="transition-colors group-hover:border-ink-faint">
              <TicketBody>
                <span className="font-mono text-sm font-semibold uppercase tracking-[0.14em] text-ink">
                  {entry.title} →
                </span>
                <span className="mt-2 block text-sm text-ink-muted">{entry.body}</span>
              </TicketBody>
            </Ticket>
          </Link>
        ))}
      </div>

      <p className="mt-6 text-xs text-ink-faint">
        No account needed — after upload you&apos;ll get a link keyed to your crew ID that you can
        come back to.
      </p>
    </PageShell>
  );
}
