import { buildTurkeyDate } from "@/lib/time/turkeyTime";

export type DutyType = "FLIGHT" | "HSBY" | "DAYOFF";

export interface FlightLeg {
  flightNumber: string;
  origin: string;
  /** Departure time in the *origin station's* local time, as printed (e.g. "16:35"). */
  departureTime: string;
  destination: string;
  /** Arrival time in the *destination station's* local time, as printed (e.g. Munich time for MUC). */
  arrivalTime: string;
  /** Same departure in GMT, from the schedule's GMT table. Absent if the two tables couldn't be paired. */
  departureTimeUtc?: string;
  /** Same arrival in GMT, from the schedule's GMT table. */
  arrivalTimeUtc?: string;
}

export interface ParsedDutyBlock {
  /** MB — report for duty. */
  startAt: Date;
  /** MS — duty release. The pilot is free from here; this drives both display and off-window math. */
  endAt: Date;
  /**
   * DSB — end of the minimum rest period, i.e. the earliest the airline may roster the next
   * duty. A constraint on rostering, NOT on the pilot: they are free to travel during it.
   * Null for day-off blocks, which carry no DSB.
   */
  restEndsAt: Date | null;
  type: DutyType;
  rawCode: string;
  flightLegs: FlightLeg[];
}

export interface ParsedPilotHeader {
  crewId: string;
  name: string;
  aircraftType: string | null;
  period: string | null;
}

export interface ParsedSchedule {
  pilot: ParsedPilotHeader;
  dutyBlocks: ParsedDutyBlock[];
}

const TURKISH_MONTHS: Record<string, number> = {
  OCA: 0,
  SUB: 1,
  MAR: 2,
  NIS: 3,
  MAY: 4,
  HAZ: 5,
  TEM: 6,
  AGU: 7,
  EYL: 8,
  EKI: 9,
  KAS: 10,
  ARA: 11,
};

/**
 * The "LOKAL SAATLI UCUS PROGRAMI" section title is only printed once, on
 * the section's first page; continuation pages repeat just the column
 * header row. So we key off that column header row instead, which repeats
 * on every page of the section. Requiring both "Deger / Limit" and
 * "Kalkis/LT" together uniquely identifies it: the GMT-time table earlier
 * in the document has neither (it uses "Kalkis/GMT" and has no
 * "Deger / Limit" column), and the footnote on page 1 that merely mentions
 * this section by name isn't followed by a real table header either.
 */
const LOCAL_SECTION_HEADER_RE =
  /Sefer[\s\S]{0,60}?Gorev[\s\S]{0,60}?Deger\s*\/\s*Limit[\s\S]{0,60}?Kalkis\/LT[\s\S]{0,120}?Kokpit/;
// Negative lookbehinds guard against "GMB:"/"GMS:" (Gorev Mesai Basi/Sonu),
// which contain "MB:"/"MS:" as substrings and would otherwise be
// misidentified as the block-level report/release fields.
const MB_TOKEN_RE = /(?<![A-Z])MB:\s*(\d{2})([A-ZÇĞİÖŞÜ]{3})\s*(\d{1,2}):(\d{2})/g;
const DSB_RE = /(?<![A-Z])DSB:\s*(\d{2})([A-ZÇĞİÖŞÜ]{3})\s*(\d{1,2}):(\d{2})/;
const MS_RE = /(?<![A-Z])MS:\s*(\d{2})([A-ZÇĞİÖŞÜ]{3})\s*(\d{1,2}):(\d{2})/;
const DAYOFF_RE = /\b(IBE|IBI|IBB)\s+([A-Z]{2,4})\/(\d{1,2}):(\d{2})\s+\2\/(\d{1,2}):(\d{2})/;
const HSBY_RE = /\bHSBY\s+(\d{1,2}):(\d{2})\s+(\d{1,2}):(\d{2})/;
const FLIGHT_LEG_RE =
  /TK(\d+)\s+(?:P\s+)?([A-Z]{2,5})\/(\d{1,2}:\d{2})\s+([A-Z]{2,5})\/(\d{1,2}:\d{2})/g;
/**
 * The same legs as FLIGHT_LEG_RE but in the GMT table (pages 1-2), where the arrival carries
 * a full date ("MUC/01AUG2026 16:20"). That date is what makes the two patterns disjoint:
 * FLIGHT_LEG_RE requires a bare "HH:MM" after the destination slash and so cannot match a
 * GMT row, and this one requires the date and so cannot match a local row.
 */
const GMT_FLIGHT_LEG_RE =
  /TK(\d+)\s+(?:P\s+)?([A-Z]{2,5})\/(\d{1,2}:\d{2})\s+([A-Z]{2,5})\/\d{2}[A-Z]{3}\d{4}\s+(\d{1,2}:\d{2})/g;
const HEADER_RE =
  /\b(\d{6})\s+([A-ZÇĞİÖŞÜ]+)\s+([A-ZÇĞİÖŞÜ]+)\s+Uc Tr\/Fl\/Snf:/;
const AIRCRAFT_RE = /Uc Tr\/Fl\/Snf:\s*([A-Z0-9/]+)/;
const PERIOD_RE = /Period:\s*([\dA-ZÇĞİÖŞÜ]{5,6}\s*-\s*[\dA-ZÇĞİÖŞÜ]{5,6})/;
/** Matches an English-abbreviation date like "01AUG2026", used only to recover the schedule year. */
const YEAR_HINT_RE = /\d{2}[A-Z]{3}(\d{4})/;

function extractLocalTimeSectionText(fullText: string): string {
  const segments: string[] = [];
  let searchFrom = 0;
  while (true) {
    LOCAL_SECTION_HEADER_RE.lastIndex = 0;
    const remaining = fullText.slice(searchFrom);
    const headerMatch = LOCAL_SECTION_HEADER_RE.exec(remaining);
    if (!headerMatch) break;
    const contentStart = searchFrom + headerMatch.index + headerMatch[0].length;
    const printedIdx = fullText.indexOf("Printed", contentStart);
    const contentEnd = printedIdx === -1 ? fullText.length : printedIdx;
    segments.push(fullText.slice(contentStart, contentEnd));
    searchFrom = contentEnd === fullText.length ? fullText.length : contentEnd;
  }
  return segments.join(" ");
}

function splitIntoBlocks(sectionText: string): string[] {
  const indices: number[] = [];
  MB_TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MB_TOKEN_RE.exec(sectionText))) {
    indices.push(match.index);
  }
  const blocks: string[] = [];
  for (let i = 0; i < indices.length; i++) {
    const start = indices[i];
    const end = i + 1 < indices.length ? indices[i + 1] : sectionText.length;
    blocks.push(sectionText.slice(start, end));
  }
  return blocks;
}

function extractScheduleYear(fullText: string): number {
  const match = YEAR_HINT_RE.exec(fullText);
  if (match) return Number(match[1]);
  return new Date().getFullYear();
}

function buildDate(
  year: number,
  monthAbbrev: string,
  day: number,
  hour: number,
  minute: number,
): Date | null {
  const month = TURKISH_MONTHS[monthAbbrev];
  if (month === undefined) return null;
  return buildTurkeyDate(year, month, day, hour, minute);
}

function parseHeader(fullText: string): ParsedPilotHeader {
  const headerMatch = HEADER_RE.exec(fullText);
  const aircraftMatch = AIRCRAFT_RE.exec(fullText);
  const periodMatch = PERIOD_RE.exec(fullText);

  const crewId = headerMatch?.[1] ?? "UNKNOWN";
  const surname = headerMatch?.[2] ?? "";
  const givenName = headerMatch?.[3] ?? "";
  const name = [givenName, surname].filter(Boolean).join(" ") || "Unknown Pilot";

  return {
    crewId,
    name,
    aircraftType: aircraftMatch?.[1] ?? null,
    period: periodMatch ? periodMatch[1].replace(/\s+/g, " ").trim() : null,
  };
}

function parseBlock(blockText: string, year: number): ParsedDutyBlock | null {
  MB_TOKEN_RE.lastIndex = 0;
  const mbMatch = MB_TOKEN_RE.exec(blockText);
  if (!mbMatch) return null;

  const [, mbDay, mbMonth, mbHour, mbMinute] = mbMatch;
  const startAt = buildDate(
    year,
    mbMonth,
    Number(mbDay),
    Number(mbHour),
    Number(mbMinute),
  );
  if (!startAt) return null;

  const dsbMatch = DSB_RE.exec(blockText);
  const msMatch = MS_RE.exec(blockText);
  const msDate = msMatch
    ? buildDate(
        year,
        msMatch[2],
        Number(msMatch[1]),
        Number(msMatch[3]),
        Number(msMatch[4]),
      )
    : null;
  // MS — when the pilot is released and free. Falls back to the report time only
  // if the block is malformed enough to have no MS at all.
  const endAt = msDate ?? startAt;

  // DSB — end of minimum rest. Day-off blocks don't carry one.
  const restEndsAt = dsbMatch
    ? buildDate(
        year,
        dsbMatch[2],
        Number(dsbMatch[1]),
        Number(dsbMatch[3]),
        Number(dsbMatch[4]),
      )
    : null;

  const dayOffMatch = DAYOFF_RE.exec(blockText);
  const hsbyMatch = HSBY_RE.exec(blockText);

  let type: DutyType;
  let rawCode: string;
  const flightLegs: FlightLeg[] = [];

  if (dayOffMatch) {
    type = "DAYOFF";
    rawCode = dayOffMatch[1];
  } else if (hsbyMatch) {
    type = "HSBY";
    rawCode = "HSBY";
  } else {
    type = "FLIGHT";
    FLIGHT_LEG_RE.lastIndex = 0;
    let legMatch: RegExpExecArray | null;
    while ((legMatch = FLIGHT_LEG_RE.exec(blockText))) {
      flightLegs.push({
        flightNumber: `TK${legMatch[1]}`,
        origin: legMatch[2],
        departureTime: legMatch[3],
        destination: legMatch[4],
        arrivalTime: legMatch[5],
      });
    }
    rawCode = flightLegs.map((leg) => leg.flightNumber).join(",") || "FLIGHT";
  }

  return { startAt, endAt, restEndsAt, type, rawCode, flightLegs };
}

interface GmtLeg {
  flightNumber: string;
  departureTime: string;
  arrivalTime: string;
}

function extractGmtLegs(fullText: string): GmtLeg[] {
  const legs: GmtLeg[] = [];
  GMT_FLIGHT_LEG_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = GMT_FLIGHT_LEG_RE.exec(fullText))) {
    legs.push({
      flightNumber: `TK${match[1]}`,
      departureTime: match[3],
      arrivalTime: match[5],
    });
  }
  return legs;
}

/**
 * Pairs each local-table leg with its GMT-table counterpart. Both tables list flights
 * chronologically, so a single forward cursor suffices — but the GMT table omits day-off and
 * standby blocks entirely, so we walk the *legs*, not the blocks. If flight numbers ever
 * diverge we stop pairing rather than risk attaching one flight's GMT times to another.
 */
function attachGmtTimes(blocks: ParsedDutyBlock[], gmtLegs: GmtLeg[]): void {
  let cursor = 0;
  for (const block of blocks) {
    for (const leg of block.flightLegs) {
      const gmtLeg = gmtLegs[cursor];
      if (!gmtLeg || gmtLeg.flightNumber !== leg.flightNumber) return;
      leg.departureTimeUtc = gmtLeg.departureTime;
      leg.arrivalTimeUtc = gmtLeg.arrivalTime;
      cursor++;
    }
  }
}

/**
 * Fixes year rollover: blocks are chronological, so if a block's date lands
 * more than ~60 days before the previous one, the schedule crossed a New
 * Year's boundary and every block from here on needs +1 year.
 */
function fixYearRollovers(blocks: ParsedDutyBlock[]): void {
  const sixtyDaysMs = 60 * 24 * 60 * 60 * 1000;
  let yearOffsetMs = 0;
  for (let i = 1; i < blocks.length; i++) {
    const prev = blocks[i - 1];
    const curr = blocks[i];
    if (curr.startAt.getTime() + yearOffsetMs + sixtyDaysMs < prev.startAt.getTime()) {
      const oneYearMs =
        Date.UTC(curr.startAt.getUTCFullYear() + 1, 0, 1) -
        Date.UTC(curr.startAt.getUTCFullYear(), 0, 1);
      yearOffsetMs += oneYearMs;
    }
    if (yearOffsetMs > 0) {
      curr.startAt = new Date(curr.startAt.getTime() + yearOffsetMs);
      curr.endAt = new Date(curr.endAt.getTime() + yearOffsetMs);
      if (curr.restEndsAt) {
        curr.restEndsAt = new Date(curr.restEndsAt.getTime() + yearOffsetMs);
      }
    }
  }
}

export function parseSchedulePdf(fullText: string): ParsedSchedule {
  const pilot = parseHeader(fullText);
  const year = extractScheduleYear(fullText);
  const sectionText = extractLocalTimeSectionText(fullText);
  const blockTexts = splitIntoBlocks(sectionText);

  const dutyBlocks = blockTexts
    .map((blockText) => parseBlock(blockText, year))
    .filter((block): block is ParsedDutyBlock => block !== null);

  fixYearRollovers(dutyBlocks);
  attachGmtTimes(dutyBlocks, extractGmtLegs(fullText));

  return { pilot, dutyBlocks };
}
