/**
 * Copy is driven by whether anything shown is estimated, never hardcoded — a failing live request
 * is this integration's documented steady state, and estimates and live data can mix when one
 * direction answers and the other falls back.
 */
export default function SourceNote({ hasEstimates }: { hasEstimates: boolean }) {
  return (
    <p className="text-xs text-ink-faint">
      {hasEstimates
        ? "Some times shown are approximate planning estimates, not a live feed — confirm exact times and book on ebilet.tcddtasimacilik.gov.tr."
        : "Live TCDD times and fares. Seat availability can change between loading this page and paying."}
    </p>
  );
}
