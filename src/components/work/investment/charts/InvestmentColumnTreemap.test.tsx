import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

import type { TreemapNode } from "@/components/charts/TreemapChart";

vi.mock("@/components/charts/chartTheme", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/components/charts/chartTheme")>();
    return {
        ...actual,
        useChartTheme: () => ({ ...actual.fallbackTheme, background: "#ffffff", grid: "#e5e7eb" }),
    };
});

import { InvestmentColumnTreemap, columnTreemapKey } from "./InvestmentColumnTreemap";

const sub = (themeKey: string, id: string, name: string, value: number, opacity?: number) =>
    ({
        name,
        value,
        itemStyle: { color: "#ff6600", opacity },
        nodeType: "subcategory",
        categoryId: `${themeKey}.${id}`,
    }) as TreemapNode;

const theme = (key: string, name: string, value: number, color: string, kids: TreemapNode[]) =>
    ({
        name,
        value,
        itemStyle: { color },
        nodeType: "theme",
        themeKey: key,
        children: kids,
    }) as TreemapNode;

// Given out of order on purpose: the chart must order themes by value.
// The total is 200, not 100, so a value and its percent share are different numbers: a test
// can then tell "sized by the served value" from "sized by a percent the chart made".
const DATA: TreemapNode = {
    name: "Investment",
    value: 200,
    children: [
        theme("quality", "Quality", 50, "#00aacc", [
            sub("quality", "bugfix", "Bugfix", 40, 0.5),
            sub("quality", "testing", "Testing", 10),
        ]),
        theme("feature_delivery", "Feature Delivery", 120, "#ff6600", [
            sub("feature_delivery", "customer", "Customer", 2),
            sub("feature_delivery", "roadmap", "Roadmap", 78),
            sub("feature_delivery", "enablement", "Enablement", 40),
        ]),
        theme("risk", "Risk", 30, "#cc8800", []),
        theme("empty", "Empty", 0, "#000000", []),
    ],
};

const draw = (props: Partial<Parameters<typeof InvestmentColumnTreemap>[0]> = {}) =>
    render(<InvestmentColumnTreemap data={DATA} ariaLabel="Investment mix" {...props} />);

const columns = () => screen.getAllByTestId("column-treemap-column");

describe("InvestmentColumnTreemap (approved prototype treemapChart)", () => {
    it("draws one column per theme with a value, in one row, largest first", () => {
        draw();
        expect(columns().map((c) => c.getAttribute("data-node-key"))).toEqual([
            "theme:feature_delivery",
            "theme:quality",
            "theme:risk",
        ]);
        // A theme with no effort gets no column (and no legend entry).
        expect(screen.queryByText("Empty")).toBeNull();
    });

    it("sets each column's width by the theme's value: fr units of the served values", () => {
        draw();
        const grid = screen.getByTestId("column-treemap-columns");
        expect(grid.style.gridTemplateColumns).toBe(
            "minmax(0, 120fr) minmax(0, 50fr) minmax(0, 30fr)",
        );
        expect(columns().map((c) => Number(c.getAttribute("data-share")))).toEqual([60, 25, 15]);
    });

    it("heads each column with the theme name and its share, with one decimal at most", () => {
        render(
            <InvestmentColumnTreemap
                ariaLabel="Investment mix"
                data={{
                    name: "Investment",
                    value: 3,
                    children: [
                        theme("a", "Alpha", 2, "#ff6600", []),
                        theme("b", "Beta", 1, "#00aacc", []),
                    ],
                }}
            />,
        );
        const heads = screen.getAllByTestId("column-treemap-head");
        expect(heads.map((h) => h.textContent)).toEqual(["Alpha66.7%", "Beta33.3%"]);
    });

    it("fills a column with its subcategories, largest first; each cell's flex weight is its served value", () => {
        draw();
        const cells = within(columns()[0]).getAllByTestId("column-treemap-cell");
        expect(cells.map((c) => c.getAttribute("data-node-key"))).toEqual([
            "subcategory:feature_delivery.roadmap",
            "subcategory:feature_delivery.enablement",
            "subcategory:feature_delivery.customer",
        ]);
        // Area by value: the flex-grow of each cell is the value itself, never a rescaled number.
        expect(cells.map((c) => c.style.flex)).toEqual(["78 1 0%", "40 1 0%", "2 1 0%"]);
    });

    it("splits by value in alternating directions: the largest across the height, the rest beside each other", () => {
        draw();
        const area = within(columns()[0]).getByTestId("column-treemap-cells");
        expect(area.className).toContain("flex-col");
        const [first, restBox] = Array.from(area.children) as HTMLElement[];
        expect(first.getAttribute("data-node-key")).toBe("subcategory:feature_delivery.roadmap");
        // The rest share what is left (40 + 2), side by side.
        expect(restBox.style.flex).toBe("42 1 0%");
        expect(restBox.className).toContain("flex-row");
        const [second, innerBox] = Array.from(restBox.children) as HTMLElement[];
        expect(second.getAttribute("data-node-key")).toBe(
            "subcategory:feature_delivery.enablement",
        );
        // The last item sits in its own box, weighted by its value, split the other way again.
        expect(innerBox.style.flex).toBe("2 1 0%");
        expect(innerBox.className).toContain("flex-col");
        expect(
            within(innerBox)
                .getAllByTestId("column-treemap-cell")
                .map((c) => c.getAttribute("data-node-key")),
        ).toEqual(["subcategory:feature_delivery.customer"]);
    });

    it("draws a theme with no subcategory as one cell: the theme itself", () => {
        draw();
        const cells = within(columns()[2]).getAllByTestId("column-treemap-cell");
        expect(cells).toHaveLength(1);
        expect(cells[0].getAttribute("data-node-key")).toBe("theme:risk");
    });

    it("keeps the served color and the served opacity (evidence quality) of each cell", () => {
        draw();
        const bugfix = screen
            .getAllByTestId("column-treemap-cell")
            .find((c) => c.getAttribute("data-node-key") === "subcategory:quality.bugfix")!;
        const fill = within(bugfix).getByTestId("column-treemap-fill");
        expect(fill.style.backgroundColor).toBe("rgb(255, 102, 0)");
        expect(fill.style.opacity).toBe("0.5");
        // No opacity served: none is set (never a default that looks like a quality value).
        const testing = screen
            .getAllByTestId("column-treemap-cell")
            .find((c) => c.getAttribute("data-node-key") === "subcategory:quality.testing")!;
        expect(within(testing).getByTestId("column-treemap-fill").style.opacity).toBe("");
    });

    it("labels a cell with its name and its share of the total; no label under 2% (production's rule)", () => {
        draw();
        const byKey = (key: string) =>
            screen
                .getAllByTestId("column-treemap-cell")
                .find((c) => c.getAttribute("data-node-key") === key)!;
        expect(
            within(byKey("subcategory:feature_delivery.roadmap")).getByTestId(
                "column-treemap-label",
            ),
        ).toHaveTextContent("Roadmap39%");
        // 2 of 200 = 1%: the cell is drawn, its label is not.
        expect(
            within(byKey("subcategory:feature_delivery.customer")).queryByTestId(
                "column-treemap-label",
            ),
        ).toBeNull();
    });

    it("has a legend row of the themes with their shares, in the column order", () => {
        draw();
        const legend = screen.getByTestId("column-treemap-legend");
        expect(
            within(legend)
                .getAllByRole("listitem")
                .map((li) => li.textContent),
        ).toEqual(["Feature Delivery60%", "Quality25%", "Risk15%"]);
    });

    it("reports a click with the node, its path and its data (the old chart's click shape)", () => {
        const onClick = vi.fn();
        draw({ onNodeClickAction: onClick });
        fireEvent.click(
            screen
                .getAllByTestId("column-treemap-cell")
                .find((c) => c.getAttribute("data-node-key") === "subcategory:quality.bugfix")!,
        );
        expect(onClick).toHaveBeenLastCalledWith(
            expect.objectContaining({
                name: "Bugfix",
                path: ["Quality", "Bugfix"],
                data: expect.objectContaining({ categoryId: "quality.bugfix", value: 40 }),
            }),
        );
        fireEvent.click(screen.getAllByTestId("column-treemap-head")[0]);
        expect(onClick).toHaveBeenLastCalledWith(
            expect.objectContaining({ name: "Feature Delivery", path: ["Feature Delivery"] }),
        );
    });

    it("marks the selected node as pressed, and only that one", () => {
        draw({ selectedKey: "subcategory:quality.bugfix" });
        const pressed = screen
            .getAllByRole("button")
            .filter((b) => b.getAttribute("aria-pressed") === "true");
        expect(pressed).toHaveLength(1);
        expect(pressed[0].getAttribute("data-node-key")).toBe("subcategory:quality.bugfix");
    });

    it("names each cell for assistive technology and the tooltip from the caller's description", () => {
        draw({ describeNodeAction: (node, path) => `${path.join(" > ")} = ${node.value}` });
        const cell = screen
            .getAllByTestId("column-treemap-cell")
            .find((c) => c.getAttribute("data-node-key") === "subcategory:quality.bugfix")!;
        expect(cell).toHaveAttribute("aria-label", "Quality > Bugfix = 40");
        expect(cell).toHaveAttribute("title", "Quality > Bugfix = 40");
    });

    it("draws nothing when there is no theme with a value (the section shows its own empty text)", () => {
        const { container } = render(
            <InvestmentColumnTreemap
                ariaLabel="Investment mix"
                data={{ name: "Investment", value: 0, children: [] }}
            />,
        );
        expect(container).toBeEmptyDOMElement();
    });

    it("keys a node the way the section keys its selection", () => {
        expect(columnTreemapKey(DATA.children![0])).toBe("theme:quality");
        expect(columnTreemapKey(DATA.children![0].children![0])).toBe("subcategory:quality.bugfix");
    });
});
