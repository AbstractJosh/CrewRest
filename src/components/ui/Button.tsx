import Link from "next/link";
import type { ComponentProps } from "react";

export type ButtonVariant = "primary" | "ghost" | "link" | "danger";
export type ButtonSize = "sm" | "md";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "rounded-full bg-action text-action-ink hover:opacity-90 disabled:opacity-50",
  ghost: "rounded-full border border-rule bg-card text-ink hover:bg-sunken disabled:opacity-50",
  link: "text-ink-muted underline underline-offset-4 hover:text-ink disabled:opacity-50",
  danger: "text-danger underline underline-offset-4 hover:opacity-80 disabled:opacity-50",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-5 py-2.5 text-sm",
};

/** `link` and `danger` are inline text actions, so they take no pill padding. */
function classesFor(variant: ButtonVariant, size: ButtonSize, className: string) {
  const base = "inline-flex items-center justify-center font-medium transition-colors";
  const padding = variant === "link" || variant === "danger" ? "text-sm" : SIZES[size];
  return `${base} ${padding} ${VARIANTS[variant]} ${className}`;
}

/** No hooks, so this is importable from server and client components alike. */
export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button {...props} className={classesFor(variant, size, className)} />;
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <Link {...props} className={classesFor(variant, size, className)} />;
}
