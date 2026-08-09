-- CreateTable
CREATE TABLE "Pilot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "crewId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aircraftType" TEXT,
    "homeCity" TEXT,
    "homeStationCode" INTEGER,
    "homeStationName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ScheduleUpload" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pilotId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rawText" TEXT NOT NULL,
    CONSTRAINT "ScheduleUpload_pilotId_fkey" FOREIGN KEY ("pilotId") REFERENCES "Pilot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DutyPeriod" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scheduleId" TEXT NOT NULL,
    "startAt" DATETIME NOT NULL,
    "endAt" DATETIME NOT NULL,
    "type" TEXT NOT NULL,
    "rawCode" TEXT NOT NULL,
    "flightLegs" JSONB,
    "sortIndex" INTEGER NOT NULL,
    CONSTRAINT "DutyPeriod_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "ScheduleUpload" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OffWindow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scheduleId" TEXT NOT NULL,
    "startAt" DATETIME NOT NULL,
    "endAt" DATETIME NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "travelEligible" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "OffWindow_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "ScheduleUpload" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CommuteCommitment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "offWindowId" TEXT NOT NULL,
    "outboundTrain" JSONB NOT NULL,
    "returnTrain" JSONB NOT NULL,
    "committedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommuteCommitment_offWindowId_fkey" FOREIGN KEY ("offWindowId") REFERENCES "OffWindow" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Pilot_crewId_key" ON "Pilot"("crewId");

-- CreateIndex
CREATE INDEX "ScheduleUpload_pilotId_idx" ON "ScheduleUpload"("pilotId");

-- CreateIndex
CREATE INDEX "DutyPeriod_scheduleId_idx" ON "DutyPeriod"("scheduleId");

-- CreateIndex
CREATE INDEX "OffWindow_scheduleId_idx" ON "OffWindow"("scheduleId");

-- CreateIndex
CREATE UNIQUE INDEX "CommuteCommitment_offWindowId_key" ON "CommuteCommitment"("offWindowId");
