import Link from "next/link";
import { buildPlansView, type PlanCardView } from "@/lib/views/plansView";
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
      <h2 className="text-lg font-medium text-zinc-950 dark:text-zinc-50">
        {title}{" "}
        <span className="text-sm font-normal text-zinc-400 dark:text-zinc-500">
          ({plans.length})
        </span>
      </h2>
      <ul className="mt-4 flex flex-col gap-3">
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
    <div className="mx-auto w-full max-w-3xl px-6 py-12">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          My plans
        </h1>
        <Link
          href="/"
          className="text-sm font-medium text-zinc-600 underline underline-offset-4 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          Home
        </Link>
      </div>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Trains as they were when you committed — Türkiye local time, GMT underneath.
      </p>

      {view.totalCount === 0 ? (
        <p className="mt-10 rounded-lg border border-zinc-200 bg-white p-5 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
          No plans yet.{" "}
          <Link
            href="/upload"
            className="font-medium underline underline-offset-4 hover:text-zinc-950 dark:hover:text-zinc-50"
          >
            Upload a schedule
          </Link>{" "}
          and commit to a trip to see it here.
        </p>
      ) : (
        <>
          <Section title="Upcoming" plans={view.upcoming} showPilot={view.showPilot} />
          <Section title="Past" plans={view.past} showPilot={view.showPilot} />
          <Section title="Cancelled" plans={view.cancelled} showPilot={view.showPilot} />
        </>
      )}
    </div>
  );
}
