"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Destination {
  code: string;
  name: string;
  city: string;
}

export default function HomeCityForm({
  crewId,
  destinations,
}: {
  crewId: string;
  destinations: Destination[];
}) {
  const router = useRouter();
  const [stationCode, setStationCode] = useState(destinations[0]?.code ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/pilot/${crewId}/home-city`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stationCode }),
      });
      if (!response.ok) {
        const data = await response.json();
        setError(data.error ?? "Could not save home city.");
        return;
      }
      router.refresh();
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-6 flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
    >
      <label className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
        Which city do you commute home to?
      </label>
      <select
        value={stationCode}
        onChange={(e) => setStationCode(e.target.value)}
        className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
      >
        {destinations.map((d) => (
          <option key={d.code} value={d.code}>
            {d.city}
          </option>
        ))}
      </select>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={isSaving}
        className="self-start rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
      >
        {isSaving ? "Saving..." : "Save home city"}
      </button>
    </form>
  );
}
