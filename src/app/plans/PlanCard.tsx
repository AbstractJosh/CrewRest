"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { formatTurkeyDateTime, formatUtcRange } from "@/lib/time/turkeyTime";
import type { PlanCardView } from "@/lib/views/plansView";

type SaveState = "idle" | "saving" | "saved" | "error";

function SaveHint({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  const text =
    state === "saving" ? "Saving…" : state === "saved" ? "Saved" : "Could not save";
  const tone =
    state === "error"
      ? "text-red-600 dark:text-red-400"
      : "text-zinc-400 dark:text-zinc-500";
  return <span className={`text-xs ${tone}`}>{text}</span>;
}

export default function PlanCard({
  plan,
  showPilot,
}: {
  plan: PlanCardView;
  showPilot: boolean;
}) {
  const router = useRouter();
  const [tripName, setTripName] = useState(plan.tripName ?? "");
  const [notes, setNotes] = useState(plan.notes ?? "");
  const [notesOpen, setNotesOpen] = useState(Boolean(plan.notes));
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [nameState, setNameState] = useState<SaveState>("idle");
  const [notesState, setNotesState] = useState<SaveState>("idle");
  // Cancel and restore get their own state: reusing the name field's would flash "Saving…" next
  // to the title for an action that has nothing to do with it.
  const [actionState, setActionState] = useState<SaveState>("idle");
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  /**
   * What the server actually holds for each text field, as of the last successful PATCH — not
   * `plan.tripName`/`plan.notes`, which stay stale until the `router.refresh()` below lands new
   * props. Comparing a blur against the prop instead of this ref is a race: fire a save, then
   * blur again before the refreshed props arrive, and the stale prop matches the new (already
   * reverted) field value, so the second edit is silently dropped instead of PATCHed. See the
   * fix-round note in task-7-report.md for how this was verified.
   */
  const lastSavedTripName = useRef(plan.tripName ?? "");
  const lastSavedNotes = useRef(plan.notes ?? "");

  /**
   * Each field PATCHes only its own key, so an in-flight notes save can't overwrite a rename the
   * pilot made a moment earlier — the handler leaves omitted keys alone.
   */
  async function patch(
    body: Record<string, unknown>,
    setState: (s: SaveState) => void,
    onSaved?: () => void,
  ) {
    setState("saving");
    try {
      const response = await fetch(`/api/off-windows/${plan.windowId}/commit`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        setState("error");
        return;
      }
      // Update the "last known saved" ref before router.refresh(), which only *requests* fresh
      // props — it doesn't resolve them synchronously here, so a blur that happens in the gap
      // must compare against this, not against `plan`.
      onSaved?.();
      setState("saved");
      router.refresh();
    } catch {
      setState("error");
    }
  }

  const departure = formatTurkeyDateTime(plan.departureAt);
  const returnArrival = formatTurkeyDateTime(plan.returnArrivalAt);

  return (
    <li
      className={`rounded-lg border p-4 ${
        plan.isCancelled
          ? "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/40"
          : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <input
            value={tripName}
            onChange={(e) => {
              setTripName(e.target.value);
              setNameState("idle");
            }}
            onBlur={() => {
              const trimmed = tripName.trim();
              if (trimmed === lastSavedTripName.current) return;
              patch({ tripName }, setNameState, () => {
                lastSavedTripName.current = trimmed;
              });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            placeholder={plan.title}
            aria-label="Trip name"
            className="w-full truncate rounded border border-transparent bg-transparent px-1 py-0.5 font-medium text-zinc-900 hover:border-zinc-300 focus:border-zinc-400 focus:outline-none dark:text-zinc-100 dark:hover:border-zinc-700"
          />
          <p className="mt-1 px-1 text-sm text-zinc-500 dark:text-zinc-400">
            {plan.originLabel} ⇄ {plan.destinationLabel}
            {showPilot && ` · ${plan.pilotName} (${plan.crewId})`}
          </p>
          <p className="mt-0.5 px-1 text-sm text-zinc-600 dark:text-zinc-300">
            out {departure} · back {returnArrival}
          </p>
          <p className="mt-0.5 px-1 text-xs text-zinc-400 dark:text-zinc-500">
            {formatUtcRange(plan.departureAt, plan.returnArrivalAt)} GMT
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {plan.isCancelled ? (
            <span className="rounded bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              Cancelled
            </span>
          ) : plan.isTicketed ? (
            <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
              Ticketed
            </span>
          ) : (
            <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
              Planned
            </span>
          )}
          <SaveHint state={nameState} />
        </div>
      </div>

      {plan.notes || notesOpen ? (
        <div className="mt-3">
          <textarea
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              setNotesState("idle");
            }}
            onBlur={() => {
              const trimmed = notes.trim();
              if (trimmed === lastSavedNotes.current) return;
              patch({ notes }, setNotesState, () => {
                lastSavedNotes.current = trimmed;
              });
            }}
            rows={notesExpanded ? 8 : 3}
            placeholder="Anything worth remembering about this trip — who you're meeting, what to confirm before you travel."
            aria-label="Trip notes"
            className="w-full whitespace-pre-wrap rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          />
          <div className="mt-1 flex items-center gap-3">
            {notes.split("\n").length > 3 && (
              <button
                type="button"
                onClick={() => setNotesExpanded((v) => !v)}
                className="text-xs font-medium text-zinc-500 underline underline-offset-2 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
              >
                {notesExpanded ? "Show less" : "Show more"}
              </button>
            )}
            <SaveHint state={notesState} />
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setNotesOpen(true)}
          className="mt-3 text-sm font-medium text-zinc-500 underline underline-offset-4 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          Add notes
        </button>
      )}

      {plan.hasEstimates && (
        <p className="mt-3 text-xs text-amber-700 dark:text-amber-400">
          Saved from the curated timetable, not a live feed — confirm on ebilet before travelling.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <Link
          href={plan.href}
          className="text-sm font-medium text-zinc-600 underline underline-offset-4 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          Open planner
        </Link>

        {plan.isCancelled ? (
          <button
            type="button"
            onClick={() => patch({ cancelled: false }, setActionState)}
            className="text-sm font-medium text-zinc-600 underline underline-offset-4 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            Restore
          </button>
        ) : confirmingCancel ? (
          <>
            {/*
              "Keep it" renders first, in the slot "Cancel plan" occupied — the harmless choice
              lands under a double-click, which is exactly the gesture the two-step guard exists
              to survive. "Confirm cancel" moves one slot over so a double-click can't land on it.
            */}
            <button
              type="button"
              onClick={() => setConfirmingCancel(false)}
              className="text-sm text-zinc-500 underline underline-offset-4 dark:text-zinc-400"
            >
              Keep it
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmingCancel(false);
                patch({ cancelled: true }, setActionState);
              }}
              className="text-sm font-medium text-red-600 underline underline-offset-4 dark:text-red-400"
            >
              Confirm cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingCancel(true)}
            className="text-sm font-medium text-zinc-500 underline underline-offset-4 hover:text-red-600 dark:text-zinc-400 dark:hover:text-red-400"
          >
            Cancel plan
          </button>
        )}

        {plan.bookingReference && (
          <span className="text-xs text-zinc-400 dark:text-zinc-500">
            PNR {plan.bookingReference}
          </span>
        )}

        <SaveHint state={actionState} />
      </div>
    </li>
  );
}
