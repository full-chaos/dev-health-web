import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { sourceEntries } from "@/test/sourceTree";

// CHAOS-7775: the centred AIDrilldownModal is retired; the shared Drawer replaces it. This scan
// fails if a source file imports it again.
function sourceFiles(dir: string): string[] {
    return sourceEntries(dir).flatMap(({ name, path, isDirectory }) => {
        if (isDirectory) return sourceFiles(path);
        return /\.(tsx?|mdx?)$/.test(name) ? [path] : [];
    });
}

describe("AIDrilldownModal is retired", () => {
    it("has no importer left under src/", () => {
        const root = join(process.cwd(), "src");
        const self = join("components", "ai", "__tests__", "aiDrilldownModalRetired.test.ts");
        const importers = sourceFiles(root).filter(
            (file) =>
                !file.endsWith(self) &&
                /from\s+["'][^"']*AIDrilldownModal["']/.test(readFileSync(file, "utf8")),
        );
        expect(importers).toEqual([]);
    });
});
