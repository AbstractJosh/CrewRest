import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const MIN_MINUTES = 0;
const MAX_MINUTES = 300;

export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/pilot/[crewId]/transfer-buffer">,
) {
  const { crewId } = await ctx.params;
  const body = await request.json();
  const airportTransferMinutes = Number(body.airportTransferMinutes);

  if (
    !Number.isFinite(airportTransferMinutes) ||
    airportTransferMinutes < MIN_MINUTES ||
    airportTransferMinutes > MAX_MINUTES
  ) {
    return NextResponse.json(
      {
        error: `airportTransferMinutes must be between ${MIN_MINUTES} and ${MAX_MINUTES}.`,
      },
      { status: 400 },
    );
  }

  const pilot = await prisma.pilot.findUnique({ where: { crewId } });
  if (!pilot) {
    return NextResponse.json({ error: "Pilot not found." }, { status: 404 });
  }

  const value = Math.round(airportTransferMinutes);
  await prisma.pilot.update({
    where: { id: pilot.id },
    data: { airportTransferMinutes: value },
  });

  return NextResponse.json({ ok: true, airportTransferMinutes: value });
}
