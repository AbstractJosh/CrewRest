"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Field, TextInput } from "@/components/ui/Field";

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
    <Field
      label={
        <>
          Minimum off-period <span className="font-mono tabular-nums">{value}</span>h
        </>
      }
      htmlFor="min-off-hours"
      hint="How long a gap must be before it's worth suggesting a trip home."
    >
      {/*
        This wraps two controls in a <div>, and that div is what Field's cloneElement actually
        reaches — it does fire (the div is one valid element), attaching aria-describedby to it,
        but that's inert: a plain non-interactive div conveys nothing to a screen reader. The two
        inputs below wire aria-describedby themselves, pointing at the same "min-off-hours-hint"
        id Field derives from htmlFor="min-off-hours" above — that's what actually does the work.
      */}
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
          aria-describedby="min-off-hours-hint"
          className="w-full accent-ink"
          disabled={isSaving}
        />
        {/*
          TextInput composes its class as `${CONTROL} ${className}` with no tailwind-merge, and
          CONTROL already carries w-full. A caller's competing width class therefore loses to
          w-full on stylesheet order regardless of prop order, so it can't reliably narrow the
          input. Sizing the wrapper instead of fighting the input's own width class is the fix.
        */}
        <div className="w-16 shrink-0">
          <TextInput
            type="number"
            min={1}
            max={240}
            value={value}
            onChange={(e) => setValue(Number(e.target.value))}
            onBlur={() => save(value)}
            aria-describedby="min-off-hours-hint"
            disabled={isSaving}
          />
        </div>
      </div>
    </Field>
  );
}
