import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/off-windows/[windowId]/commit">,
) {
  const { windowId } = await ctx.params;
  const body = await request.json();

  if (!body.outbound || !body.return) {
    return NextResponse.json(
      { error: "Both outbound and return trains are required." },
      { status: 400 },
    );
  }

  const offWindow = await prisma.offWindow.findUnique({ where: { id: windowId } });
  if (!offWindow) {
    return NextResponse.json({ error: "Off-window not found." }, { status: 404 });
  }

  // Absent and empty both mean "not ticketed yet"; anything else is stored as given.
  const bookingReference =
    typeof body.bookingReference === "string" && body.bookingReference.trim() !== ""
      ? body.bookingReference.trim()
      : null;

  const commitment = await prisma.commuteCommitment.upsert({
    where: { offWindowId: windowId },
    update: {
      outboundTrain: body.outbound,
      returnTrain: body.return,
      bookingReference,
      // Re-committing a window the pilot had cancelled makes the plan live again; leaving the
      // timestamp would produce a row that is both freshly committed and cancelled.
      cancelledAt: null,
    },
    create: {
      offWindowId: windowId,
      outboundTrain: body.outbound,
      returnTrain: body.return,
      bookingReference,
    },
  });

  return NextResponse.json({ ok: true, commitmentId: commitment.id });
}

/** Absent, empty and whitespace-only all mean "unset" — as `bookingReference` already treats it. */
function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Edits to an existing commitment: rename, notes, cancel and restore.
 *
 * One handler rather than three routes because all of these are edits to the same row, and
 * because omitting a key leaves that field alone — which is what lets the name field and the
 * notes field save independently without either clobbering the other's in-flight edit.
 */
export async function PATCH(
  request: NextRequest,
  ctx: RouteContext<"/api/off-windows/[windowId]/commit">,
) {
  const { windowId } = await ctx.params;
  const body = await request.json();

  const hasTripName = "tripName" in body;
  const hasNotes = "notes" in body;
  const hasCancelled = "cancelled" in body;

  if (!hasTripName && !hasNotes && !hasCancelled) {
    return NextResponse.json(
      { error: "Send at least one of tripName, notes or cancelled." },
      { status: 400 },
    );
  }
  if (hasCancelled && typeof body.cancelled !== "boolean") {
    return NextResponse.json({ error: "cancelled must be true or false." }, { status: 400 });
  }

  const existing = await prisma.commuteCommitment.findUnique({
    where: { offWindowId: windowId },
  });
  if (!existing) {
    return NextResponse.json(
      { error: "No commitment for this off-window." },
      { status: 404 },
    );
  }

  const data: {
    tripName?: string | null;
    notes?: string | null;
    cancelledAt?: Date | null;
  } = {};
  if (hasTripName) data.tripName = normalizeText(body.tripName);
  if (hasNotes) data.notes = normalizeText(body.notes);
  if (hasCancelled) data.cancelledAt = body.cancelled ? new Date() : null;

  const updated = await prisma.commuteCommitment.update({
    where: { offWindowId: windowId },
    data,
  });

  return NextResponse.json({
    ok: true,
    tripName: updated.tripName,
    notes: updated.notes,
    cancelledAt: updated.cancelledAt,
  });
}
