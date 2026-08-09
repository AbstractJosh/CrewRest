-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Pilot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "crewId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aircraftType" TEXT,
    "homeCity" TEXT,
    "homeStationCode" TEXT,
    "homeStationName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Pilot" ("aircraftType", "createdAt", "crewId", "homeCity", "homeStationCode", "homeStationName", "id", "name") SELECT "aircraftType", "createdAt", "crewId", "homeCity", "homeStationCode", "homeStationName", "id", "name" FROM "Pilot";
DROP TABLE "Pilot";
ALTER TABLE "new_Pilot" RENAME TO "Pilot";
CREATE UNIQUE INDEX "Pilot_crewId_key" ON "Pilot"("crewId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
