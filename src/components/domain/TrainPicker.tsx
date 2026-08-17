"use client";

import { formatDurationMinutes, formatTurkeyRange } from "@/lib/time/turkeyTime";
import { Select } from "@/components/ui/Field";
import type { SerializedTrainOption } from "@/lib/trains/serialized";
import type { TrainFare } from "@/lib/trains/TrainProvider";

function cheapestFare(option: SerializedTrainOption): TrainFare | null {
  if (!option.fares || option.fares.length === 0) return null;
  return option.fares.reduce((cheapest, fare) =>
    fare.priceMinor < cheapest.priceMinor ? fare : cheapest,
  );
}

/** Exact to the kuruş — rounding a ₺450,50 fare to ₺451 misstates what the ticket costs. */
function formatPrice(fare: TrainFare): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: fare.currency,
  }).format(fare.priceMinor / 100);
}

/**
 * One `<option>` label. Price and seats-left only appear when the provider supplied them, so the
 * same component renders live data and curated estimates without branching on the source.
 */
function optionLabel(option: SerializedTrainOption): string {
  const parts = [
    formatTurkeyRange(new Date(option.departureAt), new Date(option.arrivalAt)),
    `(${formatDurationMinutes(option.durationMinutes)})`,
  ];

  const fare = cheapestFare(option);
  if (fare) parts.push(`· ${formatPrice(fare)}`);

  if (option.availableSeats !== undefined && option.availableSeats <= 10) {
    parts.push(`· ${option.availableSeats} seats left`);
  }

  return parts.join(" ");
}

export default function TrainPicker({
  label,
  options,
  selectedIndex,
  onSelect,
}: {
  label: React.ReactNode;
  options: SerializedTrainOption[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}) {
  const selected = options[selectedIndex];

  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink">{label}</span>
        <Select
          value={selectedIndex}
          onChange={(e) => onSelect(Number(e.target.value))}
          className="font-mono tabular-nums"
        >
          {options.map((option, index) => (
            <option key={option.trainNumber + option.departureAt} value={index}>
              {optionLabel(option)}
            </option>
          ))}
        </Select>
      </label>
      {selected && (
        <a
          href={selected.bookingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="self-start text-sm font-medium text-ink-muted underline underline-offset-4 hover:text-ink"
        >
          Buy on TCDD ↗
        </a>
      )}
    </div>
  );
}
