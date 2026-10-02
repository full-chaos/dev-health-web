import { describe, expect, it } from "vitest";

import { render, screen } from "@/test/utils";
import { MetricStrip } from "./MetricStrip";

const tiles = (n: number) => Array.from({ length: n }, (_, i) => <div key={i}>tile {i}</div>);

describe("MetricStrip", () => {
    it.each([3, 4, 5])("uses one column per tile for %i tiles", (n) => {
        render(<MetricStrip data-testid="strip">{tiles(n)}</MetricStrip>);
        const strip = screen.getByTestId("strip");
        expect(strip).toHaveAttribute("data-columns", String(n));
        expect(strip.style.getPropertyValue("--cols")).toBe(String(n));
        expect(strip.children).toHaveLength(n);
    });

    it("skips null and false children when counting", () => {
        render(
            <MetricStrip data-testid="strip">
                {tiles(3)}
                {null}
                {false}
            </MetricStrip>,
        );
        expect(screen.getByTestId("strip")).toHaveAttribute("data-columns", "3");
    });

    it("lets columns override the count and never goes below one", () => {
        const { rerender } = render(
            <MetricStrip data-testid="strip" columns={2}>
                {tiles(5)}
            </MetricStrip>,
        );
        expect(screen.getByTestId("strip")).toHaveAttribute("data-columns", "2");
        rerender(<MetricStrip data-testid="strip">{[]}</MetricStrip>);
        expect(screen.getByTestId("strip")).toHaveAttribute("data-columns", "1");
    });

    it("keeps two columns below lg and the var-driven grid from lg", () => {
        render(<MetricStrip data-testid="strip">{tiles(4)}</MetricStrip>);
        const cls = screen.getByTestId("strip").className;
        expect(cls).toContain("grid-cols-2");
        expect(cls).toContain("lg:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]");
    });
});
