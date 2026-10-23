import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { ROOT, scanSinks } from "./telemetrySinks.scan";

const TABLE_PATH = path.join(ROOT, "src/lib/__tests__/telemetry-sinks.table.json");

// A failure names a rule and file:line only, never source text. P1 = a file that does not parse
// (fail closed), R1 = console use outside the logger shim, R2 = a log call that passes a request,
// header, cookie, token, session, body or variables, or spreads a variable, R3 = the sink table differs.
describe("telemetry sink guard", () => {
    const scan = scanSinks();

    it("has no console use, no forbidden log field and no unparsable file", () => {
        expect(scan.violations).toEqual([]);
    });

    it("matches the checked-in sink table, so a new sink is reviewed", () => {
        const expected = JSON.parse(fs.readFileSync(TABLE_PATH, "utf8")) as typeof scan.table;
        const drift: string[] = [];
        for (const file of new Set([...Object.keys(expected), ...Object.keys(scan.table)])) {
            const want = expected[file];
            const got = scan.table[file];
            if (!want || !got || want.log !== got.log || want.sentry !== got.sentry)
                drift.push(`R3 ${file}`);
        }
        expect(drift).toEqual([]);
    });

    it("scans a plausible number of files (fail closed on an empty walk)", () => {
        expect(Object.keys(scan.table).length).toBeGreaterThan(30);
    });
});
