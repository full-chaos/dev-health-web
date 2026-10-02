import { describe, expect, it } from "vitest";

import { defaultMetricFilter } from "@/lib/filters/defaults";
import { decodeFilter, encodeFilterParam } from "@/lib/filters/encode";
import type { MetricFilter } from "@/lib/filters/types";

// Compatibility proof for the `f` URL param. The strings below were written by
// the encoder as it was BEFORE the scope bar existed. A link a user saved must
// decode to the same filter after the change, and the encoder must write the
// same string for the same filter.

type GoldenCase = { name: string; encoded: string; decoded: MetricFilter };

const STABLE: GoldenCase[] = [
    {
        name: "the default filter",
        encoded:
            "eyJob3ciOnt9LCJzY29wZSI6eyJpZHMiOltdLCJsZXZlbCI6InRlYW0ifSwidGltZSI6eyJjb21wYXJlX2RheXMiOjE0LCJyYW5nZV9kYXlzIjoxNH0sIndoYXQiOnt9LCJ3aG8iOnt9LCJ3aHkiOnt9fQ",
        decoded: defaultMetricFilter,
    },
    {
        name: "a team scope with two teams",
        encoded:
            "eyJob3ciOnt9LCJzY29wZSI6eyJpZHMiOlsicGxhdGZvcm0iLCJwYXltZW50cyJdLCJsZXZlbCI6InRlYW0ifSwidGltZSI6eyJjb21wYXJlX2RheXMiOjE0LCJyYW5nZV9kYXlzIjoxNH0sIndoYXQiOnt9LCJ3aG8iOnt9LCJ3aHkiOnt9fQ",
        decoded: {
            ...defaultMetricFilter,
            scope: { level: "team", ids: ["platform", "payments"] },
        },
    },
    {
        name: "a 90-day window",
        encoded:
            "eyJob3ciOnt9LCJzY29wZSI6eyJpZHMiOltdLCJsZXZlbCI6InRlYW0ifSwidGltZSI6eyJjb21wYXJlX2RheXMiOjkwLCJyYW5nZV9kYXlzIjo5MH0sIndoYXQiOnt9LCJ3aG8iOnt9LCJ3aHkiOnt9fQ",
        decoded: { ...defaultMetricFilter, time: { range_days: 90, compare_days: 90 } },
    },
    {
        name: "a custom date range",
        encoded:
            "eyJob3ciOnt9LCJzY29wZSI6eyJpZHMiOltdLCJsZXZlbCI6InRlYW0ifSwidGltZSI6eyJjb21wYXJlX2RheXMiOjIxLCJlbmRfZGF0ZSI6IjIwMjYtMDktMjEiLCJyYW5nZV9kYXlzIjoyMSwic3RhcnRfZGF0ZSI6IjIwMjYtMDktMDEifSwid2hhdCI6e30sIndobyI6e30sIndoeSI6e319",
        decoded: {
            ...defaultMetricFilter,
            time: {
                range_days: 21,
                compare_days: 21,
                start_date: "2026-09-01",
                end_date: "2026-09-21",
            },
        },
    },
    {
        name: "every dimension filled",
        encoded:
            "eyJob3ciOnsiYmxvY2tlZCI6dHJ1ZSwiZmxvd19zdGFnZSI6WyJyZXZpZXciXX0sInNjb3BlIjp7ImlkcyI6WyJwbGF0Zm9ybSJdLCJsZXZlbCI6InRlYW0ifSwidGltZSI6eyJjb21wYXJlX2RheXMiOjMwLCJyYW5nZV9kYXlzIjozMH0sIndoYXQiOnsiYXJ0aWZhY3RzIjpbInByIiwiaXNzdWUiXSwicmVwb3MiOlsib3JnL2FwaSIsIm9yZy93ZWIiXX0sIndobyI6eyJkZXZlbG9wZXJzIjpbImFuYUBleGFtcGxlLmNvbSIsImJvQGV4YW1wbGUuY29tIl0sInJvbGVzIjpbInJldmlld2VyIl19LCJ3aHkiOnsiaXNzdWVfdHlwZSI6WyJidWciXSwid29ya19jYXRlZ29yeSI6WyJmZWF0dXJlIl19fQ",
        decoded: {
            time: { range_days: 30, compare_days: 30 },
            scope: { level: "team", ids: ["platform"] },
            who: { developers: ["ana@example.com", "bo@example.com"], roles: ["reviewer"] },
            what: { repos: ["org/api", "org/web"], artifacts: ["pr", "issue"] },
            why: { work_category: ["feature"], issue_type: ["bug"] },
            how: { flow_stage: ["review"], blocked: true },
        },
    },
    {
        name: "a value with a non-ASCII character",
        encoded:
            "eyJob3ciOnt9LCJzY29wZSI6eyJpZHMiOltdLCJsZXZlbCI6InRlYW0ifSwidGltZSI6eyJjb21wYXJlX2RheXMiOjE0LCJyYW5nZV9kYXlzIjoxNH0sIndoYXQiOnt9LCJ3aG8iOnsiZGV2ZWxvcGVycyI6WyJ6b8OrQGV4YW1wbGUuY29tIl19LCJ3aHkiOnt9fQ",
        decoded: { ...defaultMetricFilter, who: { developers: ["zoë@example.com"] } },
    },
];

describe("filter param `f` — values written by the encoder", () => {
    it.each(STABLE)("decodes $name to the same filter", ({ encoded, decoded }) => {
        expect(decodeFilter(encoded)).toEqual(decoded);
    });

    it.each(STABLE)("writes the same string again for $name", ({ encoded, decoded }) => {
        expect(encodeFilterParam(decoded)).toBe(encoded);
        expect(encodeFilterParam(decodeFilter(encoded))).toBe(encoded);
    });
});

describe("filter param `f` — values from other writers", () => {
    it("fills the missing parts of a partial object from the defaults", () => {
        // {"time":{"range_days":14},"scope":{"level":"repo","ids":["org/api"]}}
        const encoded =
            "eyJ0aW1lIjp7InJhbmdlX2RheXMiOjE0fSwic2NvcGUiOnsibGV2ZWwiOiJyZXBvIiwiaWRzIjpbIm9yZy9hcGkiXX19";

        expect(decodeFilter(encoded)).toEqual({
            ...defaultMetricFilter,
            time: { range_days: 14, compare_days: 14 },
            scope: { level: "repo", ids: ["org/api"] },
        });
    });

    it("keeps keys it does not know, at the top level and inside a dimension", () => {
        const encoded =
            "eyJ0aW1lIjp7InJhbmdlX2RheXMiOjE0LCJjb21wYXJlX2RheXMiOjE0fSwic2NvcGUiOnsibGV2ZWwiOiJ0ZWFtIiwiaWRzIjpbXX0sIndobyI6eyJkZXZlbG9wZXJzIjpbImFuYUBleGFtcGxlLmNvbSJdLCJzcXVhZCI6WyJhIl19LCJ3aGF0Ijp7fSwid2h5Ijp7fSwiaG93Ijp7fSwiZnV0dXJlIjp7IngiOjF9fQ";

        expect(decodeFilter(encoded)).toEqual({
            ...defaultMetricFilter,
            who: { developers: ["ana@example.com"], squad: ["a"] },
            future: { x: 1 },
        });
    });

    it("reads a value whose keys are not in the encoder's order, and re-encodes it in that order", () => {
        const encoded =
            "eyJ3aG8iOnsicm9sZXMiOlsiYXV0aG9yIl19LCJ0aW1lIjp7ImNvbXBhcmVfZGF5cyI6NywicmFuZ2VfZGF5cyI6N30sInNjb3BlIjp7ImlkcyI6W10sImxldmVsIjoib3JnIn0sIndoYXQiOnt9LCJ3aHkiOnt9LCJob3ciOnt9fQ";
        const decoded = decodeFilter(encoded);

        expect(decoded).toEqual({
            time: { range_days: 7, compare_days: 7 },
            scope: { level: "org", ids: [] },
            who: { roles: ["author"] },
            what: {},
            why: {},
            how: {},
        });
        expect(decodeFilter(encodeFilterParam(decoded))).toEqual(decoded);
    });

    it.each([
        ["an empty value", ""],
        ["null", null],
        ["a value that is not base64", "%%"],
        ["base64 that is not JSON", "bm90LWpzb24"],
    ])("falls back to the default filter for %s", (_label, encoded) => {
        expect(decodeFilter(encoded)).toEqual(defaultMetricFilter);
    });
});
