import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const MIN_HOURS = 1;
const MAX_HOURS = 240;

export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/pilot/[crewId]/min-off-hours">,
) {
  const { crewId } = await ctx.params;
  const body = await request.json();
  const minOffHours = Number(body.minOffHours);

  if (!Number.isFinite(minOffHours) || minOffHours < MIN_HOURS || minOffHours > MAX_HOURS) {
    return NextResponse.json(
      { error: `minOffHours must be between ${MIN_HOURS} and ${MAX_HOURS}.` },
      { status: 400 },
    );
  }

  const pilot = await prisma.pilot.findUnique({ where: { crewId } });
  if (!pilot) {
    return NextResponse.json({ error: "Pilot not found." }, { status: 404 });
  }

  await prisma.pilot.update({
    where: { id: pilot.id },
    data: { minOffHours: Math.round(minOffHours) },
  });

  return NextResponse.json({ ok: true, minOffHours: Math.round(minOffHours) });
}
