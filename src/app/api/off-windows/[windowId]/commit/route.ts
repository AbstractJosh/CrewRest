import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Parses the request body and rejects anything that isn't a JSON object.
 *
 * `request.json()` throws on malformed JSON, and a body that parses fine but isn't an object
 * (`null`, a string, an array) makes every `"key" in body` / `body.key` access downstream throw
 * a TypeError. Both escaped as an uncaught 500 before this existed; routing both cases through
 * one 400 keeps the error shape consistent with the rest of this file's `{ error: "..." }` style.
 */
async function parseJsonObject(
  request: NextRequest,
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; response: NextResponse }> {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }),
    };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 }),
    };
  }
  return { ok: true, body: parsed as Record<string, unknown> };
}

export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/off-windows/[windowId]/commit">,
) {
  const { windowId } = await ctx.params;
  const parseResult = await parseJsonObject(request);
  if (!parseResult.ok) return parseResult.response;
  const body = parseResult.body;

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
      outboundTrain: body.outbound as Prisma.InputJsonValue,
      returnTrain: body.return as Prisma.InputJsonValue,
      bookingReference,
      // Re-committing a window the pilot had cancelled makes the plan live again; leaving the
      // timestamp would produce a row that is both freshly committed and cancelled.
      cancelledAt: null,
    },
    create: {
      offWindowId: windowId,
      outboundTrain: body.outbound as Prisma.InputJsonValue,
      returnTrain: body.return as Prisma.InputJsonValue,
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
  const parseResult = await parseJsonObject(request);
  if (!parseResult.ok) return parseResult.response;
  const body = parseResult.body;

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
  // A non-string, non-null tripName/notes would otherwise sail through `normalizeText`, which
  // treats anything that isn't a string as "clear this field" — silently erasing stored data
  // instead of rejecting the request. `null` is the UI's own way to clear a field and must stay
  // valid.
  if (hasTripName && body.tripName !== null && typeof body.tripName !== "string") {
    return NextResponse.json({ error: "tripName must be a string or null." }, { status: 400 });
  }
  if (hasNotes && body.notes !== null && typeof body.notes !== "string") {
    return NextResponse.json({ error: "notes must be a string or null." }, { status: 400 });
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
  if (hasCancelled) {
    // Idempotent: a repeat `cancelled: true` must not re-stamp `cancelledAt` and lose the
    // original drop time. `cancelled: false` always clears it, and cancelling a live plan always
    // stamps it, so the only special case is "already cancelled, cancel again".
    if (body.cancelled) {
      data.cancelledAt = existing.cancelledAt ?? new Date();
    } else {
      data.cancelledAt = null;
    }
  }

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
