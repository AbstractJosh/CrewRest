"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Offered in half-hour steps; the spec's two candidate values (1:00 and 1:30) both appear. */
const OPTIONS = [30, 45, 60, 75, 90, 105, 120, 150, 180];

function label(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export default function TransferBufferControl({
  crewId,
  initialMinutes,
}: {
  crewId: string;
  initialMinutes: number;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialMinutes);
  const [isSaving, setIsSaving] = useState(false);

  async function save(nextValue: number) {
    setValue(nextValue);
    setIsSaving(true);
    try {
      const response = await fetch(`/api/pilot/${crewId}/transfer-buffer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ airportTransferMinutes: nextValue }),
      });
      if (response.ok) router.refresh();
    } finally {
      setIsSaving(false);
    }
  }

  // A value restored from the database may not be one of the presets.
  const choices = OPTIONS.includes(value)
    ? OPTIONS
    : [...OPTIONS, value].sort((a, b) => a - b);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <label
        htmlFor="transfer-buffer"
        className="text-sm font-medium text-zinc-800 dark:text-zinc-200"
      >
        Airport ↔ station transfer
      </label>
      <select
        id="transfer-buffer"
        value={value}
        onChange={(e) => save(Number(e.target.value))}
        disabled={isSaving}
        className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      >
        {choices.map((minutes) => (
          <option key={minutes} value={minutes}>
            {label(minutes)}
          </option>
        ))}
      </select>
      <p className="text-xs text-zinc-500 dark:text-zinc-500">
        Added after duty release before you can travel, and required again before report
        time on the way back.
      </p>
    </div>
  );
}
