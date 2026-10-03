import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { screen, userEvent, within } from "@/test/utils";
import { defaultMetricFilter } from "@/lib/filters/defaults";
import type { CapacityForecast } from "@/lib/graphql/types";

const hook = vi.hoisted(() => ({ data: null as CapacityForecast | null }));
vi.mock("@/lib/graphql/hooks", () => ({ useCapacityForecast: () => ({ data: hook.data }) }));
vi.mock("@/lib/graphql/provider", () => ({ useOrgId: () => "org-1" }));
vi.mock("next/navigation", () => ({
    usePathname: () => "/plan/capacity",
    useSearchParams: () => new URLSearchParams(),
}));

import { ForecastEvidenceAction } from "./ForecastEvidenceAction";

const forecast = (over: Partial<CapacityForecast> = {}): CapacityForecast => ({
    forecastId: "f",
    computedAt: "2026-06-01T00:00:00Z",
    backlogSize: 42,
    throughputMean: 3.33,
    throughputStddev: 1.1,
    historyDays: 90,
    insufficientHistory: false,
    highVariance: false,
    p50Date: "2026-06-10T12:00:00Z",
    p50Days: 9,
    p85Date: "2026-06-20T12:00:00Z",
    p85Days: 19,
    ...over,
});

beforeEach(() => {
    hook.data = forecast();
});

const rows = async () => {
    await userEvent.click(screen.getByRole("button", { name: "View evidence" }));
    return within(await screen.findByTestId("page-evidence-facts"))
        .getAllByTestId("evidence-fact")
        .map((row) => [row.querySelector("dt")?.textContent, row.querySelector("dd")?.textContent]);
};

describe("ForecastEvidenceAction", () => {
    it("lists the forecast's served values as the tiles and inputs show them, 'Not reported' when not served", async () => {
        render(<ForecastEvidenceAction filters={defaultMetricFilter} />);

        const all = await rows();
        expect(all).toContainEqual(["Remaining work", "42 items"]);
        expect(all).toContainEqual(["P50 · optimistic", "Jun 10 · 9 days"]);
        expect(all).toContainEqual(["P85 · target", "Jun 20 · 19 days"]);
        // No P95 served: the row says so, never a date or 0.
        expect(all).toContainEqual(["P95 · conservative", "Not reported"]);
        expect(all).toContainEqual(["Mean throughput", "3.3 items/day"]);
        expect(all).toContainEqual(["History", "90 days"]);
    });

    it("draws nothing without a forecast", () => {
        hook.data = null;
        render(<ForecastEvidenceAction filters={defaultMetricFilter} />);

        expect(screen.queryByRole("button", { name: "View evidence" })).toBeNull();
    });
});
