import { NextRequest, NextResponse } from "next/server";
import { extractPdfText } from "@/lib/pdf/extract";
import { parseSchedulePdf } from "@/lib/pdf/scheduleParser";
import { computeOffWindows } from "@/lib/schedule/offWindows";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
    return NextResponse.json({ error: "File must be a PDF." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let fullText: string;
  try {
    fullText = await extractPdfText(buffer);
  } catch (err) {
    console.error("extractPdfText failed", err);
    return NextResponse.json(
      { error: "Could not read this PDF. It may be corrupted or scanned as an image." },
      { status: 400 },
    );
  }

  const parsed = parseSchedulePdf(fullText);
  if (parsed.pilot.crewId === "UNKNOWN" || parsed.dutyBlocks.length === 0) {
    return NextResponse.json(
      { error: "This doesn't look like a recognized crew schedule PDF." },
      { status: 422 },
    );
  }

  // Store every gap between duties, however short. Which ones count as a
  // "commute opportunity" is a per-pilot, adjustable display filter
  // (Pilot.minOffHours) applied at render time, not baked in here.
  const offWindows = computeOffWindows(parsed.dutyBlocks, { minDurationMinutes: 0 });

  const pilot = await prisma.pilot.upsert({
    where: { crewId: parsed.pilot.crewId },
    update: {
      name: parsed.pilot.name,
      aircraftType: parsed.pilot.aircraftType,
    },
    create: {
      crewId: parsed.pilot.crewId,
      name: parsed.pilot.name,
      aircraftType: parsed.pilot.aircraftType,
    },
  });

  await prisma.scheduleUpload.create({
    data: {
      pilotId: pilot.id,
      period: parsed.pilot.period ?? "Unknown period",
      rawText: fullText,
      dutyPeriods: {
        create: parsed.dutyBlocks.map((block, index) => ({
          startAt: block.startAt,
          endAt: block.endAt,
          restEndsAt: block.restEndsAt,
          type: block.type,
          rawCode: block.rawCode,
          flightLegs: block.flightLegs as unknown as Prisma.InputJsonValue,
          sortIndex: index,
        })),
      },
      offWindows: {
        create: offWindows.map((w) => ({
          startAt: w.startAt,
          endAt: w.endAt,
          durationMinutes: w.durationMinutes,
          kind: w.kind,
          travelEligible: w.travelEligible,
        })),
      },
    },
  });

  return NextResponse.json({ crewId: pilot.crewId });
}
