"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Field, Select } from "@/components/ui/Field";

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
    <Field
      label="Airport ↔ station transfer"
      htmlFor="transfer-buffer"
      hint="Added after duty release before you can travel, and required again before report time on the way back."
    >
      <Select
        id="transfer-buffer"
        value={value}
        onChange={(e) => save(Number(e.target.value))}
        disabled={isSaving}
        className="font-mono tabular-nums"
      >
        {choices.map((minutes) => (
          <option key={minutes} value={minutes}>
            {label(minutes)}
          </option>
        ))}
      </Select>
    </Field>
  );
}
