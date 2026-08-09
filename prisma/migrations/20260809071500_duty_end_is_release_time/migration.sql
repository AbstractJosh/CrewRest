/*
  Renames the DutyPeriod duty-boundary columns so their meaning is unambiguous.

  Before: `endAt` held DSB (end of minimum rest), `dutyEndAt` held MS (duty release).
  After:  `endAt` holds MS, `restEndsAt` holds DSB (nullable — day-offs carry no DSB).

  That inversion caused off-window gaps to start at the end of the mandatory rest period
  instead of at duty release, making every window short by its rest requirement.

  The column swap below preserves existing rows, but day-off rows keep the old `MS + 1 minute`
  roll-forward artifact in `endAt` and a meaningless `restEndsAt`. Re-upload the schedule to
  get a fully correct parse.
*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DutyPeriod" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scheduleId" TEXT NOT NULL,
    "startAt" DATETIME NOT NULL,
    "endAt" DATETIME NOT NULL,
    "restEndsAt" DATETIME,
    "type" TEXT NOT NULL,
    "rawCode" TEXT NOT NULL,
    "flightLegs" JSONB,
    "sortIndex" INTEGER NOT NULL,
    CONSTRAINT "DutyPeriod_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "ScheduleUpload" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_DutyPeriod" ("id", "scheduleId", "startAt", "endAt", "restEndsAt", "type", "rawCode", "flightLegs", "sortIndex")
SELECT "id", "scheduleId", "startAt", "dutyEndAt", "endAt", "type", "rawCode", "flightLegs", "sortIndex" FROM "DutyPeriod";
DROP TABLE "DutyPeriod";
ALTER TABLE "new_DutyPeriod" RENAME TO "DutyPeriod";
CREATE INDEX "DutyPeriod_scheduleId_idx" ON "DutyPeriod"("scheduleId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
