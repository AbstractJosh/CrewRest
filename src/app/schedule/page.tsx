import { redirect } from "next/navigation";
import { findLatestPilotCrewId } from "@/lib/views/pilotScheduleView";

/**
 * "Schedule" in the header, for every page that isn't already under /pilot/.
 *
 * The header is a client component in the root layout, so it cannot ask the database which pilot
 * to link to — and making it able to would turn `/` and `/upload` dynamic for the sake of one
 * href. This route absorbs that instead: one query, one redirect, and the rest of the app stays
 * static. It renders nothing, ever.
 */
export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  const crewId = await findLatestPilotCrewId();
  // Nothing uploaded yet, so there is no schedule to show — send them to the thing they'd have to
  // do first anyway rather than to a 404.
  redirect(crewId ? `/pilot/${crewId}` : "/upload");
}
