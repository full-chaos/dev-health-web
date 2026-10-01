import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { defaultMetricFilter } from "@/lib/filters/defaults";
import { encodeFilterParam } from "@/lib/filters/encode";
import { FILTER_OPTIONS, scopeBarUrl } from "@/test/scopeBarHarness";

import FeatureFlagsPage from "./page";

// The page had no filter bar: `f` only sets the date range of its fetch. The
// scope bar has no Filters drawer and must not write or rewrite `f`.

vi.mock("next/navigation", () => ({
    useRouter: () => ({ replace: scopeBarUrl.replace, push: vi.fn(), refresh: vi.fn() }),
    usePathname: () => scopeBarUrl.pathname,
    useSearchParams: () => new URLSearchParams(scopeBarUrl.search),
}));
vi.mock("@/components/filters/useFilterOptions", () => ({
    useFilterOptions: () => FILTER_OPTIONS,
}));
vi.mock("@/components/shell/PageHeader", () => ({
    PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock("@/components/feature-flags/FeatureFlagTable", () => ({ FeatureFlagTable: () => null }));
vi.mock("@/components/metrics/MetricCard", () => ({ MetricCard: () => null }));
vi.mock("./actions", () => ({ fetchFlagPage: vi.fn() }));
vi.mock("@/lib/feature-flags/fetchers", () => ({
    fetchFeatureFlagsData: vi.fn().mockResolvedValue({ summary: { activeFlags: 1 } }),
    fetchFeatureFlagList: vi.fn().mockResolvedValue({ items: [], totalCount: 0 }),
}));
vi.mock("@/lib/api/system", () => ({ checkApiHealth: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock("@/lib/config", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/config")>()),
    getServerEnv: () => ({}),
}));

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("Feature Flags scope bar", () => {
    beforeEach(() => scopeBarUrl.reset(""));

    it("has no Filters trigger and writes no default `f` when the URL has none", async () => {
        render(await FeatureFlagsPage({ searchParams: Promise.resolve({}) }));

        expect(screen.getByTestId("scope-bar")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Filters" })).toBeNull();
        await settle();
        expect(scopeBarUrl.replace).not.toHaveBeenCalled();
    });

    it("does not rewrite the `f` the page reads for its date range", async () => {
        const f = encodeFilterParam({
            ...defaultMetricFilter,
            time: { ...defaultMetricFilter.time, range_days: 30 },
        });
        scopeBarUrl.reset(`f=${f}`);

        render(await FeatureFlagsPage({ searchParams: Promise.resolve({ f }) }));
        await settle();

        expect(scopeBarUrl.replace).not.toHaveBeenCalled();
        expect(new URLSearchParams(scopeBarUrl.search).get("f")).toBe(f);
    });
});
