import { BarChart } from "echarts/charts";
import { SVGRenderer } from "echarts/renderers";
import { describe, expect, it } from "vitest";

import { chartColors, fallbackTheme } from "@/components/charts/chartTheme";
import { echarts } from "@/lib/echartsInit";
import type { RenderSeries, RenderShape } from "@/lib/ask-dev/render/contracts";
import { coverageCaption } from "@/lib/ask-dev/render/coverage-caption";
import { formatDisplay } from "@/lib/ask-dev/render/format";
import { barOption, chartHeight, shapePositions } from "@/lib/ask-dev/render/series-option";
import { verifyRenderShape } from "@/lib/ask-dev/render/verify";

import {
    kiacRanking,
    seedRanking,
    shapeOf,
    stackMissingFirstFamilyForTop,
    topRanked,
    withShapes,
    type Result,
} from "./cohortFixtures";

echarts.use([BarChart, SVGRenderer]);

// CHAOS-11943, E8 design §7.4, §12.1: bars and stacked bars, their coverage caption, and their
// server-side SVG geometry with role assertions.
const CONTEXT = { colors: chartColors, theme: fallbackTheme, reducedMotion: true };
type Series = { type: string; data: (number | null)[]; [key: string]: unknown };
type Option = { series: Series[]; xAxis: Record<string, unknown>; legend: Record<string, unknown> };
const optionOf = (shape: RenderShape, result: Result) =>
    barOption(shape, shapePositions(shape, result.cohort), CONTEXT) as unknown as Option;

const HOSTILE_MEMBER = "<img src=x onerror=alert(1)>";

function svgOf(shape: RenderShape, result: Result, extra?: (option: Option) => void): string {
    const chart = echarts.init(null, null, { renderer: "svg", ssr: true, width: 400, height: 260 });
    try {
        const option = optionOf(shape, result);
        extra?.(option);
        chart.setOption(option as never);
        const classes = new Map<string, number>();
        return chart
            .renderToSVGString()
            .replace(/\bzr\d+-/gu, "zr-")
            .replace(/zr-cls-(\d+)/gu, (_, id: string) => {
                if (!classes.has(id)) classes.set(id, classes.size);
                return `zr-cls-${classes.get(id)}`;
            });
    } finally {
        chart.dispose();
    }
}

/** Each drawn bar segment: series, data index, baseline y and height (SVG y grows downward). */
type Bar = { series: number; data: number; left: number; bottom: number; height: number };
function bars(svg: string): Bar[] {
    const out: Bar[] = [];
    for (const match of svg.matchAll(
        /<path d="M([-0-9.]+) ([-0-9.]+)l[-0-9.]+ 0l0 ([-0-9.]+)l[^"]*Z"[^>]*ecmeta_series_index="(\d+)" ecmeta_data_index="(\d+)" ecmeta_ssr_type="chart"/gu,
    )) {
        out.push({
            series: Number(match[4]),
            data: Number(match[5]),
            left: Number(match[1]),
            bottom: Number(match[2]),
            height: -Number(match[3]),
        });
    }
    return out;
}

const decode = (text: string) =>
    text
        .replace(/&lt;/gu, "<")
        .replace(/&gt;/gu, ">")
        .replace(/&quot;/gu, '"')
        .replace(/&#39;/gu, "'")
        .replace(/&amp;/gu, "&");
const texts = (svg: string) =>
    [...svg.matchAll(/<text([^>]*)>([^<]*)<\/text>/gu)].map((match) => ({
        text: decode(match[2]!),
        x: Number(/translate\(([-0-9.]+)/u.exec(match[1]!)?.[1] ?? Number.NaN),
        anchor: /text-anchor="([a-z]+)"/u.exec(match[1]!)?.[1] ?? "",
    }));
const TICK = /^-?\d+(?:\.\d+)?$/u;

/** Text by role only (E8 §12.1): served words, scale ticks, and single-series bar value labels. */
function unexpectedText(svg: string, shape: RenderShape): string[] {
    const allowed = new Set([
        shape.axis_label,
        shape.value_label,
        ...shape.series.map((series) => series.label),
        ...shape.series.flatMap((series) => series.points.map((point) => point.label)),
    ]);
    const valueLabels =
        shape.presentation === "bars" && shape.series.length === 1
            ? new Set(shape.series[0]!.points.map((point) => formatDisplay(point.value)))
            : new Set<string>();
    // A number is a value-axis tick (right-aligned, left of every bar) or a single-series bar
    // value; any other number is derived text (codex r1 and r2 on #1631).
    const plotLeft = Math.min(...bars(svg).map((bar) => bar.left));
    return texts(svg)
        .filter(
            ({ text, anchor, x }) =>
                !allowed.has(text) &&
                !valueLabels.has(text) &&
                !(TICK.test(text) && anchor === "end" && x < plotLeft),
        )
        .map(({ text }) => text);
}

describe("the fixtures are real, verifiable cohort shapes", () => {
    it("the ported verifier admits the captures' shapes and the R1-8 edit", () => {
        const result = kiacRanking();
        for (const shape of [...result.render_shapes!, stackMissingFirstFamilyForTop(result)])
            expect(verifyRenderShape(shape, withShapes(result, [shape])), shape.title).toBe(true);
    });
});

describe("bar options (E8 §7.4)", () => {
    it("bars: one series on the cohort's rank order, a display-form value label on each bar", () => {
        const result = kiacRanking();
        const shape = shapeOf(result, "cohort_attention_score");
        const option = optionOf(shape, result);
        const byRank = [...result.cohort!.members]
            .sort((a, b) => a.attention_rank! - b.attention_rank!)
            .map((m) => m.subject.label);
        expect(option.xAxis).toMatchObject({ type: "category", data: byRank });
        const [series] = option.series;
        expect(series).toMatchObject({ type: "bar", label: { show: true, position: "top" } });
        expect(series).not.toHaveProperty("stack");
        const format = (series!.label as { formatter: (p: { value?: unknown }) => string })
            .formatter;
        expect(format({ value: 66.36363636363636 })).toBe("66.36");
        expect(format({ value: null })).toBe("");
        expect(option.legend).toEqual({ show: false });
    });

    it("stacked bars: every series stacked in served order, no labels, legend not a toggle", () => {
        const result = kiacRanking();
        const shape = shapeOf(result, "cohort_driver_contribution");
        const option = optionOf(shape, result);
        expect(option.series.map((series) => [series.name, series.stack])).toEqual(
            shape.series.map((series) => [series.label, "s"]),
        );
        for (const series of option.series) {
            expect(series.label).toEqual({ show: false });
            expect(series).not.toHaveProperty("stackStrategy");
        }
        expect(option.legend).toMatchObject({ show: true, selectedMode: false });
    });

    it("has no tooltip on either chart: no hover-only content (E8 §7.1, Q7)", () => {
        const result = kiacRanking();
        for (const rule of ["cohort_attention_score", "cohort_driver_contribution"] as const)
            expect(
                (optionOf(shapeOf(result, rule), result) as unknown as { tooltip: unknown })
                    .tooltip,
            ).toEqual({
                show: false,
            });
    });

    it("R1-8: a top-ranked member missing the first driver family stays first, with a null gap", () => {
        const result = kiacRanking();
        const shape = stackMissingFirstFamilyForTop(result);
        const option = optionOf(shape, result);
        const top = result.cohort!.members.find(
            (m) => m.subject.canonical_id === topRanked(result),
        )!;
        expect((option.xAxis.data as string[])[0]).toBe(top.subject.label);
        expect(option.series[0]!.data[0]).toBeNull();
        expect(option.series[1]!.data[0]).not.toBeNull();
    });

    it("two members with one label keep their own points: positions are members, not labels (codex r1)", () => {
        const result = kiacRanking();
        const stack = structuredClone(shapeOf(result, "cohort_driver_contribution"));
        const [first, second] = [...result.cohort!.members]
            .sort((a, b) => a.attention_rank! - b.attention_rank!)
            .map((m) => m.subject.canonical_id);
        for (const m of result.cohort!.members)
            if (m.subject.canonical_id === first || m.subject.canonical_id === second)
                m.subject.label = "Shared repository";
        stack.series[0]!.points = stack.series[0]!.points.filter(
            (p) => p.source.subject_canonical_id === first,
        ) as RenderSeries["points"];
        stack.series[1]!.points = stack.series[1]!.points.filter(
            (p) => p.source.subject_canonical_id === second,
        ) as RenderSeries["points"];
        for (const series of stack.series)
            for (const p of series.points) p.label = "Shared repository";
        expect(verifyRenderShape(stack, withShapes(result, [stack]))).toBe(true);
        const option = optionOf(stack, result);
        expect(option.xAxis.data).toEqual(["Shared repository", "Shared repository"]);
        expect(option.series[0]!.data).toEqual([stack.series[0]!.points[0]!.value, null]);
        expect(option.series[1]!.data).toEqual([null, stack.series[1]!.points[0]!.value]);
        const svg = svgOf(stack, result);
        expect(
            bars(svg)
                .map((bar) => [bar.series, bar.data])
                .sort(),
        ).toEqual([
            [0, 0],
            [1, 1],
        ]);
    });

    it("G3: no total anywhere in the option (no total series, label or axis-max text)", () => {
        const result = kiacRanking();
        const text = JSON.stringify(
            optionOf(shapeOf(result, "cohort_driver_contribution"), result),
        );
        expect(text).not.toMatch(/total|sum/iu);
        for (const banned of ["markLine", "markPoint", "markArea", "dataZoom", "graphic", "max"])
            expect(text.includes(`"${banned}"`), banned).toBe(false);
    });
});

describe("room for the legend and the member names", () => {
    it("lists a stack's series one per legend row, and starts the plot below the last row", () => {
        const seed = shapeOf(seedRanking(), "cohort_driver_contribution");
        const kiac = shapeOf(kiacRanking(), "cohort_driver_contribution");
        const bars = shapeOf(kiacRanking(), "cohort_attention_score");
        const option = (shape: RenderShape, result: Result) =>
            optionOf(shape, result) as unknown as {
                grid: { top: number };
                legend: { orient?: string };
            };
        expect(option(seed, seedRanking()).legend.orient).toBe("vertical");
        expect(option(seed, seedRanking()).grid.top).toBe(16 + 20 * 4);
        expect(option(kiac, kiacRanking()).grid.top).toBe(16 + 20 * 2);
        expect(option(bars, kiacRanking()).grid.top).toBe(16);
        expect([chartHeight(seed), chartHeight(kiac), chartHeight(bars)]).toEqual([336, 296, 256]);
    });
});

describe("coverage caption (E8 §7.4)", () => {
    it("seed (F13): 3 ranked teams, 1 scored → '2 ranked teams have no score.' on both charts", () => {
        const result = seedRanking();
        for (const rule of ["cohort_attention_score", "cohort_driver_contribution"] as const)
            expect(coverageCaption(shapeOf(result, rule), result.cohort)).toEqual({
                sentences: ["2 ranked teams have no score."],
                mismatch: null,
            });
    });

    it("kiac: every ranked repository scored and charted → no cause to state", () => {
        const result = kiacRanking();
        expect(coverageCaption(shapeOf(result, "cohort_attention_score"), result.cohort)).toEqual({
            sentences: [],
            mismatch: null,
        });
    });

    it("65 scored members, rank 1 with no drivers: the stack names the cap and the missing drivers", () => {
        const result = seedRanking();
        const template = result.cohort!.members[0]!;
        const members = Array.from({ length: 65 }, (_, i) => ({
            ...structuredClone(template),
            subject: {
                ...template.subject,
                canonical_id: `team:${String(i + 1).padStart(3, "0")}`,
                label: `Team ${i + 1}`,
            },
            attention_rank: i + 1,
            score: 90 - i,
            ranking_computed: true,
            drivers: i === 0 ? [] : template.drivers,
        }));
        const cohort = { ...result.cohort!, members } as typeof result.cohort;
        const stack = structuredClone(shapeOf(result, "cohort_driver_contribution"));
        // Ranks 2..64: the 64 candidates less the driverless rank 1.
        stack.series = [
            {
                key: "a",
                label: "A",
                points: members.slice(1, 64).map((m) => ({
                    label: m.subject.label,
                    value: 1,
                    source: {
                        kind: "cohort_driver_weight_contributed",
                        subject_canonical_id: m.subject.canonical_id,
                        signal: "a",
                    },
                })),
            },
        ] as typeof stack.series;
        expect(coverageCaption(stack, cohort)).toEqual({
            sentences: [
                "1 more scored team is beyond the 64-team chart limit.",
                "1 team has no driver data.",
            ],
            mismatch: null,
        });
    });

    it("the right count of the wrong members is a mismatch too: identity, not count (codex r1)", () => {
        const result = seedRanking();
        const template = result.cohort!.members[0]!;
        const members = Array.from({ length: 65 }, (_, i) => ({
            ...structuredClone(template),
            subject: {
                ...template.subject,
                canonical_id: `team:${String(i + 1).padStart(3, "0")}`,
                label: `Team ${i + 1}`,
            },
            attention_rank: i + 1,
            score: 90 - i,
            ranking_computed: true,
        }));
        const cohort = { ...result.cohort!, members } as typeof result.cohort;
        const bars = structuredClone(shapeOf(result, "cohort_attention_score"));
        // ACR selects ranks 1..64; this shape cites ranks 2..65 (64 members).
        bars.series[0]!.points = members.slice(1, 65).map((m) => ({
            label: m.subject.label,
            value: m.score,
            source: { kind: "cohort_member_score", subject_canonical_id: m.subject.canonical_id },
        })) as RenderSeries["points"];
        expect(coverageCaption(bars, cohort)).toEqual({
            sentences: ["Shows 64 of 65 ranked teams."],
            mismatch: { ranked: 65, scored: 65, expected: 64, cited: 64 },
        });
    });

    it("a planted extra point: plain counts only, no cause, and the mismatch for the log", () => {
        const result = seedRanking();
        const bars = structuredClone(shapeOf(result, "cohort_attention_score"));
        const other = result.cohort!.members.find((m) => m.attention_rank === 2)!;
        bars.series[0]!.points.push({
            label: other.subject.label,
            value: 1,
            source: {
                kind: "cohort_member_score",
                subject_canonical_id: other.subject.canonical_id,
            },
        });
        expect(coverageCaption(bars, result.cohort)).toEqual({
            sentences: ["Shows 2 of 3 ranked teams."],
            mismatch: { ranked: 3, scored: 1, expected: 1, cited: 2 },
        });
    });
});

describe("SSR geometry (E8 §12.1)", () => {
    it("bars: heights are proportional to the served scores, in rank order, labels in display form", async () => {
        const result = kiacRanking();
        const shape = shapeOf(result, "cohort_attention_score");
        const svg = svgOf(shape, result);
        const drawn = bars(svg).sort((a, b) => a.data - b.data);
        const positions = shapePositions(shape, result.cohort);
        const values = positions.map(
            (p) => shape.series[0]!.points.find((point) => point.label === p.label)!.value,
        );
        expect(drawn).toHaveLength(values.length);
        const scale = drawn[0]!.height / values[0]!;
        drawn.forEach((bar, i) =>
            expect(Math.abs(bar.height - scale * values[i]!)).toBeLessThan(0.6),
        );
        expect(new Set(drawn.map((bar) => bar.bottom)).size).toBe(1);
        expect(unexpectedText(svg, shape)).toEqual([]);
        for (const value of values)
            expect(texts(svg).map((t) => t.text)).toContain(formatDisplay(value));
        await expect(svg).toMatchFileSnapshot("../__baselines__/bars-attention.svg");
    });

    it("stacked: each segment starts where the one below ends, in served series order; no total text", async () => {
        const result = kiacRanking();
        const shape = shapeOf(result, "cohort_driver_contribution");
        const svg = svgOf(shape, result);
        const segments = bars(svg);
        const positions = shapePositions(shape, result.cohort);
        positions.forEach((position, data) => {
            const own = segments.filter((s) => s.data === data).sort((a, b) => a.series - b.series);
            const served = shape.series.map(
                (series) => series.points.find((p) => p.label === position.label)?.value,
            );
            expect(own.map((s) => s.series)).toEqual(
                served.flatMap((v, i) => (v === undefined ? [] : [i])),
            );
            for (let i = 1; i < own.length; i++)
                expect(
                    Math.abs(own[i]!.bottom - (own[i - 1]!.bottom - own[i - 1]!.height)),
                ).toBeLessThan(0.6);
        });
        expect(unexpectedText(svg, shape)).toEqual([]);
        await expect(svg).toMatchFileSnapshot("../__baselines__/bars-stacked.svg");
    });

    it("R1-8: the missing segment draws no rect, and the member keeps its first place", async () => {
        const result = kiacRanking();
        const shape = stackMissingFirstFamilyForTop(result);
        const svg = svgOf(shape, result);
        expect(
            bars(svg)
                .filter((s) => s.data === 0)
                .map((s) => s.series),
        ).toEqual([1]);
        await expect(svg).toMatchFileSnapshot("../__baselines__/bars-stacked-gap.svg");
    });

    it("the role check fails a planted total label and a planted total series", () => {
        const result = kiacRanking();
        const shape = shapeOf(result, "cohort_driver_contribution");
        // A total printed as axis-max text.
        const withLabel = svgOf(shape, result, (option) => {
            (option as unknown as { yAxis: { name: string } }).yAxis.name = "Total";
        });
        expect(unexpectedText(withLabel, shape)).toContain("Total");
        const withSeries = svgOf(shape, result, (option) => {
            option.series.push({
                type: "bar",
                name: "Total",
                data: [1, 1, 1, 1],
                label: { show: true },
            } as Series);
            (option.legend as { data: string[] }).data.push("Total");
        });
        expect(unexpectedText(withSeries, shape)).toContain("Total");
    });

    it("the role check fails a planted numeric total: a number is a tick or a single-bar value only (codex r1)", () => {
        const result = kiacRanking();
        const shape = shapeOf(result, "cohort_driver_contribution");
        const positions = shapePositions(shape, result.cohort);
        // The sum of each stack, printed above it: a derived number, with no word "total".
        const sums = positions.map((position) =>
            shape.series.reduce(
                (sum, series) =>
                    sum +
                    (series.points.find((p) => p.source.subject_canonical_id === position.subject)
                        ?.value ?? 0),
                0,
            ),
        );
        const planted = svgOf(shape, result, (option) => {
            option.series.push({
                type: "bar",
                name: shape.series[0]!.label,
                stack: "s",
                data: sums.map(() => 0),
                label: {
                    show: true,
                    position: "top",
                    formatter: (p: { dataIndex: number }) => formatDisplay(sums[p.dataIndex]!),
                },
            } as unknown as Series);
        });
        expect(unexpectedText(planted, shape).length).toBeGreaterThan(0);
        expect(unexpectedText(svgOf(shape, result), shape)).toEqual([]);
    });

    it("the role check fails a numeric total even when it is right-aligned like a tick (codex r2)", () => {
        const result = kiacRanking();
        const shape = shapeOf(result, "cohort_driver_contribution");
        const planted = svgOf(shape, result, (option) => {
            option.series.push({
                type: "bar",
                name: shape.series[0]!.label,
                stack: "s",
                data: [0, 0, 0, 0],
                label: {
                    show: true,
                    position: "insideTopRight",
                    align: "right",
                    formatter: () => "66.36",
                },
            } as unknown as Series);
        });
        expect(unexpectedText(planted, shape)).toContain("66.36");
    });

    it("hostile member names are escaped text: no element is made from them", async () => {
        const result = kiacRanking();
        const shape = structuredClone(shapeOf(result, "cohort_attention_score"));
        const top = topRanked(result);
        for (const point of shape.series[0]!.points)
            if (point.source.subject_canonical_id === top) point.label = HOSTILE_MEMBER;
        const svg = svgOf(shape, result);
        expect(svg).not.toMatch(/<\s*(?:img|script)\b/iu);
        expect(svg).toContain("&lt;img src=x onerror=alert(1)&gt;");
        await expect(svg).toMatchFileSnapshot("../__baselines__/bars-hostile.svg");
    });
});
