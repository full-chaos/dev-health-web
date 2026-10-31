import { LineChart } from "echarts/charts";
import { SVGRenderer } from "echarts/renderers";
import { describe, expect, it } from "vitest";

import { chartColors, fallbackTheme } from "@/components/charts/chartTheme";
import { echarts } from "@/lib/echartsInit";
import type { RenderShape } from "@/lib/ask-dev/render/contracts";
import { utcInstant } from "@/lib/ask-dev/render/guards";
import { lineOption, shapePositions } from "@/lib/ask-dev/render/series-option";

import { categoryLine, hostileLine, HOSTILE, k1, multiSeries } from "./seriesFixtures";

echarts.use([LineChart, SVGRenderer]);

// CHAOS-11942, E8 design §12.1: geometry baselines from ECharts' own server-side SVG renderer, with
// role assertions on the drawn marks. The baselines are committed under `../__baselines__/`.
const WIDTH = 400;
const HEIGHT = 224;

/**
 * zrender numbers its instances and style classes per process, so a chart's ids depend on how many
 * charts ran before it. They are not geometry: renumber them by first appearance in this SVG.
 */
function normalized(svg: string): string {
    const classes = new Map<string, number>();
    return svg.replace(/\bzr\d+-/gu, "zr-").replace(/zr-cls-(\d+)/gu, (_, id: string) => {
        if (!classes.has(id)) classes.set(id, classes.size);
        return `zr-cls-${classes.get(id)}`;
    });
}

function svgOf(shape: RenderShape): string {
    const chart = echarts.init(null, null, {
        renderer: "svg",
        ssr: true,
        width: WIDTH,
        height: HEIGHT,
    });
    try {
        chart.setOption(
            lineOption(shape, shapePositions(shape), {
                colors: chartColors,
                theme: fallbackTheme,
                reducedMotion: true,
            }),
        );
        return normalized(chart.renderToSVGString());
    } finally {
        chart.dispose();
    }
}

type Symbol = { series: number; data: number; x: number; y: number };
function symbols(svg: string): Symbol[] {
    const out: Symbol[] = [];
    for (const match of svg.matchAll(/<path [^>]*>/gu)) {
        const tag = match[0];
        if (!tag.includes('ecmeta_ssr_type="chart"')) continue;
        const at = /matrix\([^,]+,0,0,[^,]+,([-0-9.]+),([-0-9.]+)\)/u.exec(tag);
        const series = /ecmeta_series_index="(\d+)"/u.exec(tag);
        const data = /ecmeta_data_index="(\d+)"/u.exec(tag);
        if (at && series && data)
            out.push({
                series: Number(series[1]),
                data: Number(data[1]),
                x: Number(at[1]),
                y: Number(at[2]),
            });
    }
    return out;
}

/** The drawn line of each series: its stroke colour and its subpaths (one per unbroken run). */
function lines(svg: string): { stroke: string; subpaths: number }[] {
    return [
        ...svg.matchAll(
            /<path d="([^"]*)" fill="none"[^>]*stroke="([^"]+)" stroke-width="2" stroke-linejoin="bevel"/gu,
        ),
    ].map((match) => ({ stroke: match[2]!, subpaths: (match[1]!.match(/M/gu) ?? []).length }));
}

const decode = (text: string) =>
    text
        .replace(/&lt;/gu, "<")
        .replace(/&gt;/gu, ">")
        .replace(/&quot;/gu, '"')
        .replace(/&#39;/gu, "'")
        .replace(/&amp;/gu, "&");

function texts(svg: string): { text: string; x: number }[] {
    return [...svg.matchAll(/<text([^>]*)>([^<]*)<\/text>/gu)].map((match) => ({
        text: decode(match[2]!),
        x: Number(/translate\(([-0-9.]+)/u.exec(match[1]!)?.[1] ?? Number.NaN),
    }));
}

/** Axis tick text is scale only: numbers, or a UTC month and day ("Aug 5", `utcTick`). */
const TICK = /^(?:-?\d+(?:\.\d+)?|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2})$/u;

function expectOnlyServedWords(
    svg: string,
    shape: RenderShape,
    categories: readonly string[] = [],
) {
    const served = new Set([
        shape.axis_label,
        shape.value_label,
        ...shape.series.map((series) => series.label),
        ...categories,
    ]);
    for (const { text } of texts(svg))
        expect(served.has(text) || TICK.test(text), JSON.stringify(text)).toBe(true);
}

describe("time axis geometry (E8 §7.2, §12.1)", () => {
    it("places each point by elapsed time: uneven dates stay uneven", async () => {
        const shape = k1().render_shapes![0]!;
        const svg = svgOf(shape);
        const marks = symbols(svg).filter((mark) => mark.series === 0);
        const points = [...shape.series[0]!.points].sort(
            (a, b) => utcInstant(a.label)! - utcInstant(b.label)!,
        );
        expect(marks).toHaveLength(points.length);
        const t = points.map((point) => utcInstant(point.label)!);
        const x = marks.sort((a, b) => a.data - b.data).map((mark) => mark.x);
        const tSpan = t.at(-1)! - t[0]!;
        const xSpan = x.at(-1)! - x[0]!;
        for (let i = 0; i < t.length; i++) {
            expect(Math.abs((x[i]! - x[0]!) / xSpan - (t[i]! - t[0]!) / tSpan)).toBeLessThan(0.005);
        }
        // The capture's dates are uneven, so an index-spaced chart would fail the check above.
        const steps = t.slice(1).map((value, i) => value - t[i]!);
        expect(new Set(steps).size).toBeGreaterThan(1);
        expectOnlyServedWords(svg, shape);
        await expect(svg).toMatchFileSnapshot("../__baselines__/line-time-uneven.svg");
    });

    it("draws values on a zero-based linear scale: height is proportional to the served value", () => {
        const shape = k1().render_shapes![0]!;
        const marks = symbols(svgOf(shape))
            .filter((mark) => mark.series === 0)
            .sort((a, b) => a.data - b.data);
        const values = [...shape.series[0]!.points]
            .sort((a, b) => utcInstant(a.label)! - utcInstant(b.label)!)
            .map((point) => point.value);
        const top = values.indexOf(Math.max(...values));
        const zeroY = (() => {
            // Two marks fix the line y = zeroY - k * value.
            const low = values.indexOf(Math.min(...values));
            const k = (marks[low]!.y - marks[top]!.y) / (values[top]! - values[low]!);
            return marks[top]!.y + k * values[top]!;
        })();
        const k = (zeroY - marks[top]!.y) / values[top]!;
        values.forEach((value, i) =>
            expect(Math.abs(marks[i]!.y - (zeroY - k * value))).toBeLessThan(0.5),
        );
    });

    it("breaks a series' line at a union instant it has no point for, and marks no point there", async () => {
        const shape = multiSeries(k1());
        const svg = svgOf(shape);
        expect(lines(svg)).toEqual([
            { stroke: chartColors[0], subpaths: 1 },
            { stroke: chartColors[1], subpaths: 2 },
        ]);
        expect(symbols(svg).filter((mark) => mark.series === 0)).toHaveLength(
            shape.series[0]!.points.length,
        );
        expect(symbols(svg).filter((mark) => mark.series === 1)).toHaveLength(
            shape.series[1]!.points.length,
        );
        expectOnlyServedWords(svg, shape);
        await expect(svg).toMatchFileSnapshot("../__baselines__/line-time-multi-gap.svg");
    });
});

describe("category axis geometry (E8 §7.3)", () => {
    it("labels positions in the served union order and draws only served words", async () => {
        const shape = categoryLine(k1(), ["c", "a", "b"]);
        const svg = svgOf(shape);
        const labels = texts(svg)
            .filter(({ text }) => ["a", "b", "c"].includes(text))
            .sort((p, q) => p.x - q.x)
            .map(({ text }) => text);
        expect(labels).toEqual(["c", "a", "b"]);
        expectOnlyServedWords(svg, shape, ["a", "b", "c"]);
        await expect(svg).toMatchFileSnapshot("../__baselines__/line-category-union.svg");
    });
});

describe("hostile served strings (E8 §8)", () => {
    it("renders them as escaped text: no element, no rich-text markup is made from them", async () => {
        const shape = hostileLine(k1());
        const svg = svgOf(shape);
        // Any case: an element made from served text would be a tag, whatever its case.
        expect(svg).not.toMatch(/<\s*(?:img|script|\/div)\b/iu);
        // The axis name is the served `axis_label`, escaped.
        expect(svg).toContain("&lt;/div&gt;&lt;script&gt;alert(1)&lt;/script&gt;");
        // `{a|x}{b}` is drawn as those characters, not parsed as rich text.
        expect(texts(svg).map(({ text }) => text)).toContain(HOSTILE[2]);
        await expect(svg).toMatchFileSnapshot("../__baselines__/line-category-hostile.svg");
    });
});
