import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * CHAOS-7728: FlowView (the Work "flow" workbench, mounted nowhere) is deleted. This scan keeps
 * it deleted: its files do not exist and no file under src imports it or its child folder.
 */
const SRC = join(process.cwd(), "src");
const REMOVED = [
    "components/work/FlowView.tsx",
    "components/work/FlowView/Chart.tsx",
    "components/work/FlowView/InspectPanel.tsx",
    "components/work/FlowView/InspectPanel.test.tsx",
    "components/work/FlowView/Tabs.tsx",
    "components/work/FlowView/Toolbar.tsx",
    "components/work/FlowView/useFlowHandlers.ts",
];
const IMPORT_OF_FLOWVIEW =
    /(?:from\s+|import\s*\(\s*|import\s+)["'][^"']*\/FlowView(?:\/[^"']*)?["']/u;

function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full, out);
        else if (/\.(ts|tsx|js|jsx|mjs)$/u.test(entry.name)) out.push(full);
    }
    return out;
}

describe("FlowView stays deleted", () => {
    it("none of its files exist", () => {
        expect(REMOVED.filter((file) => existsSync(join(SRC, file)))).toEqual([]);
    });

    it("no file under src imports FlowView or a file in its folder", () => {
        const self = join(SRC, "components/work/flowViewRemoved.test.ts");
        const importers = walk(SRC)
            .filter((file) => file !== self)
            .filter((file) => IMPORT_OF_FLOWVIEW.test(readFileSync(file, "utf8")))
            .map((file) => relative(SRC, file));
        expect(importers).toEqual([]);
    });

    it("the scan itself matches the import forms it is meant to catch", () => {
        for (const line of [
            'import { FlowView } from "@/components/work/FlowView";',
            'import { Chart } from "./FlowView/Chart";',
            'const m = await import("@/components/work/FlowView");',
            'import "@/components/work/FlowView/Tabs";',
        ]) {
            expect(IMPORT_OF_FLOWVIEW.test(line), line).toBe(true);
        }
        expect(IMPORT_OF_FLOWVIEW.test('import { FlowViewProps } from "./other";')).toBe(false);
    });
});
