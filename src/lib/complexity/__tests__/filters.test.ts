import { describe, expect, it, vi } from "vitest";

import { defaultMetricFilter } from "@/lib/filters/defaults";
import { decodeFilter, encodeFilterParam, filterFromQueryParams } from "@/lib/filters/encode";

import { complexityScopeInputFromFilter, complexityWindowFromFilter } from "../filters";

describe("complexity filter helpers", () => {
    it("uses explicit active date bounds as inclusive UTC instants", () => {
        expect(
            complexityWindowFromFilter({
                range_days: 90,
                compare_days: 90,
                start_date: "2026-03-05",
                end_date: "2026-06-07",
            }),
        ).toEqual({
            sinceUtc: "2026-03-05T00:00:00Z",
            untilUtc: "2026-06-07T23:59:59Z",
        });
    });

    it("derives a range_days window without dropping the current day", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-06-08T12:00:00Z"));
        expect(complexityWindowFromFilter({ range_days: 3, compare_days: 3 })).toEqual({
            sinceUtc: "2026-06-06T00:00:00Z",
            untilUtc: "2026-06-08T23:59:59Z",
        });
        vi.useRealTimers();
    });

    it("maps repo and team filters to complexity query inputs", () => {
        expect(
            complexityScopeInputFromFilter({
                ...defaultMetricFilter,
                scope: { level: "repo", ids: ["repo-a", "repo-b"] },
            }),
        ).toEqual({ repoIds: ["repo-a", "repo-b"], teamIds: null });

        expect(
            complexityScopeInputFromFilter({
                ...defaultMetricFilter,
                scope: { level: "team", ids: ["team-a"] },
            }),
        ).toEqual({ repoIds: null, teamIds: ["team-a"] });
    });

    it("falls back to selected repository artifacts when scope is org", () => {
        expect(
            complexityScopeInputFromFilter({
                ...defaultMetricFilter,
                what: { ...defaultMetricFilter.what, repos: ["repo-from-what"] },
            }),
        ).toEqual({ repoIds: ["repo-from-what"], teamIds: null });
    });

    it("asks for the same scope with no `f` in the URL and with the default `f`", () => {
        // No `f`: the page reads the query params (organization level). The scope
        // bar then writes the default `f` (team level, no team). Both must give
        // the same query input.
        const withoutParam = filterFromQueryParams({});
        const withDefaultParam = decodeFilter(encodeFilterParam(defaultMetricFilter));
        expect(withoutParam.scope.level).toBe("org");
        expect(withDefaultParam.scope.level).toBe("team");

        expect(complexityScopeInputFromFilter(withDefaultParam)).toEqual(
            complexityScopeInputFromFilter(withoutParam),
        );
        expect(complexityScopeInputFromFilter(withDefaultParam)).toEqual({
            repoIds: null,
            teamIds: null,
        });
        expect(withDefaultParam.time).toEqual(withoutParam.time);
    });
});
