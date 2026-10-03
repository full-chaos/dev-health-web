import { describe, expect, it } from "vitest";
import { render, screen, within } from "@/test/utils";

import { EvidenceQualityBands } from "./EvidenceQualityBands";

const dist = { high: 10, moderate: 20, low: 30, very_low: 30, unknown: 10 };
const seg = (c: HTMLElement, id: string) => c.querySelector(`[data-band="${id}"]`) as HTMLElement;

describe("EvidenceQualityBands", () => {
    it("shows the unavailable state, not a derived bar, when the distribution is absent or empty", () => {
        const values: Array<Record<string, number> | null | undefined> = [
            undefined,
            null,
            {},
            { high: 0, unknown: 0 },
        ];
        for (const value of values) {
            const { unmount } = render(
                <EvidenceQualityBands evidenceQualityDistribution={value} />,
            );
            expect(screen.getByText("Quality distribution unavailable")).toBeTruthy();
            unmount();
        }
    });

    it("segment width is the normalised share and zero segments are dropped", () => {
        const { container } = render(
            <EvidenceQualityBands evidenceQualityDistribution={{ high: 2, low: 6, very_low: 0 }} />,
        );
        expect(seg(container, "high").style.flex).toContain("25 1");
        expect(seg(container, "low").style.flex).toContain("75 1");
        expect(seg(container, "very_low")).toBeNull();
        expect(seg(container, "unknown")).toBeNull();
    });

    it("draws the four bands in one hue with ordinal opacity, separated by a gap, no border pill", () => {
        const { container } = render(<EvidenceQualityBands evidenceQualityDistribution={dist} />);
        const opacity = {
            high: "opacity-100",
            moderate: "opacity-75",
            low: "opacity-50",
            very_low: "opacity-30",
        };
        for (const [id, cls] of Object.entries(opacity)) {
            const el = seg(container, id);
            expect(el.className).toContain("bg-(--chart-color-1)");
            expect(el.className).toContain(cls);
            expect(el.className).not.toMatch(/accent/u);
        }
        const bar = seg(container, "high").parentElement as HTMLElement;
        expect(bar.className).toContain("gap-0.5");
        expect(bar.className).not.toContain("border");
    });

    it("unknown is neutral ink with a dashed outline, never a step of the tide ramp", () => {
        const { container } = render(<EvidenceQualityBands evidenceQualityDistribution={dist} />);
        const el = seg(container, "unknown");
        expect(el.className).not.toContain("chart-color-1");
        expect(el.className).toContain("border-dashed");
        expect(el.className).toContain("bg-(--ink-muted)");
    });

    it("under the band: meter rows (prototype bars()), every band with its share, no dot legend", () => {
        const { container } = render(<EvidenceQualityBands evidenceQualityDistribution={dist} />);
        const list = screen.getByRole("list", { name: "Evidence quality bands" });
        const rows = within(list).getAllByTestId("meter-row");
        expect(rows.map((row) => row.textContent)).toEqual([
            "High (0.80-1.00)10%",
            "Moderate (0.60-0.79)20%",
            "Low (0.40-0.59)30%",
            "Very low (<0.40)30%",
            "Unknown (no evidence)10%",
        ]);
        // The fill is the share on a 0..100 track.
        expect(within(rows[2]).getByTestId("meter-fill").style.width).toBe("30%");
        expect(container.querySelector("[data-swatch]")).toBeNull();
        expect(container.querySelector("dl")).toBeNull();
    });

    it("a band with no work units is a 0% row with an empty track", () => {
        render(
            <EvidenceQualityBands evidenceQualityDistribution={{ high: 2, low: 6, very_low: 0 }} />,
        );
        const rows = screen.getAllByTestId("meter-row");
        const veryLow = rows.find((row) => row.textContent?.startsWith("Very low"));
        expect(veryLow).toHaveTextContent("0%");
        expect(within(veryLow as HTMLElement).queryByTestId("meter-fill")).toBeNull();
    });
});
