import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { STATIONS } from "@/lib/trains/data/yhtRoutes";

export async function POST(
  request: NextRequest,
  ctx: RouteContext<"/api/pilot/[crewId]/home-city">,
) {
  const { crewId } = await ctx.params;
  const body = await request.json();
  const station = STATIONS[body.stationCode];
  if (!station) {
    return NextResponse.json({ error: "Unknown station." }, { status: 400 });
  }

  const pilot = await prisma.pilot.findUnique({ where: { crewId } });
  if (!pilot) {
    return NextResponse.json({ error: "Pilot not found." }, { status: 404 });
  }

  await prisma.pilot.update({
    where: { id: pilot.id },
    data: {
      homeCity: station.city,
      homeStationCode: station.code,
      homeStationName: station.name,
    },
  });

  return NextResponse.json({ ok: true });
}
