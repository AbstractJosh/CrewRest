"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { PlanCardView } from "@/lib/views/plansView";
import { SaveHint, type SaveState } from "@/components/ui/SaveHint";
import { InlineEdit } from "@/components/ui/InlineEdit";
import { TextArea } from "@/components/ui/Field";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Stamp } from "@/components/ui/Stamp";
import { Ticket, TicketBody, Perforation, TicketStub } from "@/components/ui/Ticket";
import TimeStack from "@/components/domain/TimeStack";
import RouteLine from "@/components/domain/RouteLine";

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
   * reverted) field value, so the second edit is silently dropped instead of PATCHed. See commit
   * c101112 for how this was verified.
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

  return (
    <Ticket as="li" muted={plan.isCancelled}>
      <TicketBody className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <InlineEdit
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
              placeholder={plan.title}
              aria-label="Trip name"
            />
            <p className="mt-1 px-1 text-sm text-ink-muted">
              {plan.originLabel} ⇄ {plan.destinationLabel}
              {showPilot && ` · ${plan.pilotName} (${plan.crewId})`}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            {plan.isCancelled ? (
              <Stamp tone="neutral">Cancelled</Stamp>
            ) : plan.isTicketed ? (
              <Stamp tone="ok">Ticketed</Stamp>
            ) : (
              <Stamp tone="neutral">Planned</Stamp>
            )}
            <SaveHint state={nameState} />
          </div>
        </div>

        <RouteLine from={plan.originCode} to={plan.destinationCode} />

        <div className="flex flex-wrap justify-between gap-4">
          <div>
            <p className="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-ink-faint">
              Out
            </p>
            <TimeStack at={plan.departureAt} size="sm" />
          </div>
          <div>
            <p className="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-ink-faint">
              Back
            </p>
            <TimeStack at={plan.returnArrivalAt} size="sm" />
          </div>
        </div>

        {plan.notes || notesOpen ? (
          <div>
            <TextArea
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
            />
            <div className="mt-1 flex items-center gap-3">
              {notes.split("\n").length > 3 && (
                <Button
                  type="button"
                  variant="link"
                  onClick={() => setNotesExpanded((v) => !v)}
                  className="text-xs"
                >
                  {notesExpanded ? "Show less" : "Show more"}
                </Button>
              )}
              <SaveHint state={notesState} />
            </div>
          </div>
        ) : (
          <Button
            type="button"
            variant="link"
            onClick={() => setNotesOpen(true)}
            className="self-start"
          >
            Add notes
          </Button>
        )}

        {plan.hasEstimates && (
          <p className="text-xs text-warn">
            Saved from the curated timetable, not a live feed — confirm on ebilet before travelling.
          </p>
        )}
      </TicketBody>

      <Perforation />

      <TicketStub className="flex flex-wrap items-center gap-4">
        <ButtonLink href={plan.href} variant="link">
          Open planner
        </ButtonLink>

        {plan.isCancelled ? (
          <Button type="button" variant="link" onClick={() => patch({ cancelled: false }, setActionState)}>
            Restore
          </Button>
        ) : confirmingCancel ? (
          <>
            {/*
              "Keep it" renders first, in the slot "Cancel plan" occupied — the harmless choice
              lands under a double-click, which is exactly the gesture the two-step guard exists
              to survive. "Confirm cancel" moves one slot over so a double-click can't land on it.
            */}
            <Button type="button" variant="link" onClick={() => setConfirmingCancel(false)}>
              Keep it
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => {
                setConfirmingCancel(false);
                patch({ cancelled: true }, setActionState);
              }}
            >
              Confirm cancel
            </Button>
          </>
        ) : (
          <Button type="button" variant="link" onClick={() => setConfirmingCancel(true)}>
            Cancel plan
          </Button>
        )}

        {plan.bookingReference && (
          <span className="font-mono text-xs text-ink-faint">PNR {plan.bookingReference}</span>
        )}

        <SaveHint state={actionState} />
      </TicketStub>
    </Ticket>
  );
}
