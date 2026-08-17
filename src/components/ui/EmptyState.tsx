export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-perf bg-card px-5 py-8 text-center text-sm text-ink-muted">
      {children}
    </div>
  );
}
