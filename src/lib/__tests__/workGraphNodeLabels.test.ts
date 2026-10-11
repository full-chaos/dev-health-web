import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NODE_TYPE_LABELS } from "@/lib/workGraphNodeLabels";
import { NODE_TYPE_COLOR_SOURCE } from "@/lib/workGraphNodeColors";

// Read the enum members from the generated types, so a new schema value fails here.
function generatedNodeTypes(): string[] {
    const src = readFileSync(join(process.cwd(), "src/lib/graphql/__generated__/types.ts"), "utf8");
    const match = src.match(/export type WorkGraphNodeType =([^;]+);/);
    if (!match) throw new Error("WorkGraphNodeType not found in generated types");
    return [...match[1].matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);
}

describe("work graph node type maps", () => {
    const types = generatedNodeTypes();

    it("reads the whole enum", () => {
        expect(types.length).toBeGreaterThanOrEqual(19);
    });

    it("has a readable label for every node type", () => {
        for (const type of types) {
            const label = (NODE_TYPE_LABELS as Record<string, string | undefined>)[type];
            expect(label, type).toBeTruthy();
            expect(label, type).not.toMatch(/unlabelled/i);
        }
    });

    it("has a color for every node type", () => {
        for (const type of types) {
            expect(NODE_TYPE_COLOR_SOURCE, type).toHaveProperty(type);
        }
    });
});
