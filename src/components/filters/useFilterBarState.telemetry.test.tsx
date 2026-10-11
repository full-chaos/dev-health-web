import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { defaultMetricFilter } from "@/lib/filters/defaults";
import { encodeFilterParam } from "@/lib/filters/encode";

const emit = vi.hoisted(() => vi.fn());
vi.mock("@/lib/telemetry/emitters", () => ({ emitFilterChanges: emit }));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ replace: vi.fn() }),
    usePathname: () => "/metrics",
    useSearchParams: () => new URLSearchParams(`f=${encodeFilterParam(defaultMetricFilter)}`),
}));
vi.mock("./useFilterOptions", () => ({
    useFilterOptions: () => ({ teams: [], repos: [], developers: [], services: [] }),
}));

import { useFilterBarState } from "./useFilterBarState";

describe("useFilterBarState telemetry", () => {
    beforeEach(() => emit.mockClear());

    it("emits on a user update, not on mount", () => {
        const { result } = renderHook(() => useFilterBarState({ view: "metrics" }));
        expect(emit).not.toHaveBeenCalled();
        const next = { ...defaultMetricFilter, what: { repos: ["r1"] } };
        act(() => result.current.updateFilters(next));
        expect(emit).toHaveBeenCalledTimes(1);
        expect(emit).toHaveBeenCalledWith("metrics", expect.anything(), next);
    });
});
