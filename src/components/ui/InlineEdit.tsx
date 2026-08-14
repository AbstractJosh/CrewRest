"use client";

import type { ComponentProps } from "react";

export function InlineEdit({ className = "", ...props }: ComponentProps<"input">) {
  return (
    <input
      {...props}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        props.onKeyDown?.(event);
      }}
      className={`w-full truncate rounded border border-transparent bg-transparent px-1 py-0.5 font-medium text-ink hover:border-rule focus:border-ink-faint focus:outline-none ${className}`}
    />
  );
}
