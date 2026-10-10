// CHAOS-9077: the tone of a change follows the metric's polarity, not the sign alone.
// NEW API (polarity option / prop) is used below; these tests fail until it is implemented.
import { describe, it, expect } from "vitest";
import { changedFromZeroParts, MetricDelta, metricDeltaParts } from "./MetricDelta";
import { render, screen } from "@/test/utils";

const GOOD = "text-(--positive)";
const BAD = "text-(--accent-negative)";
const MUTED = "text-(--ink-muted)";

type Opts = { polarity?: "lowerIsBetter" | "higherIsBetter"; inverseGood?: boolean };

const CASES: Array<{ name: string; opts: Opts; rise: "good" | "bad" | "flat" }> = [
    { name: "lowerIsBetter", opts: { polarity: "lowerIsBetter" }, rise: "bad" },
    { name: "higherIsBetter", opts: { polarity: "higherIsBetter" }, rise: "good" },
    { name: "no polarity", opts: {}, rise: "flat" },
    { name: "inverseGood true", opts: { inverseGood: true }, rise: "bad" },
    { name: "inverseGood false", opts: { inverseGood: false }, rise: "good" },
];
const invert = (p: "good" | "bad" | "flat") => (p === "good" ? "bad" : p === "bad" ? "good" : p);
const toneOf = (p: "good" | "bad" | "flat") => (p === "good" ? GOOD : p === "bad" ? BAD : MUTED);

describe("metricDeltaParts tone by polarity", () => {
    for (const c of CASES) {
        it(`${c.name}: rise is ${c.rise}, fall is ${invert(c.rise)}`, () => {
            const up = metricDeltaParts(5, c.opts);
            const down = metricDeltaParts(-5, c.opts);
            expect(up).toMatchObject({ polarity: c.rise, toneClass: toneOf(c.rise), glyph: "↑" });
            expect(down).toMatchObject({
                polarity: invert(c.rise),
                toneClass: toneOf(invert(c.rise)),
                glyph: "↓",
            });
        });
    }

    it("lowerIsBetter: a fall is good (text-(--positive)), a rise is bad", () => {
        expect(metricDeltaParts(-5, { polarity: "lowerIsBetter" })).toMatchObject({
            polarity: "good",
            toneClass: GOOD,
        });
        expect(metricDeltaParts(5, { polarity: "lowerIsBetter" })).toMatchObject({
            polarity: "bad",
            toneClass: BAD,
        });
    });

    it("unknown polarity is neutral both ways", () => {
        for (const v of [5, -5]) {
            expect(metricDeltaParts(v)).toMatchObject({ polarity: "flat", toneClass: MUTED });
        }
    });

    it("keeps the label text unchanged by polarity", () => {
        expect(metricDeltaParts(5, { polarity: "lowerIsBetter" })?.label).toBe("+5%");
        expect(metricDeltaParts(-5)?.label).toBe("-5%");
    });

    it("a change that rounds to 0 is flat for every polarity", () => {
        const polarities: Opts[] = [
            { polarity: "lowerIsBetter" },
            { polarity: "higherIsBetter" },
            {},
            { inverseGood: true },
            { inverseGood: false },
        ];
        for (const o of polarities) {
            for (const v of [0.3, -0.3]) {
                expect(metricDeltaParts(v, { ...o, precision: 0 })).toMatchObject({
                    polarity: "flat",
                    toneClass: MUTED,
                    glyph: v > 0 ? "↑" : "↓",
                });
            }
            expect(metricDeltaParts(0, o)).toMatchObject({
                polarity: "flat",
                toneClass: MUTED,
                glyph: "·",
            });
        }
    });

    it("a change visible at a higher precision is toned by polarity", () => {
        expect(metricDeltaParts(0.3, { polarity: "lowerIsBetter", precision: 1 })).toMatchObject({
            polarity: "bad",
            toneClass: BAD,
        });
    });
});

describe("changedFromZeroParts tone by polarity", () => {
    for (const c of CASES) {
        it(`${c.name}: rise is ${c.rise}, fall is ${invert(c.rise)}`, () => {
            expect(changedFromZeroParts(12, "", c.opts)).toMatchObject({
                polarity: c.rise,
                toneClass: toneOf(c.rise),
                glyph: "↑",
                label: "+12 from 0",
            });
            expect(changedFromZeroParts(-12, "", c.opts)).toMatchObject({
                polarity: invert(c.rise),
                toneClass: toneOf(invert(c.rise)),
                glyph: "↓",
                label: "-12 from 0",
            });
        });
    }

    it("is null for 0 and for a missing value", () => {
        expect(changedFromZeroParts(0, "", { polarity: "lowerIsBetter" })).toBeNull();
        expect(changedFromZeroParts(null, "", { polarity: "lowerIsBetter" })).toBeNull();
    });
});

describe("<MetricDelta> tone by polarity", () => {
    const toneCases = CASES.map((c) => ({ ...c, props: c.opts }));
    for (const c of toneCases) {
        it(`${c.name}: rise and fall`, () => {
            const { unmount } = render(<MetricDelta value={5} {...c.props} />);
            const up = screen.getByText(/\+5%/);
            expect(up).toHaveClass(toneOf(c.rise));
            expect(up).toHaveTextContent("↑");
            unmount();
            render(<MetricDelta value={-5} {...c.props} />);
            const down = screen.getByText(/-5%/);
            expect(down).toHaveClass(toneOf(invert(c.rise)));
            expect(down).toHaveTextContent("↓");
        });
    }

    it("lowerIsBetter: a fall is good, a rise is bad", () => {
        const { unmount } = render(<MetricDelta value={-5} polarity="lowerIsBetter" />);
        expect(screen.getByText(/-5%/)).toHaveClass(GOOD);
        unmount();
        render(<MetricDelta value={5} polarity="lowerIsBetter" />);
        expect(screen.getByText(/\+5%/)).toHaveClass(BAD);
    });

    it("a change that rounds to 0 is muted for every polarity", () => {
        for (const polarity of ["lowerIsBetter", "higherIsBetter", undefined] as const) {
            const { unmount } = render(<MetricDelta value={0.3} polarity={polarity} />);
            const el = screen.getByText(/↑/);
            expect(el).toHaveClass(MUTED);
            unmount();
        }
    });

    it("changed from zero follows polarity", () => {
        const { unmount } = render(
            <MetricDelta
                value={null}
                changedFromZero={{ current: 12, unit: "" }}
                polarity="lowerIsBetter"
            />,
        );
        const bad = screen.getByText(/\+12 from 0/);
        expect(bad).toHaveClass(BAD);
        unmount();
        render(<MetricDelta value={null} changedFromZero={{ current: 12, unit: "" }} />);
        expect(screen.getByText(/\+12 from 0/)).toHaveClass(MUTED);
    });
});
