import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { ROOT, scanSinks, scanSource } from "./telemetrySinks.scan";

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

describe("telemetry sink guard: call shapes", () => {
    const scan = (text: string) => scanSource("src/x.ts", text);

    it("counts an aliased logger, a child of a child and an import alias", () => {
        const result = scan(
            [
                'import { logger as appLog } from "@/lib/logger";',
                'const a = appLog.child({ m: "a" });',
                "const b = a.child({});",
                "const c = (b);",
                'c.info({ ok: 1 }, "x");',
                'appLog.warn("y");',
            ].join("\n"),
        );
        expect(result.row.log).toBe(2);
        expect(result.violations).toEqual([]);
    });

    it("flags a forbidden field behind an alias, a spread argument and a computed call", () => {
        const result = scan(
            [
                'import { logger } from "@/lib/logger";',
                "const routeLogger = logger.child({});",
                "declare const args: unknown[];",
                'routeLogger.error({ headers: 1 }, "x");',
                "logger.error(...args);",
                'logger["error"]("z");',
            ].join("\n"),
        );
        expect(result.violations.map((v) => v.split(" ")[0])).toEqual(["R2", "R2", "R2"]);
    });

    it("fails closed on source that does not parse", () => {
        expect(scan("const = ;").violations[0]).toMatch(/^P1 /);
    });
});
