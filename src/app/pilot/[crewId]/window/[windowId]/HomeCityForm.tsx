"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Ticket, TicketBody } from "@/components/ui/Ticket";
import { Field, Select } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";

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
    <Ticket className="mt-6">
      <TicketBody>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Field label="Which city do you commute home to?" htmlFor="home-city">
            <Select
              id="home-city"
              value={stationCode}
              onChange={(e) => setStationCode(e.target.value)}
            >
              {destinations.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.city}
                </option>
              ))}
            </Select>
          </Field>
          {error && <Callout tone="danger">{error}</Callout>}
          <Button type="submit" disabled={isSaving} className="self-start">
            {isSaving ? "Saving…" : "Save home city"}
          </Button>
        </form>
      </TicketBody>
    </Ticket>
  );
}
