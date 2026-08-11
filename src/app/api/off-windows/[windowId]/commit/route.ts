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
