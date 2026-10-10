// CHAOS-9077: the tile's change tone follows the metric's polarity.
// NEW API (`polarity` prop) is used below; these tests fail until it is implemented.
import { describe, it, expect, vi, beforeEach } from "vitest";

const sparkProps = vi.hoisted(() => ({ last: null as null | Record<string, unknown> }));
vi.mock("@/components/charts/SparklineChart", () => ({
    SparklineChart: (props: Record<string, unknown>) => {
        sparkProps.last = props;
        return <div data-testid="sparkline" />;
    },
}));

import { MetricCard } from "./MetricCard";
import { render, screen } from "@/test/utils";

const GOOD = "text-(--positive)";
const BAD = "text-(--accent-negative)";
const MUTED = "text-(--ink-muted)";

const series = [
    { ts: "2026-06-01", value: 1 },
    { ts: "2026-06-02", value: 2 },
];

type Polarity = "lowerIsBetter" | "higherIsBetter" | undefined;
type Tone = "good" | "bad" | "flat";
const toneClass = (t: Tone) => (t === "good" ? GOOD : t === "bad" ? BAD : MUTED);

// polarity -> tone of a rise; a fall is the opposite (flat stays flat).
const MATRIX: Array<{ polarity: Polarity; rise: Tone; fall: Tone }> = [
    { polarity: "lowerIsBetter", rise: "bad", fall: "good" },
    { polarity: "higherIsBetter", rise: "good", fall: "bad" },
    { polarity: undefined, rise: "flat", fall: "flat" },
];

beforeEach(() => {
    sparkProps.last = null;
});

describe("MetricCard change tone by polarity", () => {
    for (const m of MATRIX) {
        it(`${m.polarity ?? "no polarity"}: rise ${m.rise}, fall ${m.fall}`, () => {
            const { unmount } = render(
                <MetricCard label="X" value={10} delta={5} polarity={m.polarity} />,
            );
            const up = screen.getByTestId("metric-delta");
            expect(up).toHaveClass(toneClass(m.rise));
            expect(up).toHaveTextContent("+5%");
            unmount();
            render(<MetricCard label="X" value={10} delta={-5} polarity={m.polarity} />);
            const down = screen.getByTestId("metric-delta");
            expect(down).toHaveClass(toneClass(m.fall));
            expect(down).toHaveTextContent("-5%");
        });
    }

    it("a change that rounds to 0 is muted for every polarity", () => {
        for (const polarity of ["lowerIsBetter", "higherIsBetter", undefined] as const) {
            const { unmount } = render(
                <MetricCard label="X" value={10} delta={0.3} polarity={polarity} />,
            );
            expect(screen.getByTestId("metric-delta")).toHaveClass(MUTED);
            unmount();
        }
        render(<MetricCard label="X" value={10} delta={0} polarity="lowerIsBetter" />);
        expect(screen.getByTestId("metric-delta")).toHaveClass(MUTED);
    });

    it("a bare inverseGood still works", () => {
        const { unmount } = render(<MetricCard label="X" value={10} delta={5} inverseGood />);
        expect(screen.getByTestId("metric-delta")).toHaveClass(BAD);
        unmount();
        render(<MetricCard label="X" value={10} delta={5} inverseGood={false} />);
        expect(screen.getByTestId("metric-delta")).toHaveClass(GOOD);
    });
});

describe("MetricCard changed from zero by polarity", () => {
    for (const m of MATRIX) {
        it(`${m.polarity ?? "no polarity"}: "+12 from 0" is ${m.rise}`, () => {
            render(<MetricCard label="X" value={12} unit="" delta={null} polarity={m.polarity} />);
            const el = screen.getByTestId("metric-delta");
            expect(el).toHaveTextContent("+12 from 0");
            expect(el).toHaveClass(toneClass(m.rise));
        });
    }
});

describe("MetricCard unchanged states", () => {
    it("No prior period stays muted whatever the polarity", () => {
        render(<MetricCard label="X" value={10} polarity="lowerIsBetter" />);
        expect(screen.queryByTestId("metric-delta")).toBeNull();
        expect(screen.getByText("No prior period")).toBeInTheDocument();
    });

    it("deltaSlot replaces the change and is not toned by polarity", () => {
        render(
            <MetricCard
                label="X"
                value={10}
                delta={5}
                polarity="lowerIsBetter"
                deltaSlot={<span data-testid="slot">custom</span>}
            />,
        );
        expect(screen.getByTestId("slot")).toHaveTextContent("custom");
        expect(screen.queryByTestId("metric-delta")).toBeNull();
    });
});

describe("MetricCard sparkline end-dot tone by polarity", () => {
    it("is bad only for a bad change", () => {
        render(
            <MetricCard label="X" value={10} delta={5} polarity="lowerIsBetter" spark={series} />,
        );
        expect(sparkProps.last?.tone).toBe("bad");
    });

    it("is default for a good change", () => {
        render(
            <MetricCard label="X" value={10} delta={-5} polarity="lowerIsBetter" spark={series} />,
        );
        expect(sparkProps.last?.tone).toBe("default");
    });

    it("is default for a neutral change (no polarity), both ways", () => {
        const { unmount } = render(<MetricCard label="X" value={10} delta={-5} spark={series} />);
        expect(sparkProps.last?.tone).toBe("default");
        unmount();
        render(<MetricCard label="X" value={10} delta={5} spark={series} />);
        expect(sparkProps.last?.tone).toBe("default");
    });

    it("is bad for a fall of a higherIsBetter metric", () => {
        render(
            <MetricCard label="X" value={10} delta={-5} polarity="higherIsBetter" spark={series} />,
        );
        expect(sparkProps.last?.tone).toBe("bad");
    });

    it("is default for a change that rounds to 0", () => {
        render(
            <MetricCard label="X" value={10} delta={0.3} polarity="lowerIsBetter" spark={series} />,
        );
        expect(sparkProps.last?.tone).toBe("default");
    });
});
