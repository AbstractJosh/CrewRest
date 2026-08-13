/**
 * Guards the property that makes a second client cheap: `src/lib` does not depend on the web
 * framework, and the parts of it that are pure domain logic do not depend on the database either.
 *
 * This is not style policing. CrewRest is meant to grow a native client that talks to this server,
 * and the only reason that is a small job is that the ~2k lines under `src/lib` import neither
 * `next/*` nor Prisma. That property is currently held by discipline alone, and discipline fails
 * quietly — one `import { notFound } from "next/navigation"` in a helper is invisible in review and
 * expensive to unpick months later. Failing here names the file on the commit that introduces it.
 *
 * When something genuinely belongs on the server, add it to SERVER_ONLY rather than loosening the
 * rule. The list is meant to stay short and to be an explicit decision each time it grows.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LIB_DIR = path.dirname(fileURLToPath(import.meta.url));

/**
 * Modules that legitimately reach for the database. Everything else in `src/lib` must be able to
 * run in a client with no server around it.
 */
const SERVER_ONLY = new Set([
  "prisma.ts",
  "views/offWindowView.ts",
  "views/pilotScheduleView.ts",
]);

function sourceFiles(dir: string, prefix = ""): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      // Fixtures are captured JSON payloads, not source.
      if (entry.name === "__fixtures__") return [];
      return sourceFiles(path.join(dir, entry.name), relative);
    }
    return entry.name.endsWith(".ts") ? [relative] : [];
  });
}

/**
 * Comments out of the way before scanning — prose about an import is not an import, and this file
 * quotes several. Block comments go entirely; line comments only when the `//` opens the line, so
 * the `https://` inside string literals elsewhere survives.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

/** Every module specifier in the file: `from "x"`, `import "x"`, `import("x")`. */
function importsOf(relativePath: string): string[] {
  const source = stripComments(readFileSync(path.join(LIB_DIR, relativePath), "utf8"));
  const specifiers: string[] = [];
  const pattern = /(?:\bfrom\s*|\bimport\s*\(?\s*)["']([^"']+)["']/g;
  for (const match of source.matchAll(pattern)) specifiers.push(match[1]);
  return specifiers;
}

const FILES = sourceFiles(LIB_DIR);

test("the guard is actually looking at the codebase", () => {
  // Without this, a broken walk would make every assertion below pass vacuously.
  assert.ok(FILES.length > 20, `expected to find the lib sources, found ${FILES.length}`);
  assert.ok(FILES.includes("trains/TrainProvider.ts"));
  assert.ok(FILES.includes("time/turkeyTime.ts"));
});

test("no module under src/lib imports the web framework", () => {
  const offenders = FILES.filter((file) =>
    importsOf(file).some((spec) => spec === "next" || spec.startsWith("next/")),
  );
  assert.deepEqual(
    offenders,
    [],
    `These import next/*, which pins them to the web app:\n  ${offenders.join("\n  ")}`,
  );
});

test("domain logic under src/lib does not reach for the database", () => {
  const offenders = FILES.filter((file) => {
    if (SERVER_ONLY.has(file) || file.endsWith(".test.ts")) return false;
    return importsOf(file).some(
      (spec) => spec === "@/lib/prisma" || spec.startsWith("@/generated/prisma"),
    );
  });
  assert.deepEqual(
    offenders,
    [],
    `These import Prisma but aren't listed in SERVER_ONLY:\n  ${offenders.join("\n  ")}`,
  );
});

test("every SERVER_ONLY entry still exists", () => {
  // A stale allowlist silently re-permits what it was meant to constrain.
  for (const entry of SERVER_ONLY) {
    assert.ok(FILES.includes(entry), `SERVER_ONLY lists ${entry}, which no longer exists`);
  }
});
