import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * CHAOS-2037 — fixture-leak guard.
 *
 * Customer/demo surfaces must never render fixture-only identifiers. The
 * synthetic seed and the frontend demo/sample data are the two sources that
 * feed rendered labels (org switcher, churn paths, repo coverage, delivery
 * risk). This guard statically scans those rendered-data sources so a fixture
 * identifier (`Fixture Org`, `acme/demo-app`, an `acme/` scope label, or a bare
 * UUID used as a display label) can never regress back onto a demo screen.
 *
 * Runtime UUID→name resolution (when a real id fails to resolve) is owned by the
 * shared render-safe entity-label helper (CHAOS-2034); this guard covers the
 * static data that the demo renders by default.
 */

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, "../../..");

const read = (relPath: string): string => readFileSync(resolve(webRoot, relPath), "utf8");

/** Fixture-only identifiers that must never appear in rendered demo data. */
const FORBIDDEN_SUBSTRINGS: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /Fixture Org/i,
    reason: "fixture org display name leaked from the seed",
  },
  {
    pattern: /acme\/demo-app/i,
    reason: "fixture default repo name 'acme/demo-app' leaked",
  },
  {
    pattern: /\bacme\//i,
    reason: "fixture-flavoured 'acme/' scope label — use curated 'meridian/*'",
  },
  {
    pattern: /Default Organization/i,
    reason: "fixture 'Default Organization' display name — use the curated brand",
  },
  {
    pattern: /\bdefault-org\b/i,
    reason: "fixture 'default-org' identifier rendered in demo data — use a curated id",
  },
];

/** Bare UUID used as a literal value (acceptable in functional mocks, not in labels). */
const BARE_UUID =
  /["'`][0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}["'`]/;

/**
 * Files whose string content becomes a rendered demo/sample label. These carry
 * curated names only — no functional UUIDs — so they are also scanned for bare
 * UUID literals.
 */
const RENDERED_LABEL_FILES = [
  "src/data/devHealthOpsSample.ts",
  "src/lib/workGraph/demo.ts",
  "src/data/devHealthOpsTranslations.ts",
];

/**
 * MSW mock responses that drive demo/e2e screens. These legitimately contain
 * functional UUIDs (billing audit ids, etc.), so they are scanned for the
 * fixture-only substrings but not for bare UUID literals.
 */
const MOCK_RESPONSE_FILES = ["tests/mocks/handlers.ts", "tests/mocks/aiSample.ts"];

describe("fixture-leak guard (CHAOS-2037)", () => {
  for (const file of [...RENDERED_LABEL_FILES, ...MOCK_RESPONSE_FILES]) {
    it(`${file} renders no fixture-only identifiers`, () => {
      const source = read(file);
      const offenders = FORBIDDEN_SUBSTRINGS.filter(({ pattern }) => pattern.test(source)).map(
        ({ reason }) => reason,
      );
      expect(offenders, `${file}: ${offenders.join("; ")}`).toEqual([]);
    });
  }

  for (const file of RENDERED_LABEL_FILES) {
    it(`${file} renders no bare UUID labels`, () => {
      const source = read(file);
      expect(BARE_UUID.test(source), `${file} contains a bare UUID string literal`).toBe(false);
    });
  }
});
