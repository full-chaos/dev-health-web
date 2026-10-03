import { describe, expect, it, vi } from "vitest";

import { fireEvent, render, screen, within } from "@/test/utils";
import { MeterRows } from "./MeterRows";

const rowsOf = () => screen.getAllByTestId("meter-row");
const fillOf = (row: HTMLElement) => within(row).queryByTestId("meter-fill");
const valueOf = (row: HTMLElement) => within(row).getByTestId("meter-value").textContent;

describe("MeterRows (prototype bars())", () => {
    it("draws label, track and value per row, as a list, with no axis", () => {
        render(
            <MeterRows
                aria-label="Likely associations"
                rows={[
                    { label: "Review latency", value: 84.6, display: "84.6%" },
                    { label: "Cycle time", value: 0.2, display: "0.2 d" },
                ]}
            />,
        );
        const list = screen.getByRole("list", { name: "Likely associations" });
        const rows = within(list).getAllByRole("listitem");
        expect(rows).toHaveLength(2);
        expect(rows[0]).toHaveTextContent("Review latency");
        expect(valueOf(rows[0])).toBe("84.6%");
        expect(valueOf(rows[1])).toBe("0.2 d");
        expect(within(rows[0]).getByTestId("meter-track")).toHaveAttribute("aria-hidden", "true");
        expect(document.querySelector("canvas, svg")).toBeNull();
    });

    it("sets the fill to value / max, the largest row by default", () => {
        render(
            <MeterRows
                rows={[
                    { label: "a", value: 50 },
                    { label: "b", value: 25 },
                ]}
            />,
        );
        const [a, b] = rowsOf();
        expect(fillOf(a)).toHaveStyle({ width: "100%" });
        expect(fillOf(b)).toHaveStyle({ width: "50%" });
    });

    it("uses the given max, and never fills past the track", () => {
        render(
            <MeterRows
                max={200}
                rows={[
                    { label: "a", value: 50 },
                    { label: "b", value: 300 },
                ]}
            />,
        );
        const [a, b] = rowsOf();
        expect(fillOf(a)).toHaveStyle({ width: "25%" });
        expect(fillOf(b)).toHaveStyle({ width: "100%" });
    });

    it("shows 'Not reported' and an empty track for a value that is not served", () => {
        render(
            <MeterRows
                unit="%"
                rows={[
                    { label: "served", value: 10 },
                    { label: "missing", value: null, display: "should not show" },
                ]}
            />,
        );
        const missing = rowsOf()[1];
        expect(missing).toHaveAttribute("data-reported", "false");
        expect(valueOf(missing)).toBe("Not reported");
        expect(fillOf(missing)).toBeNull();
    });

    it("shows 0 with an empty track (0 is a value, not a missing one)", () => {
        render(
            <MeterRows
                rows={[
                    { label: "zero", value: 0 },
                    { label: "neg", value: -3, display: "-3%" },
                ]}
            />,
        );
        const [zero, neg] = rowsOf();
        expect(zero).toHaveAttribute("data-reported", "true");
        expect(valueOf(zero)).toBe("0");
        expect(fillOf(zero)).toBeNull();
        expect(valueOf(neg)).toBe("-3%");
        expect(fillOf(neg)).toBeNull();
    });

    it("puts the unit after the value unless the shown value already ends with it", () => {
        render(
            <MeterRows
                unit=" h"
                rows={[
                    { label: "plain", value: 12.34 },
                    { label: "formatted", value: 3, display: "3 h" },
                ]}
            />,
        );
        const [plain, formatted] = rowsOf();
        expect(valueOf(plain)).toBe("12.3 h");
        expect(valueOf(formatted)).toBe("3 h");
    });

    it("fills with the row colour, else the first data colour", () => {
        render(
            <MeterRows
                rows={[
                    { label: "a", value: 1, color: "var(--chart-color-3)" },
                    { label: "b", value: 1 },
                ]}
            />,
        );
        const [a, b] = rowsOf();
        expect(fillOf(a)?.style.background).toBe("var(--chart-color-3)");
        expect(fillOf(b)?.style.background).toBe("var(--chart-color-1)");
    });

    it("makes the label a button when the row can be selected", () => {
        const onSelect = vi.fn();
        render(
            <MeterRows
                rows={[
                    { label: "Feature Delivery", value: 5, onSelect, selected: true },
                    { label: "Maintenance", value: 2, title: "Maintenance / Tech Debt" },
                ]}
            />,
        );
        const button = screen.getByRole("button", { name: "Feature Delivery" });
        expect(button).toHaveAttribute("aria-pressed", "true");
        fireEvent.click(button);
        expect(onSelect).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole("button", { name: "Maintenance" })).toBeNull();
        expect(screen.getByText("Maintenance")).toHaveAttribute("title", "Maintenance / Tech Debt");
    });
});

describe("MeterRows signed (K-5)", () => {
    const rows = [
        { label: "up", value: 40, display: "+40%" },
        { label: "down", value: -20, display: "-20%" },
        { label: "flat", value: 0, display: "0%" },
        { label: "missing", value: null },
    ];

    it("fills right for an increase and left for a decrease, from a zero line, to half the track at most", () => {
        render(<MeterRows rows={rows} signed />);

        const fills = screen.getAllByTestId("meter-fill");
        // 0 and the missing row draw no fill.
        expect(fills).toHaveLength(2);
        expect(fills.map((fill) => fill.getAttribute("data-direction"))).toEqual(["right", "left"]);
        expect(fills.map((fill) => fill.style.width)).toEqual(["50%", "25%"]);
        expect(screen.getAllByTestId("meter-zero-line")).toHaveLength(4);
    });

    it("keeps the served text and 'Not reported' for a missing value", () => {
        render(<MeterRows rows={rows} signed />);

        expect(screen.getAllByTestId("meter-value").map((v) => v.textContent)).toEqual([
            "+40%",
            "-20%",
            "0%",
            "Not reported",
        ]);
    });

    it("leaves unsigned rows as before: fill from the left, no zero line, a negative value draws nothing", () => {
        render(
            <MeterRows
                rows={[
                    { label: "a", value: 10 },
                    { label: "b", value: -5 },
                ]}
            />,
        );

        expect(screen.getAllByTestId("meter-fill")).toHaveLength(1);
        expect(screen.getByTestId("meter-fill").style.width).toBe("100%");
        expect(screen.queryByTestId("meter-zero-line")).toBeNull();
    });
});
