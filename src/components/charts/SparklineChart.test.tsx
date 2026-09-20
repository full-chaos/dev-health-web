import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@/test/utils";

import {
    SparklineChart,
    formatSparklineTooltipDate,
    formatSparklineTooltipValue,
} from "./SparklineChart";

const { chartSpy } = vi.hoisted(() => ({ chartSpy: vi.fn() }));

vi.mock("./chartTheme", () => ({
    useChartTheme: () => ({
        text: "#111",
        grid: "#eee",
        muted: "#666",
        background: "#fff",
        stroke: "#ddd",
        accent1: "#00f",
        accent2: "#70f",
        accent3: "#f00",
    }),
    useChartColors: () => [],
}));

vi.mock("./Chart", () => ({
    Chart: (props: unknown) => {
        chartSpy(props);
        return <div data-testid="sparkline-chart" />;
    },
}));

describe("formatSparklineTooltipDate", () => {
    it("formats an ISO datetime string as a short date (not the raw ISO)", () => {
        // Raw input mirrors what Pydantic serialises: YYYY-MM-DDT00:00:00
        const result = formatSparklineTooltipDate("2026-06-04T00:00:00");
        // Must NOT echo back the raw ISO string
        expect(result).not.toBe("2026-06-04T00:00:00");
        // Must contain the day number
        expect(result).toMatch(/4/);
        // Must contain a month abbreviation
        expect(result).toMatch(/Jun/i);
    });

    it("formats a plain ISO date string (no time component)", () => {
        const result = formatSparklineTooltipDate("2026-01-15");
        expect(result).not.toBe("2026-01-15");
        expect(result).toMatch(/15/);
        expect(result).toMatch(/Jan/i);
    });

    it("returns the raw string unchanged for non-date input", () => {
        expect(formatSparklineTooltipDate("not-a-date")).toBe("not-a-date");
        expect(formatSparklineTooltipDate("Week 42")).toBe("Week 42");
        expect(formatSparklineTooltipDate("Sprint 3")).toBe("Sprint 3");
    });

    it("handles numeric categories by converting to string", () => {
        // Numeric index categories (e.g. 1, 2, 3) should return the raw stringified number
        // because integers are not valid dates
        expect(formatSparklineTooltipDate(1)).toBe("1");
        expect(formatSparklineTooltipDate(42)).toBe("42");
    });
});

describe("formatSparklineTooltipValue", () => {
    it("rounds numeric tooltip values instead of exposing floating-point precision", () => {
        expect(formatSparklineTooltipValue(0.6889888599537036)).toBe("0.7");
        expect(formatSparklineTooltipValue(11993.3875352)).toBe("11,993.4");
    });

    it("preserves non-numeric tooltip values", () => {
        expect(formatSparklineTooltipValue("No data")).toBe("No data");
        expect(formatSparklineTooltipValue(undefined)).toBe("");
    });
});

describe("formatSparklineTooltipValue with a null (missing) value", () => {
    it("says there is no data instead of printing nothing or 0", () => {
        expect(formatSparklineTooltipValue(null as unknown as undefined)).toBe("No data");
    });
    it("still formats a produced 0", () => {
        expect(formatSparklineTooltipValue(0)).toBe("0");
    });
});

describe("SparklineChart tooltip with a null (missing) point", () => {
    beforeEach(() => chartSpy.mockClear());

    const tooltip = () =>
        (chartSpy.mock.calls.at(-1)?.[0] as { option: Record<string, unknown> }).option as {
            series: Array<{ data: Array<number | null> }>;
            tooltip: { formatter: (p: unknown) => string };
        };

    it("passes the null through as a gap and says 'No data' when ECharts hands undefined to the tooltip", () => {
        render(<SparklineChart data={[3, null, 5]} categories={["a", "b", "c"]} />);
        const option = tooltip();
        expect(option.series[0].data).toEqual([3, null, 5]);
        expect(option.tooltip.formatter([{ axisValue: "b", value: undefined }])).toContain(
            "No data",
        );
        expect(option.tooltip.formatter([{ axisValue: "b", value: null }])).toContain("No data");
    });

    it("still formats a produced 0", () => {
        render(<SparklineChart data={[0, 1]} categories={["a", "b"]} />);
        expect(tooltip().tooltip.formatter([{ axisValue: "a", value: 0 }])).toMatch(/:\s*0$/);
    });
});
