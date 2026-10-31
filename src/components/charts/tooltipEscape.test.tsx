import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@/test/utils";

import { TimeseriesChart } from "./TimeseriesChart";
import { VerticalBarChart } from "./VerticalBarChart";

const chartTheme = {
    text: "#111827",
    grid: "#e5e7eb",
    muted: "#6b7280",
    background: "#ffffff",
    stroke: "#d1d5db",
    accent1: "#2563eb",
    accent2: "#7c3aed",
    accent3: "#ef4444",
};

const { chartSpy } = vi.hoisted(() => ({ chartSpy: vi.fn() }));

vi.mock("./chartTheme", () => ({
    useChartTheme: () => chartTheme,
    useChartColors: () => [],
}));

vi.mock("./Chart", () => ({
    Chart: (props: unknown) => {
        chartSpy(props);
        return <div data-testid="chart" />;
    },
}));

const HOSTILE = [
    "<img src=x onerror=alert(1)>",
    "</div><a href=javascript:alert(1)>x</a>",
    "&amp;",
    `"'\``,
];
const MARKER = '<span style="display:inline-block;width:10px">';

type Formatter = (params: unknown) => string;

function formatterOf(): Formatter {
    const props = chartSpy.mock.calls.at(-1)?.[0] as {
        option: { tooltip: { formatter: Formatter } };
    };
    return props.option.tooltip.formatter;
}

// ECharts assigns the formatter string to innerHTML; do the same.
function asDom(html: string): HTMLElement {
    const el = document.createElement("div");
    el.innerHTML = html;
    return el;
}

describe.each(HOSTILE)("tooltip escapes served name %s", (hostile) => {
    beforeEach(() => chartSpy.mockClear());

    it("VerticalBarChart: series name and category", () => {
        render(<VerticalBarChart categories={[hostile]} series={[{ name: hostile, data: [1] }]} />);
        const html = formatterOf()([
            { seriesName: hostile, name: hostile, value: 1, marker: MARKER },
        ]);
        const el = asDom(html);
        expect(el.querySelector("img, a")).toBeNull();
        expect(el.textContent).toContain(hostile);
    });

    it("VerticalBarChart: category label used when series name is missing", () => {
        render(<VerticalBarChart categories={[hostile]} series={[{ name: "s", data: [1] }]} />);
        const el = asDom(formatterOf()([{ name: hostile, value: 1, marker: MARKER }]));
        expect(el.querySelector("img, a")).toBeNull();
        expect(el.textContent).toContain(hostile);
    });

    it("TimeseriesChart: category label", () => {
        render(<TimeseriesChart data={[{ day: "2026-10-01", label: hostile, value: 1 }]} />);
        const el = asDom(formatterOf()([{ name: hostile, value: 1, marker: MARKER }]));
        expect(el.querySelector("img, a")).toBeNull();
        expect(el.textContent).toContain(hostile);
    });
});

describe("tooltip keeps the ECharts marker as markup", () => {
    it("renders the marker span", () => {
        render(<TimeseriesChart data={[{ day: "2026-10-01", label: "a", value: 1 }]} />);
        const el = asDom(formatterOf()([{ name: "a", value: 1, marker: MARKER }]));
        expect(el.querySelector("span")).not.toBeNull();
    });
});
