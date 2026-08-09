"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function MinOffHoursControl({
  crewId,
  initialMinOffHours,
}: {
  crewId: string;
  initialMinOffHours: number;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialMinOffHours);
  const [isSaving, setIsSaving] = useState(false);

  async function save(nextValue: number) {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/pilot/${crewId}/min-off-hours`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minOffHours: nextValue }),
      });
      if (response.ok) router.refresh();
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <label
        htmlFor="min-off-hours"
        className="text-sm font-medium text-zinc-800 dark:text-zinc-200"
      >
        Only show off-periods of at least{" "}
        <span className="tabular-nums">{value}</span>h
      </label>
      <div className="flex items-center gap-3">
        <input
          id="min-off-hours"
          type="range"
          min={1}
          max={96}
          step={1}
          value={Math.min(value, 96)}
          onChange={(e) => setValue(Number(e.target.value))}
          onMouseUp={() => save(value)}
          onTouchEnd={() => save(value)}
          onKeyUp={() => save(value)}
          className="w-full accent-zinc-900 dark:accent-zinc-100"
          disabled={isSaving}
        />
        <input
          type="number"
          min={1}
          max={240}
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          onBlur={() => save(value)}
          className="w-16 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          disabled={isSaving}
        />
      </div>
      <p className="text-xs text-zinc-500 dark:text-zinc-500">
        This is a personal setting — it decides how long a gap between duties
        needs to be before it&apos;s worth suggesting a trip home.
      </p>
    </div>
  );
}
