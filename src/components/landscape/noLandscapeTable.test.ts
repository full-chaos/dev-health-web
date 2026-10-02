import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// CHAOS-7765: the Landscape tabs use the shared DataTable. The local
// `LandscapeTable` is gone: nothing may import or define it.

const root = join(process.cwd(), "src");

function files(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) return files(full);
        return /\.(ts|tsx)$/u.test(entry) ? [full] : [];
    });
}

describe("one table", () => {
    it("has no LandscapeTable anywhere under src (outside this test)", () => {
        const offenders = files(root)
            .filter((file) => !file.endsWith("noLandscapeTable.test.ts"))
            .filter((file) => /\bLandscapeTable\b/u.test(readFileSync(file, "utf8")))
            .map((file) => file.slice(root.length + 1));
        expect(offenders).toEqual([]);
    });
});
