import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultMetricFilter } from "@/lib/filters/defaults";
import { decodeFilter, encodeFilterParam } from "@/lib/filters/encode";
import type { MetricFilter } from "@/lib/filters/types";

const replace = vi.hoisted(() => vi.fn());
const search = vi.hoisted(() => ({ query: "" }));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ replace }),
    usePathname: () => "/bottleneck",
    useSearchParams: () => new URLSearchParams(search.query),
}));
vi.mock("./useFilterOptions", () => ({
    useFilterOptions: () => ({ teams: [], repos: [], developers: [], services: [] }),
}));

import { useFilterBarState } from "./useFilterBarState";

const NOTICE = "The selected service was not found; the filter was reset.";

const renderWith = (filter: MetricFilter) => {
    search.query = `f=${encodeFilterParam(filter)}`;
    return renderHook(() =>
        useFilterBarState({ view: "work", resolvedScopeLock: "team", writeDefaultFilter: true }),
    );
};

const replacedFilter = () => {
    const url = replace.mock.calls.at(-1)?.[0] as string | undefined;
    return decodeFilter(new URLSearchParams(url?.split("?")[1] ?? "").get("f"));
};

// A link whose `f` names a service that does not exist, on a team-locked view. The lock resets the
// scope to the default team filter; the reset is said with a notice, never silent (CHAOS-14489).
describe("useFilterBarState: unknown service scope in f (CHAOS-14489)", () => {
    afterEach(() => replace.mockClear());

    it("resets the scope to {team, []} and shows the notice", () => {
        const { result } = renderWith({
            ...defaultMetricFilter,
            scope: { level: "service", ids: ["service-does-not-exist"] },
        });

        expect(result.current.filters.scope).toEqual({ level: "team", ids: [] });
        expect(replacedFilter().scope).toEqual({ level: "team", ids: [] });
        expect(result.current.scopeResetNotice).toBe(NOTICE);
    });

    it("a user filter change clears the notice", () => {
        const { result } = renderWith({
            ...defaultMetricFilter,
            scope: { level: "service", ids: ["service-does-not-exist"] },
        });
        act(() => result.current.updateFilters({ ...defaultMetricFilter }));
        expect(result.current.scopeResetNotice).toBeNull();
    });

    it("no notice for a team scope or a service level with no id", () => {
        expect(renderWith(defaultMetricFilter).result.current.scopeResetNotice).toBeNull();
        const { result } = renderWith({
            ...defaultMetricFilter,
            scope: { level: "service", ids: [] },
        });
        expect(result.current.filters.scope).toEqual({ level: "team", ids: [] });
        expect(result.current.scopeResetNotice).toBeNull();
    });
});
