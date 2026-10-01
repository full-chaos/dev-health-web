import { describe, expect, it } from "vitest";

import {
    END_DOT_SIZE,
    buildLegend,
    buildTooltip,
    dotRing,
    lineMark,
    pointSymbolSize,
    visibleSymbolIndexes,
    withPointSymbols,
} from "./chartConventions";

const theme = {
    text: "#111111",
    grid: "#222222",
    muted: "#333333",
    background: "#ffffff",
    stroke: "#444444",
    accent1: "#555555",
    accent2: "#666666",
    accent3: "#777777",
};

describe("buildTooltip", () => {
    it("keeps the production tooltip values: surface, hairline border, text token", () => {
        const formatter = () => "x";
        expect(buildTooltip(theme, { formatter })).toEqual({
            trigger: "axis",
            confine: true,
            backgroundColor: theme.background,
            borderColor: theme.stroke,
            textStyle: { color: theme.text },
            formatter,
        });
    });

    it("supports item triggers, an unconfined tooltip and a font size, for charts that set them", () => {
        expect(buildTooltip(theme, { trigger: "item" }).trigger).toBe("item");
        const custom = buildTooltip(theme, { confine: false, fontSize: 11 });
        expect(custom.confine).toBe(false);
        expect(custom.textStyle).toEqual({ color: theme.text, fontSize: 11 });
        expect(buildTooltip(theme).textStyle).toEqual({ color: theme.text });
    });

    it("draws a muted, 1px, solid crosshair only when asked", () => {
        expect(buildTooltip(theme).axisPointer).toBeUndefined();
        expect(buildTooltip(theme, { crosshair: true }).axisPointer).toEqual({
            type: "line",
            lineStyle: { color: theme.muted, width: 1, type: "solid" },
        });
    });
});

describe("symbols on a line", () => {
    it("shows the last point and every isolated point, nothing else", () => {
        expect([...visibleSymbolIndexes([null, 5, null, 7, 8])].sort()).toEqual([1, 4]);
        expect([...visibleSymbolIndexes([1, 2, 3])]).toEqual([2]);
        expect([...visibleSymbolIndexes([5])]).toEqual([0]);
        expect([...visibleSymbolIndexes([1, 2, null, 3])]).toEqual([3]);
        expect([...visibleSymbolIndexes([4, null])]).toEqual([0]);
        expect([...visibleSymbolIndexes([])]).toEqual([]);
        expect([...visibleSymbolIndexes([null, undefined])]).toEqual([]);
    });

    it("sizes the dot on those points and 0 elsewhere", () => {
        const size = pointSymbolSize([null, 5, null, 7, 8]);
        expect([0, 1, 2, 3, 4].map((dataIndex) => size(undefined, { dataIndex }))).toEqual([
            0,
            END_DOT_SIZE,
            0,
            0,
            END_DOT_SIZE,
        ]);
    });

    it("sizes data items for charts with a legend, so the series size stays the legend glyph", () => {
        const ring = dotRing(theme);
        expect(withPointSymbols([null, 5, null, 7, 8], theme)).toEqual([
            { value: null, symbolSize: 0 },
            { value: 5, symbolSize: END_DOT_SIZE, itemStyle: ring },
            { value: null, symbolSize: 0 },
            { value: 7, symbolSize: 0 },
            { value: 8, symbolSize: END_DOT_SIZE, itemStyle: ring },
        ]);
    });

    it("rings the dot in the surface color and draws a 2px round line", () => {
        expect(dotRing(theme)).toEqual({ borderColor: theme.background, borderWidth: 2 });
        expect(lineMark).toEqual({ width: 2, cap: "round", join: "round" });
    });
});

describe("buildLegend", () => {
    it("is absent for one series and a muted bottom legend for two or more", () => {
        expect(buildLegend([], theme)).toBeUndefined();
        expect(buildLegend(["A"], theme)).toBeUndefined();
        expect(buildLegend(["A", "B"], theme)).toEqual({
            data: ["A", "B"],
            bottom: 0,
            left: "center",
            textStyle: { color: theme.muted },
        });
    });

    it("lets a caller keep a legend that is the only place the measure is named", () => {
        expect(buildLegend(["A"], theme, true)).toMatchObject({ data: ["A"] });
        expect(buildLegend(["A", "B"], theme, false)).toBeUndefined();
    });
});
