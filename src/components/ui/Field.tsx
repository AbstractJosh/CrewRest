import { cloneElement, isValidElement, type ComponentProps, type ReactElement } from "react";
import { FOCUS_RING } from "./focusRing";

/** Shared by every control so they stay visually identical. */
const CONTROL =
  "w-full rounded-md border border-rule bg-card px-3 py-2 text-sm text-ink " +
  `placeholder:text-ink-faint outline-none focus:border-ink-muted ${FOCUS_RING}`;

/**
 * Attaches `describedBy` to a single control element, preserving any `aria-describedby` the
 * caller already set. Only fires when `children` is exactly one element — a `Field` wrapping a
 * compound control (e.g. a slider paired with a number input) can't be reached this way, since
 * the id would land on the wrapper rather than either actual control. Those call sites wire
 * `aria-describedby` themselves, using the same `${htmlFor}-hint` / `${htmlFor}-error` ids this
 * derives, rather than relying on this fallback silently doing nothing.
 */
function withDescribedBy(children: React.ReactNode, describedBy: string | undefined) {
  if (!describedBy || !isValidElement(children)) return children;
  const existing = (children.props as { "aria-describedby"?: string })["aria-describedby"];
  return cloneElement(children as ReactElement<{ "aria-describedby"?: string }>, {
    "aria-describedby": existing ? `${existing} ${describedBy}` : describedBy,
  });
}

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  const hintId = htmlFor && hint ? `${htmlFor}-hint` : undefined;
  const errorId = htmlFor && error ? `${htmlFor}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
        {label}
      </label>
      {withDescribedBy(children, describedBy)}
      {hint && (
        <p id={hintId} className="text-xs text-ink-faint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function TextInput({ className = "", ...props }: ComponentProps<"input">) {
  return <input {...props} className={`${CONTROL} ${className}`} />;
}

export function TextArea({ className = "", ...props }: ComponentProps<"textarea">) {
  return <textarea {...props} className={`${CONTROL} ${className}`} />;
}

export function Select({ className = "", ...props }: ComponentProps<"select">) {
  return <select {...props} className={`${CONTROL} ${className}`} />;
}
