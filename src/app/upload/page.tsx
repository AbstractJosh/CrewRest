import PageShell from "@/components/chrome/PageShell";
import UploadForm from "./UploadForm";

export default function UploadPage() {
  return (
    <PageShell width="narrow">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Upload a roster</h1>
      <p className="mt-2 text-ink-muted">
        CrewRest finds the gaps between your duties that are long enough to be worth a train trip
        home, and helps you decide whether to commit to the commute.
      </p>

      <UploadForm />

      <p className="mt-6 text-xs text-ink-faint">
        No account needed — after upload you&apos;ll get a link keyed to your crew ID that you can
        come back to.
      </p>
    </PageShell>
  );
}
