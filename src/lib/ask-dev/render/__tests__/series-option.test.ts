import { describe, expect, it } from "vitest";

import type { RenderShape } from "@/lib/ask-dev/render/contracts";
import { utcInstant } from "@/lib/ask-dev/render/guards";
import { lineOption, pointAt, shapePositions, utcTick } from "@/lib/ask-dev/render/series-option";
import { verifyRenderShape } from "@/lib/ask-dev/render/verify";

import { categoryLine, hostileLine, HOSTILE, k1, multiSeries, withShapes } from "./seriesFixtures";

// CHAOS-11942, E8 design §7.1-7.3: the pure shape -> ECharts option step.
const COLORS = ["#c1", "#c2", "#c3", "#c4", "#c5", "#c6", "#c7", "#c8", "#c9", "#c10"];
const THEME = { text: "#text", muted: "#muted", grid: "#grid" };
const context = (reducedMotion = false) => ({ colors: COLORS, theme: THEME, reducedMotion });
type Series = { type: string; data: unknown[]; [key: string]: unknown };
type Option = {
    series: Series[];
    xAxis: Record<string, unknown>;
    yAxis: Record<string, unknown>;
    legend: Record<string, unknown>;
    [key: string]: unknown;
};
const build = (shape: RenderShape, reducedMotion = false) =>
    lineOption(shape, shapePositions(shape), context(reducedMotion)) as unknown as Option;

/** Every key anywhere in the option. */
function keys(value: unknown, out = new Set<string>()): Set<string> {
    if (Array.isArray(value)) value.forEach((item) => keys(item, out));
    else if (value !== null && typeof value === "object") {
        for (const [key, inner] of Object.entries(value)) {
            out.add(key);
            keys(inner, out);
        }
    }
    return out;
}
/** Every string anywhere in the option. */
function strings(value: unknown, out: string[] = []): string[] {
    if (typeof value === "string") out.push(value);
    else if (Array.isArray(value)) value.forEach((item) => strings(item, out));
    else if (value !== null && typeof value === "object")
        Object.values(value).forEach((item) => strings(item, out));
    return out;
}

describe("the fixtures are real, verifiable shapes", () => {
    it("the ported verifier admits each one against the capture's own rows", () => {
        const result = k1();
        for (const shape of [
            ...result.render_shapes!,
            multiSeries(result),
            categoryLine(result, ["c", "a", "b"]),
            hostileLine(result),
        ]) {
            expect(verifyRenderShape(shape, withShapes(result, [shape])), shape.title).toBe(true);
        }
    });
});

describe("line on a time axis (E8 §7.2)", () => {
    it("draws elapsed time in UTC, every point marked, no smoothing, steps, area or bridged gaps", () => {
        const option = build(k1().render_shapes![0]!);
        expect(option.useUTC).toBe(true);
        expect(option.xAxis.type).toBe("time");
        expect(option.yAxis).toMatchObject({ type: "value", scale: false });
        expect(option.yAxis).not.toHaveProperty("min");
        expect(option.yAxis).not.toHaveProperty("max");
        for (const series of option.series) {
            expect(series).toMatchObject({
                type: "line",
                smooth: false,
                step: false,
                connectNulls: false,
                showSymbol: true,
                showAllSymbol: true,
            });
            expect(series).not.toHaveProperty("areaStyle");
        }
        expect(option.tooltip).toEqual({ show: false });
    });

    it("has no zoom, sampling, large or progressive mode and no mark lines, areas or points", () => {
        const found = keys(build(multiSeries(k1())));
        for (const banned of [
            "dataZoom",
            "sampling",
            "large",
            "progressive",
            "markLine",
            "markArea",
            "markPoint",
            "areaStyle",
            "visualMap",
            "graphic",
            "rich",
        ]) {
            expect(found.has(banned), banned).toBe(false);
        }
    });

    it("plots each served point at its own UTC instant, oldest first, and inserts no day", () => {
        const shape = k1().render_shapes![0]!;
        const data = build(shape).series[0]!.data as [number, number | null][];
        const served = [...shape.series[0]!.points].sort(
            (a, b) => utcInstant(a.label)! - utcInstant(b.label)!,
        );
        expect(data).toEqual(served.map((point) => [utcInstant(point.label), point.value]));
        expect(data.every(([, value]) => value !== null)).toBe(true);
    });

    it("orders positions by UTC instant, not by first-seen or by label text", () => {
        const shape = {
            ...k1().render_shapes![0]!,
            series: [
                {
                    key: "a",
                    label: "A",
                    points: [
                        // 2026-08-02T01:00Z, sorts after the next label as text.
                        {
                            label: "2026-08-01T23:00:00-02:00",
                            value: 1,
                            source: { kind: "claimed_fact_row" },
                        },
                        {
                            label: "2026-08-02T00:30:00Z",
                            value: 2,
                            source: { kind: "claimed_fact_row" },
                        },
                    ],
                },
            ],
        } as RenderShape;
        const positions = shapePositions(shape);
        expect(positions.map((position) => position.label)).toEqual([
            "2026-08-02T00:30:00Z",
            "2026-08-01T23:00:00-02:00",
        ]);
        expect(positions.map((position) => position.at)).toEqual([
            Date.parse("2026-08-02T00:30:00Z"),
            Date.parse("2026-08-02T01:00:00Z"),
        ]);
    });

    it("gives a series with no point at a union instant null there, never 0", () => {
        const result = k1();
        const shape = multiSeries(result);
        const option = build(shape);
        const instants = shapePositions(shape).map((position) => position.at);
        const [backlog, throughput] = option.series as { data: [number, number | null][] }[];
        expect(backlog!.data.map(([at]) => at)).toEqual(instants);
        expect(throughput!.data.map(([at]) => at)).toEqual(instants);
        const gaps = throughput!.data.filter(([, value]) => value === null);
        expect(gaps).toHaveLength(1);
        // No zero is added: the zeros drawn are exactly the zeros served.
        expect(throughput!.data.filter(([, value]) => value === 0)).toHaveLength(
            shape.series[1]!.points.filter((point) => point.value === 0).length,
        );
        // The gap is the day the second series lacks, and the first series has a value there.
        const gapAt = gaps[0]![0];
        expect(backlog!.data.find(([at]) => at === gapAt)![1]).not.toBeNull();
    });

    it("shows a legend only for two or more series, never as a series toggle", () => {
        const result = k1();
        expect(build(result.render_shapes![0]!).legend).toEqual({ show: false });
        expect(build(multiSeries(result)).legend).toMatchObject({
            show: true,
            selectedMode: false,
            data: ["Backlog size", "Throughput mean"],
        });
    });

    it("gives series i theme colour i", () => {
        const option = build(multiSeries(k1()));
        expect(option.color).toEqual(["#c1", "#c2"]);
        expect(
            option.series.map((series) => (series.lineStyle as { color: string }).color),
        ).toEqual(["#c1", "#c2"]);
    });

    it("labels time ticks with a function of the tick's UTC instant only (no served text, no template)", () => {
        const option = build(k1().render_shapes![0]!);
        const formatter = (option.xAxis.axisLabel as { formatter: unknown }).formatter;
        expect(formatter).toBe(utcTick);
        expect(utcTick(Date.parse("2026-08-03T00:00:00Z"))).toBe("Aug 3");
        // 23:30 on Jul 31 in UTC-2 is Aug 1 in UTC: the tick follows the UTC instant.
        expect(utcTick(Date.parse("2026-07-31T23:30:00-02:00"))).toBe("Aug 1");
        const category = build(categoryLine(k1(), ["c", "a", "b"]));
        expect(category.xAxis.axisLabel).not.toHaveProperty("formatter");
    });

    it("turns animation off when the reader asks for reduced motion", () => {
        const shape = k1().render_shapes![0]!;
        expect(build(shape, true).animation).toBe(false);
        expect(build(shape, false).animation).toBe(true);
    });
});

describe("line on a category axis (E8 §7.3)", () => {
    it("keeps the served first-seen union order, never sorted, with null where a series has no point", () => {
        const shape = categoryLine(k1(), ["c", "a", "b"]);
        const option = build(shape);
        expect(option.xAxis).toMatchObject({ type: "category", data: ["c", "a", "b"] });
        const [first, second] = option.series;
        expect(first!.data).toEqual([
            shape.series[0]!.points[0]!.value,
            shape.series[0]!.points[1]!.value,
            null,
        ]);
        expect(second!.data).toEqual([
            null,
            shape.series[1]!.points[1]!.value,
            shape.series[1]!.points[0]!.value,
        ]);
    });
});

describe("words on the chart come from the shape only (E8 §7.1, check 8)", () => {
    it("names the axes and series with served words, verbatim, and adds none", () => {
        const shape = hostileLine(k1());
        const option = build(shape);
        expect(option.xAxis.name).toBe(shape.axis_label);
        expect(option.yAxis.name).toBe(shape.value_label);
        expect(option.series.map((series) => series.name)).toEqual(
            shape.series.map((series) => series.label),
        );
        expect(option.xAxis.data).toEqual([HOSTILE[2], HOSTILE[3], HOSTILE[4]]);
        // Every other string is a style word or a colour, never text a reader sees.
        const served = new Set([
            shape.axis_label,
            shape.value_label,
            ...shape.series.map((s) => s.label),
            ...HOSTILE,
        ]);
        const style = new Set([
            "transparent",
            "time",
            "category",
            "value",
            "line",
            "circle",
            "middle",
            "end",
            "left",
            "var(--font-body, system-ui, sans-serif)",
            "a",
            "b",
            ...COLORS,
            ...Object.values(THEME),
        ]);
        for (const text of strings(option)) {
            expect(served.has(text) || style.has(text), JSON.stringify(text)).toBe(true);
        }
    });

    it("finds each value table cell by position: served label on category, UTC instant on time", () => {
        const result = k1();
        const shape = multiSeries(result);
        const positions = shapePositions(shape);
        const second = shape.series[1]!;
        const found = positions.map((position) => pointAt(second, position)?.value);
        expect(found.filter((value) => value === undefined)).toHaveLength(1);
        expect(found.filter((value) => value !== undefined)).toEqual(
            second.points.map((p) => p.value),
        );
    });
});
