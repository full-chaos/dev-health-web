import { describe, expect, it } from "vitest";

import {
    elapsedTimeMismatches,
    evidenceWindowText,
    expectedRows,
    headingMismatches,
    landscapeGap,
    outcomeWordMismatches,
    servedShapes,
    tableMismatches,
    unitWordMismatches,
    type ServedShape,
} from "../../tests/live/ask-dev/rich-views";

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

describe("evidenceWindowText (AC-7, AC-8)", () => {
    const day = (iso: string) => `day(${iso})`;

    it("states a served window with its served provenance word, and a missing one as not reported", () => {
        expect(
            evidenceWindowText(
                { start: "2026-10-04T00:00:00Z", end: "2026-11-03T00:00:00Z", provenance: "x" },
                {},
                day,
            ),
        ).toBe("Evidence window: day(2026-10-04T00:00:00Z) – day(2026-11-02T00:00:00.000Z) · x");
        // An end that is not a UTC midnight is its own day, never moved (CHAOS-13005).
        expect(
            evidenceWindowText(
                { start: "2026-10-04T00:00:00Z", end: "2026-11-03T12:00:00Z", provenance: "x" },
                {},
                day,
            ),
        ).toBe("Evidence window: day(2026-10-04T00:00:00Z) – day(2026-11-03T12:00:00Z) · x");
        expect(
            evidenceWindowText(
                { relative_id: "trailing_30d", provenance: "question_stated" },
                {},
                day,
            ),
        ).toBe("Evidence window: trailing 30d · question stated");
        expect(
            evidenceWindowText(
                { relative_id: "trailing_30d", provenance: "question_stated" },
                {
                    "window_relative_id:trailing_30d": "Last 30 days",
                    "window_provenance:question_stated": "stated in the question",
                },
                day,
            ),
        ).toBe("Evidence window: Last 30 days · stated in the question");
        expect(
            evidenceWindowText({ as_of: "2026-11-03T00:00:00Z", provenance: "x" }, {}, day),
        ).toBe("Evidence window: As of day(2026-11-03T00:00:00Z) · x");
        // Never a guessed window, and no provenance for a window that was not served.
        expect(evidenceWindowText(undefined, {}, day)).toBe("Evidence window: Not reported.");
    });
});

describe("unitWordMismatches (AC-8)", () => {
    const claims = [
        {
            table: {
                measures: ["cumulative_share", "runs"],
                measure_units: [
                    { measure: "cumulative_share", unit: "ratio" },
                    { measure: "runs", unit: "count" },
                ],
            },
        },
        { table: { measures: ["days"], measure_units: [] } },
    ];
    const labels = {
        "measure_unit:ratio": "share",
        "measure_unit:count": "runs",
        "fact_field:cumulative_share": "Share of runs finished",
    };
    const drawn = (...columns: Array<[string, string | null]>) =>
        columns.map(([heading, unit]) => ({ heading, unit }));

    it("finds nothing when each measure column carries its own served unit word", () => {
        expect(
            unitWordMismatches(
                claims,
                labels,
                drawn(
                    ["completion days", null],
                    ["Share of runs finished", "share"],
                    ["runs", "runs"],
                ),
            ),
        ).toEqual([]);
    });

    it("reports units swapped between columns: the word must sit under its own measure (Codex r2 P3)", () => {
        expect(
            unitWordMismatches(
                claims,
                labels,
                drawn(["Share of runs finished", "runs"], ["runs", "share"]),
            ),
        ).toEqual([
            'column "Share of runs finished" draws unit "runs", served "share"',
            'column "runs" draws unit "share", served "runs"',
        ]);
    });

    it("reports a served unit not drawn, and a unit drawn where ACR served none", () => {
        expect(
            unitWordMismatches(
                claims,
                labels,
                drawn(["Share of runs finished", "share"], ["runs", null]),
            ),
        ).toEqual(['column "runs" draws no unit, served "runs"']);
        expect(
            unitWordMismatches(
                claims,
                labels,
                drawn(["Share of runs finished", "share"], ["runs", "runs"], ["days", "hours"]),
            ),
        ).toEqual(['column "days" draws unit "hours", served none']);
        expect(
            unitWordMismatches(claims, labels, drawn(["Share of runs finished", "share"])),
        ).toEqual(['served unit "runs" for column "runs" is not drawn']);
    });

    it("states no unit for a measure declared twice, nor one with no served word", () => {
        const twice = [
            {
                table: {
                    measures: ["runs"],
                    measure_units: [
                        { measure: "runs", unit: "count" },
                        { measure: "runs", unit: "ratio" },
                    ],
                },
            },
        ];
        expect(unitWordMismatches(twice, labels, drawn(["runs", null]))).toEqual([]);
        expect(
            unitWordMismatches(claims, {}, drawn(["cumulative share", null], ["runs", null])),
        ).toEqual([]);
    });

    it("lets a column that is no claimed measure state only a served unit word", () => {
        const both = drawn(["Share of runs finished", "share"], ["runs", "runs"]);
        expect(
            unitWordMismatches(claims, labels, [
                ...both,
                { heading: "Completion share", unit: "share" },
            ]),
        ).toEqual([]);
        expect(
            unitWordMismatches(claims, labels, [
                ...both,
                { heading: "Completion share", unit: "hours" },
            ]),
        ).toEqual([
            'column "Completion share" draws unit "hours", not a served unit of any claimed table',
        ]);
    });

    it("says it cannot check a heading that two claims serve with different units", () => {
        const clash = [
            ...claims,
            { table: { measures: ["runs"], measure_units: [{ measure: "runs", unit: "ratio" }] } },
        ];
        expect(
            unitWordMismatches(
                clash,
                labels,
                drawn(["Share of runs finished", "share"], ["runs", "runs"]),
            ),
        ).toEqual([
            'column "runs": claims serve the units ["runs", "share"], so no one unit can be checked',
        ]);
    });
});

describe("outcomeWordMismatches (AC-11)", () => {
    const labels = {
        "member_outcome:qualified": "Qualified",
        "member_outcome:provisional": "Provisional",
    };

    it("finds nothing when each row shows its served outcome in its own word", () => {
        expect(
            outcomeWordMismatches(
                [
                    { outcome: "qualified", drawnValue: "qualified", drawnWord: "Qualified" },
                    { outcome: "provisional", drawnValue: "provisional", drawnWord: "Provisional" },
                    {
                        outcome: "insufficient_evidence",
                        drawnValue: "insufficient_evidence",
                        drawnWord: "insufficient evidence",
                    },
                    { outcome: undefined, drawnValue: null, drawnWord: "—" },
                ],
                labels,
            ),
        ).toEqual([]);
    });

    it("reports a row whose word or raw value is not the served outcome's", () => {
        expect(
            outcomeWordMismatches(
                [{ outcome: "provisional", drawnValue: "provisional", drawnWord: "Qualified" }],
                labels,
            ),
        ).toEqual(['row 1: outcome "provisional" drawn as "Qualified", served word "Provisional"']);
        expect(
            outcomeWordMismatches(
                [{ outcome: "provisional", drawnValue: "qualified", drawnWord: "Provisional" }],
                labels,
            ),
        ).toEqual(['row 1: outcome "provisional" carries the raw value "qualified"']);
    });

    it("reports two outcomes that share one word (checks 8, 12, 13)", () => {
        expect(
            outcomeWordMismatches(
                [
                    { outcome: "qualified", drawnValue: "qualified", drawnWord: "Fine" },
                    { outcome: "provisional", drawnValue: "provisional", drawnWord: "Fine" },
                ],
                { "member_outcome:qualified": "Fine", "member_outcome:provisional": "Fine" },
            ),
        ).toEqual(['outcomes "qualified" and "provisional" share the word "Fine"']);
    });
});

describe("headingMismatches (Codex r1 P3 on #1803)", () => {
    const twoSeries: ServedShape = {
        shape_id: "rs_1",
        kind: "table",
        selected_by: "comparison_side_by_side",
        title: "Pull request delivery",
        series: [
            { key: "repository:a", label: "full-chaos/dev-health-acr", points: [] },
            { key: "repository:b", label: "full-chaos/dev-health-ops", points: [] },
        ],
    };

    it("finds nothing when each value column is headed by its served series, in served order", () => {
        expect(
            headingMismatches(twoSeries, [
                "full-chaos/dev-health-acr",
                "full-chaos/dev-health-ops",
            ]),
        ).toEqual([]);
    });

    it("reports swapped headings: the cells would then sit under the other side's name", () => {
        expect(
            headingMismatches(twoSeries, [
                "full-chaos/dev-health-ops",
                "full-chaos/dev-health-acr",
            ]),
        ).toEqual([
            "value columns headed [full-chaos/dev-health-ops, full-chaos/dev-health-acr], served series [full-chaos/dev-health-acr, full-chaos/dev-health-ops]",
        ]);
    });
});

describe("landscapeGap (CHAOS-12676: the quadrant gap holds only on its own cause)", () => {
    type Answer = Parameters<typeof landscapeGap>[0];
    type Claim = NonNullable<Answer["claimed_facts"]>[number];
    const team = (id: string) => ({ kind: "team", canonical_id: `team:${id}` });
    // The frame acr reads before any day: a quadrant in the plan, a landscape requirement, and
    // two to 64 committed teams.
    const answer = (claims: Claim[], frame: Partial<Answer> = {}): Answer => ({
        answer_plan: { render_kinds: ["comparison_table", "quadrant"] },
        interpretation: { fact_requirements: [{ kind: "landscape" }] },
        subject_resolution: { committed: [team("a"), team("b")] },
        claimed_facts: claims,
        ...frame,
    });
    const side = (
        team: string,
        day: string,
        options: { identities?: number; fact?: string; churn?: number; delivery?: number } = {},
    ): Claim[] => {
        const fact = options.fact ?? `fact_${team}`;
        const churn = options.churn ?? 120;
        const delivery = options.delivery ?? 7;
        const table = {
            field: "area_breakdown",
            shape: "breakdown",
            key: ["as_of_day"],
            measures: ["churn_loc_30d", "delivery_units_30d"],
        };
        const rows = [
            {
                fields: {
                    as_of_day: { string: day },
                    identity_count: { integer: options.identities ?? 4 },
                    churn_loc_30d: { integer: 120 },
                    delivery_units_30d: { integer: 7 },
                },
            },
        ];
        const subject = { kind: "team", canonical_id: `team:${team}` };
        return [
            {
                kind: "landscape",
                subject,
                field: "churn_loc_30d",
                value: { integer: churn },
                fact_id: fact,
                table,
                rows,
            },
            {
                kind: "landscape",
                subject,
                field: "delivery_units_30d",
                value: { integer: delivery },
                fact_id: options.fact ?? fact,
                table,
                rows,
            },
        ];
    };

    it("holds when two placed teams speak for different days", () => {
        expect(
            landscapeGap(answer([...side("a", "2026-10-30"), ...side("b", "2026-11-01")])),
        ).toEqual({
            placed: [
                { subject: "team:a", day: "2026-10-30" },
                { subject: "team:b", day: "2026-11-01" },
            ],
            differ: true,
        });
    });

    it("does not hold when the placed teams share one day: a missing quadrant is then a real failure", () => {
        expect(
            landscapeGap(answer([...side("a", "2026-11-01"), ...side("b", "2026-11-01")])).differ,
        ).toBe(false);
    });

    it("does not hold when a side is refused by another rule, even with different days", () => {
        // The person floor: one identity gives no point, so acr skips for fewer than two points.
        expect(
            landscapeGap(
                answer([...side("a", "2026-10-30", { identities: 1 }), ...side("b", "2026-11-01")]),
            ),
        ).toEqual({
            placed: [{ subject: "team:b", day: "2026-11-01" }],
            differ: false,
        });
        // A measure claimed twice.
        expect(
            landscapeGap(
                answer([
                    ...side("a", "2026-10-30"),
                    side("a", "2026-10-30")[0]!,
                    ...side("b", "2026-11-01"),
                ]),
            ).differ,
        ).toBe(false);
        // The two measures from two facts.
        const split = side("a", "2026-10-30");
        split[1] = { ...split[1]!, fact_id: "fact_other" };
        expect(landscapeGap(answer([...split, ...side("b", "2026-11-01")])).differ).toBe(false);
        // A claim that does not state its row's own cell.
        expect(
            landscapeGap(
                answer([...side("a", "2026-10-30", { churn: 121 }), ...side("b", "2026-11-01")]),
            ).differ,
        ).toBe(false);
    });

    it("does not hold when acr refuses the quadrant before it reads a day", () => {
        const claims = [...side("a", "2026-10-30"), ...side("b", "2026-11-01")];
        const refused = (frame: Partial<Answer>) => landscapeGap(answer(claims, frame));
        expect(refused({ answer_plan: { render_kinds: ["comparison_table"] } })).toEqual({
            placed: [],
            differ: false,
        });
        expect(refused({ answer_plan: undefined }).differ).toBe(false);
        expect(refused({ interpretation: { fact_requirements: [{ kind: "flow" }] } }).differ).toBe(
            false,
        );
        expect(refused({ subject_resolution: { committed: [team("a")] } })).toEqual({
            placed: [],
            differ: false,
        });
        const many = Array.from({ length: 65 }, (_, index) =>
            team(index === 0 ? "a" : index === 1 ? "b" : `t${String(index)}`),
        );
        expect(refused({ subject_resolution: { committed: many } }).differ).toBe(false);
        // acr charts teams only: a committed side of another kind refuses the quadrant whole.
        expect(
            refused({
                subject_resolution: {
                    committed: [{ kind: "repository", canonical_id: "team:a" }, team("b")],
                },
            }).differ,
        ).toBe(false);
        // A team that holds claims but is not committed is no side.
        expect(refused({ subject_resolution: { committed: [team("a"), team("c")] } })).toEqual({
            placed: [{ subject: "team:a", day: "2026-10-30" }],
            differ: false,
        });
    });

    it("reads no day from a derived claim, a row that is not the one area_breakdown row, or a day that is not a string", () => {
        const derived = side("a", "2026-10-30").map((claim) => ({
            ...claim,
            derived_from: [{ claim_id: "x" }],
        }));
        expect(landscapeGap(answer([...derived, ...side("b", "2026-11-01")])).differ).toBe(false);
        const twoRows = side("a", "2026-10-30").map((claim) => ({
            ...claim,
            rows: [...claim.rows!, ...claim.rows!],
        }));
        expect(landscapeGap(answer([...twoRows, ...side("b", "2026-11-01")])).differ).toBe(false);
        const otherKey = side("a", "2026-10-30").map((claim) => ({
            ...claim,
            table: { ...claim.table!, key: ["day"] },
        }));
        expect(landscapeGap(answer([...otherKey, ...side("b", "2026-11-01")])).differ).toBe(false);
        const numberDay = side("a", "2026-10-30").map((claim) => ({
            ...claim,
            rows: [{ fields: { ...claim.rows![0]!.fields, as_of_day: { integer: 20261030 } } }],
        }));
        expect(landscapeGap(answer([...numberDay, ...side("b", "2026-11-01")])).differ).toBe(false);
    });
});
