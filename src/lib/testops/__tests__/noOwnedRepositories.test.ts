import { describe, expect, it } from "vitest";

import { PICK_ONE_TEAM, resolveTestOpsTiles } from "@/app/(app)/testops/testOpsEvidence";
import {
    filterEmptyReasonText,
    teamOwnsNoRepository,
    TEAM_OWNS_NO_REPOSITORY,
} from "@/lib/metrics/filterEmptyReason";
import { AnalyticsResultSchema } from "@/lib/graphql/schemas/analytics";

import { JobFailuresResultSchema } from "../jobFailures";
import { TestWindowResultSchema } from "../testWindow";
import { testWindowTiles } from "../testWindowTiles";

const NO_OWNED = "No owned repositories";

const series = (measure: string, value: number) => ({
    dimension: "TEAM",
    dimensionValue: "t1",
    measure,
    buckets: [
        { date: "2026-09-01", value },
        { date: "2026-09-02", value },
    ],
});

describe("team_owns_no_repository text", () => {
    it("has the approved label, and only for its own value", () => {
        expect(filterEmptyReasonText(TEAM_OWNS_NO_REPOSITORY)).toBe(NO_OWNED);
        expect(teamOwnsNoRepository("team_owns_no_repository")).toBe(true);
        expect(teamOwnsNoRepository(null)).toBe(false);
        expect(teamOwnsNoRepository(undefined)).toBe(false);
        expect(teamOwnsNoRepository("repository_not_in_team")).toBe(false);
    });
});

describe("resolveTestOpsTiles with the server reason", () => {
    const ids = ["PIPELINE_SUCCESS_RATE", "PIPELINE_FAILURE_RATE", "PIPELINE_DURATION_P95"];

    it("every tile is the state: no number, no trend, no change, never healthy", () => {
        const tiles = resolveTestOpsTiles(
            ids.map((id) => ({ id, ts: [] })),
            ["t0"],
            TEAM_OWNS_NO_REPOSITORY,
        );
        expect(tiles).toHaveLength(3);
        for (const tile of tiles) {
            expect(tile.valueText).toBe(NO_OWNED);
            expect(tile.valueIsMessage).toBe(true);
            expect(tile.value).toBeUndefined();
            expect(tile.spark).toBeUndefined();
            expect(tile.delta).toBeUndefined();
            expect(tile.noDelta).toBe(true);
        }
    });

    it("the reason wins over served rows and over the pick-one-team state", () => {
        const two = [
            series("PIPELINE_DURATION_P95", 5),
            { ...series("PIPELINE_DURATION_P95", 6), dimensionValue: "t2" },
        ];
        const withReason = resolveTestOpsTiles(
            [{ id: "PIPELINE_DURATION_P95", ts: two }],
            undefined,
            TEAM_OWNS_NO_REPOSITORY,
        );
        expect(withReason[0].valueText).toBe(NO_OWNED);
        const without = resolveTestOpsTiles([{ id: "PIPELINE_DURATION_P95", ts: two }], undefined);
        expect(without[0].valueText).toBe(PICK_ONE_TEAM);
    });

    it("no reason keeps today's tiles: empty = undefined value, a served 0 stays 0", () => {
        const empty = resolveTestOpsTiles([{ id: "PIPELINE_SUCCESS_RATE", ts: [] }], ["t1"], null);
        expect(empty[0].value).toBeUndefined();
        expect(empty[0].valueText).toBeUndefined();
        expect(empty[0].valueIsMessage).toBeUndefined();
        const zero = resolveTestOpsTiles(
            [{ id: "PIPELINE_SUCCESS_RATE", ts: [series("PIPELINE_SUCCESS_RATE", 0)] }],
            ["t1"],
        );
        expect(zero[0].value).toBe(0);
    });

    it("an unknown reason draws no state of its own here", () => {
        const tiles = resolveTestOpsTiles(
            [{ id: "PIPELINE_SUCCESS_RATE", ts: [] }],
            ["t1"],
            "repository_not_found",
        );
        expect(tiles[0].valueText).toBeUndefined();
    });
});

describe("testWindowTiles with the server reason", () => {
    const WINDOW = {
        sinceDate: "2026-09-01",
        untilDate: "2026-09-02",
        coverage: { completedRuns: 0, runsWithTests: 0, sharePct: null },
        cases: { passed: 0, failed: 0, skipped: 0, quarantined: 0, total: 0 },
        passRatePct: null,
        failureRatePct: null,
        flakeRatePct: null,
    };

    it("all five tiles are the state, and the skipped count is not shown as 0", () => {
        const tiles = testWindowTiles(
            { ...WINDOW, filterEmptyReason: TEAM_OWNS_NO_REPOSITORY },
            {},
        );
        expect(tiles).toHaveLength(5);
        for (const tile of tiles) {
            expect(tile.valueText).toBe(NO_OWNED);
            expect(tile.valueIsMessage).toBe(true);
            expect(tile.value).toBeUndefined();
        }
    });

    it("no reason: the skipped tile keeps its served 0 and the other tiles their notes", () => {
        const tiles = testWindowTiles({ ...WINDOW, filterEmptyReason: null }, {});
        expect(tiles.find((t) => t.id === "TEST_SKIPPED")?.value).toBe(0);
        expect(tiles.find((t) => t.id === "TEST_PASS_RATE")?.valueIsMessage).toBeUndefined();
    });
});

describe("answers parse with and without the field", () => {
    it("analytics", () => {
        const base = { timeseries: [], breakdowns: [] };
        expect(AnalyticsResultSchema.parse(base).filterEmptyReason).toBeUndefined();
        expect(
            AnalyticsResultSchema.parse({ ...base, filterEmptyReason: null }).filterEmptyReason,
        ).toBeNull();
        expect(
            AnalyticsResultSchema.parse({ ...base, filterEmptyReason: TEAM_OWNS_NO_REPOSITORY })
                .filterEmptyReason,
        ).toBe(TEAM_OWNS_NO_REPOSITORY);
    });
    it("window and job failures", () => {
        expect(
            JobFailuresResultSchema.parse({
                groups: [],
                totalCount: 0,
                truncated: false,
                filterEmptyReason: TEAM_OWNS_NO_REPOSITORY,
            }).filterEmptyReason,
        ).toBe(TEAM_OWNS_NO_REPOSITORY);
        expect(
            JobFailuresResultSchema.parse({ groups: [], totalCount: 0, truncated: false })
                .filterEmptyReason,
        ).toBeUndefined();
        expect(
            TestWindowResultSchema.parse({
                sinceDate: "a",
                untilDate: "b",
                coverage: { completedRuns: 0, runsWithTests: 0, sharePct: null },
                cases: { passed: 0, failed: 0, skipped: 0, quarantined: 0, total: 0 },
                passRatePct: null,
                failureRatePct: null,
                flakeRatePct: null,
            }).filterEmptyReason,
        ).toBeUndefined();
    });
});
