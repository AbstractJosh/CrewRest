export default function PageHeader({
  title,
  meta,
  subtitle,
  action,
}: {
  title: React.ReactNode;
  /** Small mono line under the title — crew ID, aircraft, period. */
  meta?: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {meta && (
          <p className="mt-1 font-mono text-xs uppercase tracking-[0.1em] text-ink-faint">
            {meta}
          </p>
        )}
        {subtitle && <p className="mt-2 text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
