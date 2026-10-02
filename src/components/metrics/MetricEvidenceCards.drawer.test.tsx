import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { screen, userEvent, waitFor, within } from "@/test/utils";
import type { MetricFilter } from "@/lib/filters/types";

import { MetricEvidenceCards } from "./MetricEvidenceCards";

// CHAOS-8060: a metric tile has ONE evidence target. It opens the real shared drawer (no mock of
// the panel here), and the keyboard path works: Escape closes, focus returns to the tile button.

const { mockGetExplainData } = vi.hoisted(() => ({ mockGetExplainData: vi.fn() }));

vi.mock("@/components/charts/SparklineChart", () => ({
    SparklineChart: () => <div data-testid="sparkline" />,
}));
vi.mock("@/lib/api/home", () => ({ getExplainData: mockGetExplainData }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("next/navigation", () => ({
    usePathname: () => "/metrics",
    useSearchParams: () => new URLSearchParams(),
}));

const filters = {
    scope: { level: "org", ids: ["org-1"] },
    time: { range_days: 90 },
    who: {},
    what: {},
    why: {},
    how: {},
} as MetricFilter;

const row = (metric: string, label: string) => ({
    metric,
    label,
    value: 4,
    unit: "days",
    delta_pct: 10,
    spark: [
        { ts: "2026-06-01", value: 1 },
        { ts: "2026-06-02", value: 2 },
    ],
});

const tiles = () => (
    <MetricEvidenceCards
        metrics={["cycle_time", "review_latency"]}
        deltas={[row("cycle_time", "Cycle Time"), row("review_latency", "Review Latency")]}
        filters={filters}
        activeRole="em"
        placeholderDeltas={false}
    />
);

beforeEach(() => {
    mockGetExplainData.mockReset();
    mockGetExplainData.mockResolvedValue({
        metric: "review_latency",
        label: "Review Latency",
        summary: "Review latency appears higher in this window.",
        evidence: [],
        actions: [],
    });
});

describe("MetricEvidenceCards evidence drawer", () => {
    it("opens the shared drawer for the tile's metric, with the role on the Explore link", async () => {
        render(tiles());
        const tile = screen.getByText("Review Latency").closest("article") as HTMLElement;

        await userEvent.click(within(tile).getByRole("button", { name: "Open evidence" }));

        const drawer = screen.getByRole("dialog", { name: "Evidence & Context" });
        expect(within(drawer).getByTestId("evidence-subject")).toHaveTextContent("Review Latency");
        await waitFor(() =>
            expect(mockGetExplainData).toHaveBeenCalledWith({ metric: "review_latency", filters }),
        );
        // The Explore destination of the removed tile link is the drawer's footer link.
        const link = await within(drawer).findByRole("link", { name: /Open evidence/ });
        const url = new URL(link.getAttribute("href") ?? "", "http://local");
        expect(url.pathname).toBe("/explore");
        expect(url.searchParams.get("metric")).toBe("review_latency");
        expect(url.searchParams.get("role")).toBe("em");
    });

    it("Escape closes the drawer and focus returns to the tile's Open evidence button", async () => {
        render(tiles());
        const tile = screen.getByText("Review Latency").closest("article") as HTMLElement;
        const opener = within(tile).getByRole("button", { name: "Open evidence" });
        await userEvent.click(opener);
        expect(screen.getByRole("dialog")).toBeInTheDocument();

        await userEvent.keyboard("{Escape}");

        expect(screen.queryByRole("dialog")).toBeNull();
        expect(opener).toHaveFocus();
    });
});
