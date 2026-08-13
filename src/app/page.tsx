import Link from "next/link";

/**
 * The landing page. Deliberately static and database-free: it names the two things CrewRest does
 * and gets out of the way. Adding a plan count here would make the first paint wait on a query.
 */
export default function Home() {
  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-6 py-16 dark:bg-black">
      <main className="w-full max-w-lg">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          CrewRest
        </h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Find the gaps between your duties that are long enough to be worth a train trip
          home, and keep track of the ones you commit to.
        </p>

        <div className="mt-8 flex flex-col gap-3">
          <Link
            href="/upload"
            className="group rounded-lg border border-zinc-200 bg-white p-5 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-600"
          >
            <span className="font-medium text-zinc-900 dark:text-zinc-100">
              Plan from schedule →
            </span>
            <span className="mt-1 block text-sm text-zinc-500 dark:text-zinc-400">
              Upload your monthly roster PDF and see which off-periods are long enough to
              travel home.
            </span>
          </Link>

          <Link
            href="/plans"
            className="group rounded-lg border border-zinc-200 bg-white p-5 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-600"
          >
            <span className="font-medium text-zinc-900 dark:text-zinc-100">
              My plans →
            </span>
            <span className="mt-1 block text-sm text-zinc-500 dark:text-zinc-400">
              The trips you&apos;ve committed to, with their trains, tickets and notes.
            </span>
          </Link>
        </div>

        <p className="mt-6 text-xs text-zinc-500 dark:text-zinc-500">
          No account needed — after upload you&apos;ll get a link keyed to your crew ID that
          you can come back to.
        </p>
      </main>
    </div>
  );
}
