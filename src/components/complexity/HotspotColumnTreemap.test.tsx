import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@/test/utils";

import type { TreemapNode } from "@/components/charts/TreemapChart";

import { HotspotColumnTreemap, layoutHotspotColumns } from "./HotspotColumnTreemap";

afterEach(cleanup);

const leaf = (name: string, value: number, extra: Record<string, unknown> = {}) =>
    ({ name, value, filePath: `src/${name}`, ...extra }) as TreemapNode;

// The tree `buildTreemapData` builds: repositories (value = sum of their files) → files.
const data: TreemapNode = {
    name: "Hotspots",
    value: 200,
    children: [
        {
            name: "dev-health-ops",
            value: 120,
            children: [
                leaf("generated.go", 34.2),
                leaf("float_text_golden.json", 55.4, { cyclomaticAvg: 3, churnLoc30d: 1200 }),
                leaf("recommendations.json", 30.4),
            ],
        },
        { name: "dev-health-web", value: 80, children: [leaf("profiles.json", 80)] },
    ],
};

describe("layoutHotspotColumns", () => {
    it("keeps the served repository order and sizes each column by its share of the risk scores", () => {
        const columns = layoutHotspotColumns(data, 1006, 260);
        expect(columns.map((c) => c.name)).toEqual(["dev-health-ops", "dev-health-web"]);
        // 1006 px minus one 6 px gap, split 120 : 80.
        expect(columns[0].w).toBeCloseTo(600, 6);
        expect(columns[1].w).toBeCloseTo(400, 6);
        expect(columns[1].x).toBeCloseTo(606, 6);
    });

    it("lays the files of a column out largest first, inside the column, below the head", () => {
        const [ops] = layoutHotspotColumns(data, 1006, 260);
        expect(ops.cells.map((c) => c.item.name)).toEqual([
            "float_text_golden.json",
            "generated.go",
            "recommendations.json",
        ]);
        for (const cell of ops.cells) {
            expect(cell.x).toBeGreaterThanOrEqual(ops.x - 1e-9);
            expect(cell.x + cell.w).toBeLessThanOrEqual(ops.x + ops.w + 1e-9);
            expect(cell.y).toBeGreaterThanOrEqual(24 - 1e-9);
            expect(cell.y + cell.h).toBeLessThanOrEqual(260 + 1e-9);
        }
    });
});

describe("HotspotColumnTreemap", () => {
    it("draws one column per repository, headed by its name only (no web-made risk sum)", () => {
        render(<HotspotColumnTreemap data={data} width={1006} />);
        const heads = screen.getAllByTestId("hotspot-column-head");
        expect(heads.map((h) => h.textContent)).toEqual([
            "dev-health-opsdev-health-ops",
            "dev-health-webdev-health-web",
        ]);
        // The owner prefix is left out of the head; the full name stays in the tooltip.
        cleanup();
        render(
            <HotspotColumnTreemap
                data={{
                    name: "Hotspots",
                    value: 1,
                    children: [
                        {
                            name: "full-chaos/dev-health-ops",
                            value: 1,
                            children: [leaf("a.go", 1)],
                        },
                    ],
                }}
                width={600}
            />,
        );
        const [owned] = screen.getAllByTestId("hotspot-column-head");
        expect(owned.firstChild?.textContent).toBe("dev-health-ops");
        expect(owned.querySelector("title")?.textContent).toBe("full-chaos/dev-health-ops");
        // The prototype prints "<sum> risk" under the name; the sum would be web-made.
        for (const head of heads) {
            expect(head.textContent).not.toMatch(/risk|120|80/i);
        }
    });

    it("labels a large cell top-left with the file name and its served score", () => {
        render(<HotspotColumnTreemap data={data} width={1006} />);
        const [ops] = screen.getAllByTestId("hotspot-column");
        const first = within(ops).getAllByTestId("hotspot-cell")[0];
        expect(within(first).getByTestId("hotspot-cell-label")).toHaveTextContent(
            "float_text_golden.json55.4",
        );
    });

    it("shades cells by their rank in the column (1, .82, .66)", () => {
        render(<HotspotColumnTreemap data={data} width={1006} />);
        const [ops] = screen.getAllByTestId("hotspot-column");
        const opacities = within(ops)
            .getAllByTestId("hotspot-cell")
            .map((cell) => cell.querySelector("rect")?.getAttribute("fill-opacity"));
        expect(opacities).toEqual(["1", "0.82", "0.66"]);
    });

    it("tells the served file values in each cell's tooltip", () => {
        render(<HotspotColumnTreemap data={data} width={1006} />);
        const [ops] = screen.getAllByTestId("hotspot-column");
        const title = within(ops).getAllByTestId("hotspot-cell")[0].querySelector("title");
        expect(title?.textContent).toBe(
            "src/float_text_golden.json\nRisk score: 55.4\nCyclomatic avg: 3\nChurn LOC 30d: 1,200",
        );
    });

    it("shows a small served score as served, never as 0", () => {
        const small: TreemapNode = {
            name: "Hotspots",
            value: 0.04,
            children: [{ name: "repo", value: 0.04, children: [leaf("tiny.ts", 0.04)] }],
        };
        render(<HotspotColumnTreemap data={small} width={600} />);
        const label = screen.getByTestId("hotspot-cell-label");
        expect(label).toHaveTextContent("tiny.ts");
        expect(label.textContent).not.toMatch(/tiny\.ts0$/);
    });
});
