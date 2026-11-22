import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultMetricFilter } from "@/lib/filters/defaults";
import { encodeFilterParam } from "@/lib/filters/encode";
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

// A link whose `f` names a service or developer that does not exist. The server render answers
// the empty state with its reason (service_not_found / developer_not_found); the bar must not
// then swap the URL to the default team filter, which renders org-wide data with no notice.
describe("useFilterBarState: unknown scope in f (CHAOS-14489)", () => {
    afterEach(() => {
        replace.mockClear();
        vi.restoreAllMocks();
    });

    it.each(["service", "developer"] as const)(
        "keeps a %s scope with an unknown id: no URL rewrite to the default filter",
        (level) => {
            const unknownScope: MetricFilter = {
                ...defaultMetricFilter,
                scope: { level, ids: [`${level}-does-not-exist`] },
            };
            search.query = `f=${encodeFilterParam(unknownScope)}`;
            const historyReplace = vi.spyOn(window.history, "replaceState");

            const { result } = renderHook(() =>
                useFilterBarState({
                    view: "work",
                    resolvedScopeLock: "team",
                    writeDefaultFilter: true,
                }),
            );

            expect(result.current.filters.scope).toEqual(unknownScope.scope);
            expect(replace).not.toHaveBeenCalled();
            expect(historyReplace).not.toHaveBeenCalled();
        },
    );
});
