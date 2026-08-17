import { buildPlansView, type PlanCardView } from "@/lib/views/plansView";
import PageShell from "@/components/chrome/PageShell";
import PageHeader from "@/components/chrome/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { ButtonLink } from "@/components/ui/Button";
import PlanCard from "./PlanCard";

/**
 * This page reads the database and has no dynamic params, so without this Next would try to
 * prerender it at build time — which means querying SQLite during `next build`.
 */
export const dynamic = "force-dynamic";

function Section({
  title,
  plans,
  showPilot,
}: {
  title: string;
  plans: PlanCardView[];
  showPilot: boolean;
}) {
  if (plans.length === 0) return null;
  return (
    <section className="mt-10">
      <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
        {title} <span className="text-ink-faint">({plans.length})</span>
      </h2>
      <ul className="mt-4 flex flex-col gap-4">
        {plans.map((plan) => (
          <PlanCard key={plan.windowId} plan={plan} showPilot={showPilot} />
        ))}
      </ul>
    </section>
  );
}

export default async function PlansPage() {
  const view = await buildPlansView(new Date());

  return (
    <PageShell>
      <PageHeader
        title="My plans"
        subtitle="Trains as they were when you committed — Türkiye local time, GMT underneath."
      />

      {view.totalCount === 0 ? (
        <div className="mt-10">
          <EmptyState>
            No plans yet. <ButtonLink href="/upload" variant="link">Upload a schedule</ButtonLink> and
            commit to a trip to see it here.
          </EmptyState>
        </div>
      ) : (
        <>
          <Section title="Upcoming" plans={view.upcoming} showPilot={view.showPilot} />
          <Section title="Past" plans={view.past} showPilot={view.showPilot} />
          <Section title="Cancelled" plans={view.cancelled} showPilot={view.showPilot} />
        </>
      )}
    </PageShell>
  );
}
