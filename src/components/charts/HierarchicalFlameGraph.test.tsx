import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@/test/utils";

import { HierarchicalFlameGraph, formatAmount, flameLabel } from "./HierarchicalFlameGraph";

const chartTheme = {
    text: "#f1f3f4",
    grid: "#232c32",
    muted: "#a7afb5",
    background: "#161c20",
    stroke: "#28323a",
    accent1: "#555555",
    accent2: "#666666",
    accent3: "#777777",
};
const tokens = { themeOperational: "#0b8fb0", accentHighlight: "#ffab66" };
const palette = ["#0b8fb0", "#c98500", "#da2100", "#02a2bc", "#e8650a", "#4fd3df"];

vi.mock("./chartTheme", () => ({
    useChartTheme: () => chartTheme,
    useChartColors: () => palette,
    useChartTokens: () => tokens,
}));

const tree = {
    name: "Cycle Time",
    value: 100,
    children: [
        {
            name: "Active Work",
            value: 60,
            children: [
                { name: "Coding", value: 40 },
                { name: "Tiny", value: 0.2 },
            ],
        },
        { name: "Waiting", value: 30, children: [{ name: "For review", value: 30 }] },
        { name: "Other", value: 10 },
    ],
};

const row = (name: string) => screen.getByTitle(name) as HTMLButtonElement;
const bg = (name: string) => row(name).style.backgroundColor;

describe("HierarchicalFlameGraph", () => {
    it("draws no hsl() colors and no text-white class", () => {
        const { container } = render(<HierarchicalFlameGraph root={tree} unit="hours" />);
        expect(container.innerHTML).not.toMatch(/hsl\(/u);
        expect(container.querySelector(".text-white")).toBeNull();
    });

    it("single mode: every top-level row is the same hue, depth is lighter/darker steps", () => {
        render(<HierarchicalFlameGraph root={tree} unit="hours" colorBy="single" />);
        expect(bg("Active Work")).toBe(bg("Waiting"));
        expect(bg("Active Work")).toBe(bg("Other"));
        expect(bg("Coding")).not.toBe(bg("Active Work"));
    });

    it("branch mode: each top-level branch has its own color, children inherit its hue", () => {
        render(<HierarchicalFlameGraph root={tree} unit="hours" colorBy="branch" />);
        expect(bg("Active Work")).not.toBe(bg("Waiting"));
        expect(bg("Waiting")).not.toBe(bg("Other"));
        // a child differs from its parent only by the depth step, not by branch
        expect(bg("Coding")).not.toBe(bg("Waiting"));
        expect(bg("For review")).not.toBe(bg("Active Work"));
    });

    it("never cycles the palette: a 6th branch falls back to the single hue", () => {
        const many = {
            name: "r",
            value: 60,
            children: Array.from({ length: 6 }, (_, i) => ({ name: `b${i}`, value: 10 })),
        };
        render(<HierarchicalFlameGraph root={many} unit="x" colorBy="branch" />);
        const colors = Array.from({ length: 6 }, (_, i) => bg(`b${i}`));
        expect(new Set(colors.slice(0, 5)).size).toBe(5);
        // the 6th is the single hue (tide), never palette[5]
        expect(colors[5]).toBe("rgb(11, 143, 176)");
    });

    it("labels a block with the bold name and its share when both fit, the name alone when only it fits, else nothing", () => {
        const three = {
            name: "r",
            value: 100,
            children: [
                { name: "Wide", value: 78 },
                { name: "Middling", value: 16 },
                { name: "Narrow", value: 6 },
            ],
        };
        // 500px: Wide 390px, Middling 80px, Narrow 30px.
        render(<HierarchicalFlameGraph root={three} unit="x" width={500} />);
        expect(row("Wide").textContent).toBe("Wide78%");
        expect(within(row("Wide")).getByTestId("flame-share").textContent).toBe("78%");
        expect(row("Middling").textContent).toBe("Middling");
        expect(within(row("Middling")).queryByTestId("flame-share")).toBeNull();
        expect(row("Narrow").textContent).toBe("");
        // Only labelled blocks carry the 10px inset, so a thin block never spills past its share.
        expect(row("Wide").style.paddingInline).toBe("10px");
        expect(row("Narrow").style.paddingInline).toBe("0px");
        // The rule itself: name + 8px + share inside 10px insets of the block less its 2px gap.
        expect(flameLabel("Wide", "78%", 390)).toBe("name-share");
        expect(flameLabel("Middling", "16%", 80)).toBe("name");
        expect(flameLabel("Narrow", "6%", 30)).toBe("none");
    });

    it("keeps the 0.5% cut-off", () => {
        render(<HierarchicalFlameGraph root={tree} unit="hours" />);
        expect(screen.queryByTitle("Tiny")).toBeNull();
    });

    it("draws the prototype rows: 44px high, 2px gaps between blocks and rows", () => {
        render(<HierarchicalFlameGraph root={tree} unit="hours" />);
        for (const block of [
            row("Active Work"),
            row("Coding"),
            screen.getByTestId("flame-root-row"),
        ]) {
            expect(block.style.height).toBe("44px");
            expect(block.style.marginBottom).toBe("2px");
        }
        expect(row("Active Work").style.width).toBe("calc(100% - 2px)");
    });

    it("draws a root row for the shown root at its share of the served total", () => {
        render(<HierarchicalFlameGraph root={tree} unit="hours" />);
        const rootRow = screen.getByTestId("flame-root-row");
        expect(rootRow).toHaveAttribute("title", "Cycle Time");
        expect(rootRow.textContent).toBe("Cycle Time100%");
        fireEvent.click(row("Waiting"));
        expect(screen.getByTestId("flame-root-row").textContent).toBe("Waiting30%");
    });

    it("prints the served total once with its unit (no 'd hours'), and the child count", () => {
        const big = { ...tree, value: 179539.2 };
        render(<HierarchicalFlameGraph root={big} unit="hours" />);
        const summary = screen.getByTestId("flame-summary");
        expect(summary.textContent).toBe("Total 7,480.8d · 3 children");
        expect(summary.textContent).not.toMatch(/hours/u);
        expect(formatAmount(0.5, "hours")).toBe("30m");
        expect(formatAmount(5, "hours")).toBe("5h");
        expect(formatAmount(1234, "loc")).toBe("1.2k loc");
        expect(formatAmount(18, "items")).toBe("18 items");
    });

    it("shows the shown root in the title row and the page's control left of the search", () => {
        render(
            <HierarchicalFlameGraph
                root={tree}
                unit="hours"
                toolbar={<span data-testid="mode-switch">modes</span>}
            />,
        );
        expect(screen.getByTestId("mode-switch")).toBeTruthy();
        const titleRow = screen.getByTestId("flame-title-row");
        expect(within(titleRow).getByText("Cycle Time").tagName.toLowerCase()).toBe("strong");
    });

    it("branch mode draws a legend of the served top-level branches in served order and colors", () => {
        render(<HierarchicalFlameGraph root={tree} unit="hours" colorBy="branch" />);
        const legend = screen.getByTestId("flame-legend");
        expect(
            within(legend)
                .getAllByRole("listitem")
                .map((item) => item.textContent),
        ).toEqual(["Active Work", "Waiting", "Other"]);
        const swatches = within(legend)
            .getAllByTestId("flame-legend-swatch")
            .map((swatch) => swatch.style.backgroundColor);
        expect(swatches).toEqual([bg("Active Work"), bg("Waiting"), bg("Other")]);
    });

    it("single mode draws no legend (one hue)", () => {
        render(<HierarchicalFlameGraph root={tree} unit="hours" colorBy="single" />);
        expect(screen.queryByTestId("flame-legend")).toBeNull();
    });

    it("search keeps each branch's color (the color follows the served position, not the filtered one)", () => {
        render(<HierarchicalFlameGraph root={tree} unit="hours" colorBy="branch" />);
        const waiting = bg("Waiting");
        fireEvent.change(screen.getByPlaceholderText("Search..."), { target: { value: "review" } });
        expect(bg("Waiting")).toBe(waiting);
    });

    it("never hides a label for contrast: ink is white or near-black, with a halo only when needed", () => {
        render(<HierarchicalFlameGraph root={tree} unit="hours" colorBy="branch" />);
        for (const name of ["Active Work", "Waiting", "Other", "Coding"]) {
            expect(["rgb(255, 255, 255)", "rgb(21, 23, 26)"]).toContain(row(name).style.color);
            expect(row(name).textContent).toContain(name);
        }
    });

    it("zoom in, breadcrumb out, reset; zoomed rows keep their branch color and shade", () => {
        render(<HierarchicalFlameGraph root={tree} unit="hours" colorBy="branch" />);
        const childBefore = bg("For review");
        fireEvent.click(row("Waiting"));
        expect(screen.queryByTitle("Other")).toBeNull();
        expect(bg("For review")).toBe(childBefore);
        fireEvent.click(screen.getByRole("button", { name: "Cycle Time" }));
        expect(screen.getByTitle("Other")).toBeTruthy();
        fireEvent.click(row("Waiting"));
        fireEvent.click(screen.getByRole("button", { name: "Reset" }));
        expect(screen.getByTitle("Other")).toBeTruthy();
    });

    it("search filters root rows and marks matches with the highlight ring", () => {
        render(<HierarchicalFlameGraph root={tree} unit="hours" />);
        fireEvent.change(screen.getByPlaceholderText("Search..."), { target: { value: "review" } });
        expect(screen.queryByTitle("Other")).toBeNull();
        expect(row("For review").style.boxShadow).toContain("#ffab66");
        expect(row("For review").style.boxShadow).toMatch(/0 0 0 2px/u);
        expect(row("Waiting").style.boxShadow).not.toMatch(/0 0 0 2px/u);
        fireEvent.change(screen.getByPlaceholderText("Search..."), { target: { value: "zzz" } });
        expect(screen.getByText(/No matches found for/u)).toBeTruthy();
    });
});
