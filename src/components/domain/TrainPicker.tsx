"use client";

import { formatDurationMinutes, formatTurkeyRange } from "@/lib/time/turkeyTime";
import { Select } from "@/components/ui/Field";
import BookingHandoff from "@/components/domain/BookingHandoff";
import { describeBookingTarget } from "@/lib/trains/bookingTarget";
import { cheapestFare, formatFare } from "@/lib/trains/fares";
import type { SerializedTrainOption } from "@/lib/trains/serialized";

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
  if (fare) parts.push(`· ${formatFare(fare)}`);

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
        <BookingHandoff
          url={selected.bookingUrl}
          caption={describeBookingTarget(selected).caption}
        />
      )}
    </div>
  );
}
