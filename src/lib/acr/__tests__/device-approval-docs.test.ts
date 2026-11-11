import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../../../..");
const read = (file: string) => readFileSync(join(ROOT, file), "utf8");

const PAGE = "docs/auth-acr-device-approval.md";
const SOURCE = "src/lib/acr/device-approval-architecture.md";

const mermaidBlocks = (text: string): string[] =>
    [...text.matchAll(/```mermaid\n([\s\S]*?)```/gu)].map((match) => match[1] ?? "");

// The rows of the table whose header row starts with `firstHeader`, each cut to its first `columns`
// cells and trimmed, so a table that prettier realigned still compares equal.
const tableRows = (text: string, firstHeader: string, columns: number): string[][] => {
    const lines = text.split("\n");
    const start = lines.findIndex((line) => line.startsWith(`| ${firstHeader} `));
    if (start < 0) return [];
    const rows: string[][] = [];
    for (let i = start + 2; i < lines.length && (lines[i] ?? "").startsWith("|"); i++) {
        const cells = (lines[i] ?? "")
            .split("|")
            .slice(1, -1)
            .map((cell) => cell.trim());
        rows.push(cells.slice(0, columns));
    }
    return rows;
};

describe("the device approval page and its diagram source", () => {
    it("Given the page and the source file, then both hold the same two diagrams", () => {
        const page = mermaidBlocks(read(PAGE));
        const source = mermaidBlocks(read(SOURCE));
        expect(source).toHaveLength(2);
        expect(page).toEqual(source);
    });

    it.each([
        ["Token", 5, 9],
        ["Key", 3, 3],
        ["Setting", 5, 3],
    ] as const)(
        "Given the %s table, then the page rows equal the first %i columns of the source rows",
        (header, columns, count) => {
            const page = tableRows(read(PAGE), header, columns);
            const source = tableRows(read(SOURCE), header, columns);
            expect(source).toHaveLength(count);
            expect(page).toEqual(source);
        },
    );

    it("Given the public page, then it names no tracker id, ruling id or agent", () => {
        expect(read(PAGE)).not.toMatch(
            /CHAOS-\d|\bD\d{4}\b|\b(?:acp|cag|fcsup|fcdev|lane)\b|#\d{3,}/u,
        );
    });

    it("Given the two code entry points, then each points at the diagram source", () => {
        expect(read("src/lib/acr/assertion.ts")).toContain("device-approval-architecture.md");
        expect(read("src/app/api/acr/device/route.ts")).toContain(
            "device-approval-architecture.md",
        );
    });
});
