import { describe, expect, it } from "vitest";

import {
    elapsedTimeMismatches,
    expectedRows,
    servedShapes,
    tableMismatches,
    type ServedShape,
} from "../rich-views";

/**
 * CHAOS-11946: the Phase 3 live suite compares what a chart DRAWS (its value table) with what ACR
 * SERVED (`render_shapes`). These pin the comparison itself: a planted mismatch between drawn and
 * served points must be reported, or the live suite would pass on a chart that shows other numbers.
 */

const trend: ServedShape = {
    shape_id: "rs_2",
    kind: "series",
    selected_by: "dated_fact_trend",
    title: "Backlog size over time — Fullchaos",
    series: [
        {
            key: "backlog_size",
            label: "Backlog size",
            points: [
                { label: "2026-10-12", value: 208 },
                { label: "2026-10-19", value: 231 },
                { label: "2026-10-26", value: 0.1915 },
            ],
        },
    ],
};

const drawnFrom = (rows: ReadonlyArray<readonly [string, ...string[]]>) =>
    rows.map(([label, ...cells]) => ({ label, cells }));

describe("tableMismatches", () => {
    it("finds nothing when the drawn table states every served point exactly", () => {
        const drawn = drawnFrom([
            ["2026-10-12", "208"],
            ["2026-10-19", "231"],
            ["2026-10-26", "0.1915"],
        ]);
        expect(tableMismatches(trend, drawn)).toEqual([]);
    });

    it("reports a drawn value that differs from the served one (a rounded cell is not the fact)", () => {
        const drawn = drawnFrom([
            ["2026-10-12", "208"],
            ["2026-10-19", "231"],
            ["2026-10-26", "0.19"],
        ]);
        expect(tableMismatches(trend, drawn)).toEqual([
            'row "2026-10-26", series "Backlog size": drawn "0.19", served "0.1915"',
        ]);
    });

    it("reports a served point the chart does not draw, and a drawn row ACR never served", () => {
        expect(
            tableMismatches(
                trend,
                drawnFrom([
                    ["2026-10-12", "208"],
                    ["2026-10-26", "0.1915"],
                ]),
            ),
        ).toEqual([
            "rows drawn [2026-10-12, 2026-10-26], served [2026-10-12, 2026-10-19, 2026-10-26]",
        ]);
        expect(
            tableMismatches(
                trend,
                drawnFrom([
                    ["2026-10-12", "208"],
                    ["2026-10-19", "231"],
                    ["2026-10-26", "0.1915"],
                    ["2026-11-02", "9"],
                ]),
            ),
        ).toEqual([
            "rows drawn [2026-10-12, 2026-10-19, 2026-10-26, 2026-11-02], served [2026-10-12, 2026-10-19, 2026-10-26]",
        ]);
    });

    it("keeps a missing point a gap: a drawn zero where ACR served nothing is a mismatch (check 12)", () => {
        const twoSeries: ServedShape = {
            ...trend,
            series: [
                trend.series[0]!,
                { key: "wip", label: "WIP", points: [{ label: "2026-10-12", value: 3 }] },
            ],
        };
        expect(expectedRows(twoSeries)).toEqual(
            drawnFrom([
                ["2026-10-12", "208", "3"],
                ["2026-10-19", "231", "—"],
                ["2026-10-26", "0.1915", "—"],
            ]),
        );
        expect(
            tableMismatches(
                twoSeries,
                drawnFrom([
                    ["2026-10-12", "208", "3"],
                    ["2026-10-19", "231", "0"],
                    ["2026-10-26", "0.1915", "—"],
                ]),
            ),
        ).toEqual(['row "2026-10-19", series "WIP": drawn "0", served "—"']);
    });

    it("orders a cohort's rows by the served attention rank, not by name or first sight", () => {
        const cohort: ServedShape = {
            shape_id: "rs_1",
            kind: "bars",
            selected_by: "cohort_attention_score",
            title: "Attention score",
            series: [
                {
                    key: "attention_score",
                    label: "Attention score",
                    points: [
                        { label: "Alpha", value: 10, source: { subject_canonical_id: "team:a" } },
                        { label: "Zulu", value: 40, source: { subject_canonical_id: "team:z" } },
                    ],
                },
            ],
        };
        const ranks = new Map([
            ["team:z", 1],
            ["team:a", 2],
        ]);
        expect(
            tableMismatches(
                cohort,
                drawnFrom([
                    ["Zulu", "40"],
                    ["Alpha", "10"],
                ]),
                ranks,
            ),
        ).toEqual([]);
        expect(
            tableMismatches(
                cohort,
                drawnFrom([
                    ["Alpha", "10"],
                    ["Zulu", "40"],
                ]),
                ranks,
            ),
        ).toEqual(["rows drawn [Alpha, Zulu], served [Zulu, Alpha]"]);
    });
});

describe("elapsedTimeMismatches", () => {
    const uneven = ["2026-10-01", "2026-10-02", "2026-10-11"];

    it("accepts marks placed in proportion to elapsed time", () => {
        expect(
            elapsedTimeMismatches([
                { label: uneven[0]!, x: 0 },
                { label: uneven[1]!, x: 10 },
                { label: uneven[2]!, x: 100 },
            ]),
        ).toEqual([]);
    });

    it("reports evenly spaced marks for uneven dates (a category axis, not a time axis)", () => {
        expect(
            elapsedTimeMismatches([
                { label: uneven[0]!, x: 0 },
                { label: uneven[1]!, x: 50 },
                { label: uneven[2]!, x: 100 },
            ]),
        ).toEqual(['mark "2026-10-02" at 0.500 of the axis, elapsed time puts it at 0.100']);
    });

    it("refuses a measurement it cannot make instead of passing it", () => {
        expect(elapsedTimeMismatches([{ label: uneven[0]!, x: 0 }])).toEqual([
            "fewer than two dated marks: elapsed time cannot be checked",
        ]);
        expect(
            elapsedTimeMismatches([
                { label: "not a date", x: 0 },
                { label: uneven[2]!, x: 100 },
            ]),
        ).toEqual(['mark "not a date" is not a date']);
    });
});

describe("servedShapes", () => {
    it("reads render_shapes off a served result, and none as an empty list", () => {
        expect(servedShapes({ render_shapes: [trend] })).toEqual([trend]);
        expect(servedShapes({})).toEqual([]);
        expect(servedShapes(undefined)).toEqual([]);
    });
});
