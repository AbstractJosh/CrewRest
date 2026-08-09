/*
  Warnings:

  - Added the required column `dutyEndAt` to the `DutyPeriod` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DutyPeriod" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scheduleId" TEXT NOT NULL,
    "startAt" DATETIME NOT NULL,
    "endAt" DATETIME NOT NULL,
    "dutyEndAt" DATETIME NOT NULL,
    "type" TEXT NOT NULL,
    "rawCode" TEXT NOT NULL,
    "flightLegs" JSONB,
    "sortIndex" INTEGER NOT NULL,
    CONSTRAINT "DutyPeriod_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "ScheduleUpload" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
-- Backfill existing rows with endAt as a placeholder; they belong to
-- historical uploads that get superseded by a fresh upload going forward.
INSERT INTO "new_DutyPeriod" ("endAt", "dutyEndAt", "flightLegs", "id", "rawCode", "scheduleId", "sortIndex", "startAt", "type") SELECT "endAt", "endAt", "flightLegs", "id", "rawCode", "scheduleId", "sortIndex", "startAt", "type" FROM "DutyPeriod";
DROP TABLE "DutyPeriod";
ALTER TABLE "new_DutyPeriod" RENAME TO "DutyPeriod";
CREATE INDEX "DutyPeriod_scheduleId_idx" ON "DutyPeriod"("scheduleId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
