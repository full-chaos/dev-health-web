import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8");
const page = read("app/(app)/landscape/page.tsx").replace(/\s+/gu, " ");
const tabs = read("components/landscape/LandscapeTabs.tsx");
// CHAOS-7765: the four tables are the shared DataTable (through LandscapeTables), so the
// table radius and the caps header come from there.
const tables = read("components/landscape/LandscapeTables.tsx");
const dataTable = read("components/shared/DataTable.tsx");

describe("Landscape page pass (CHAOS-7761)", () => {
    it("the individual-scope sentence is a page-load Notice info", () => {
        expect(page).toMatch(
            /<Notice variant="info" live=\{false\}[^>]*> Individual landscapes are available from the individual view\. <\/Notice>/u,
        );
        expect(page).not.toContain(
            "border-dashed border-(--card-stroke) bg-(--card-70) p-5 text-sm",
        );
    });

    it("the primary panel has a caption (NEW from the approved concept) and no tinted frame", () => {
        expect(page).toContain("Primary for this lens");
        expect(page).not.toContain("border-(--accent-2)/30 bg-(--accent-2)/5");
        expect(page).toContain('data-testid="landscape-primary-panel"');
        expect(page).toContain("flex flex-col gap-8");
        expect(page).not.toContain("flex flex-col gap-10");
    });

    it("the bucket chips are a labelled group and mark the selected link", () => {
        expect(page).toContain('role="group" aria-label="Bucket"');
        expect(
            page.match(/aria-current=\{bucket === "(?:week|month)" \? "true" : undefined\}/gu)
                ?.length,
        ).toBe(2);
    });

    it("the tab cards use token radii", () => {
        expect(tabs).not.toMatch(/rounded-(?:2xl|3xl|\[1\.75rem\])/u);
        expect(tabs).toContain("rounded-(--radius-md)");
    });

    it("the tables are the shared DataTable and take its token radius and caps header", () => {
        // The Landscape tables render with DataTable, not a table of their own.
        expect(tabs).not.toContain("<table");
        expect(tables).toContain("<DataTable");
        expect(tables).not.toContain("<table");
        for (const text of [tables, dataTable]) {
            expect(text).not.toMatch(/rounded-(?:2xl|3xl|\[1\.75rem\])/u);
        }
        expect(dataTable).toContain("rounded-(--radius-md)");
        expect(dataTable).toContain("text-label-caps");
    });

    it("has no raw palette class", () => {
        for (const text of [page, tabs, tables]) {
            expect(text).not.toMatch(
                /\b(?:text|bg|border)-(?:amber|emerald|rose|red|green|blue|sky)-\d{2,3}/u,
            );
        }
    });
});
