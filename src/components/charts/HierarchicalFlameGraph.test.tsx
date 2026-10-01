import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@/test/utils";

import { HierarchicalFlameGraph } from "./HierarchicalFlameGraph";

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

    it("keeps the 8% label threshold and 0.5% cut-off", () => {
        render(<HierarchicalFlameGraph root={tree} unit="hours" />);
        expect(row("Active Work").textContent).toBe("Active Work");
        expect(row("Coding").textContent).toBe("Coding");
        expect(screen.queryByTitle("Tiny")).toBeNull();
        const narrow = {
            name: "r",
            value: 100,
            children: [
                { name: "Wide", value: 94 },
                { name: "Narrow", value: 6 },
            ],
        };
        render(<HierarchicalFlameGraph root={narrow} unit="x" />);
        expect(screen.getByTitle("Narrow").textContent).toBe("");
    });

    it("never hides a label for contrast: ink is white or near-black, with a halo only when needed", () => {
        render(<HierarchicalFlameGraph root={tree} unit="hours" colorBy="branch" />);
        for (const name of ["Active Work", "Waiting", "Other", "Coding"]) {
            expect(["rgb(255, 255, 255)", "rgb(21, 23, 26)"]).toContain(row(name).style.color);
            expect(row(name).textContent).toBe(name);
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
