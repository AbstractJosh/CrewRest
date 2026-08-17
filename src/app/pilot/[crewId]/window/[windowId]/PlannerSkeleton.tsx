import { Ticket, TicketBody, Perforation, TicketStub } from "@/components/ui/Ticket";

/**
 * Stands in for `TripPlanner`/`HomeCityForm` while the live TCDD search is in flight. Ticket-shaped
 * so the layout doesn't jump when the real planner replaces it, and announces itself to assistive
 * tech rather than being a silent pulsing rectangle.
 */
export default function PlannerSkeleton() {
  return (
    <div className="mt-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading train times…</span>
      <Ticket>
        <TicketBody className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="flex flex-col gap-2">
              <div className="h-4 w-32 animate-pulse rounded bg-sunken" />
              <div className="h-9 w-full animate-pulse rounded-md bg-sunken" />
            </div>
          ))}
        </TicketBody>
        <Perforation />
        <TicketStub>
          <div className="h-8 w-40 animate-pulse rounded bg-card" />
        </TicketStub>
      </Ticket>
    </div>
  );
}
