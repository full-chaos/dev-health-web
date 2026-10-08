import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import PersonMetricPage from "./page";

const getPersonMetric = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/system", () => ({ checkApiHealth: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/api/visuals", () => ({ getHeatmap: vi.fn(async () => null) }));
vi.mock("@/lib/api/people", () => ({
    getPersonSummary: vi.fn(async () => ({ person: { person_id: "p1", display_name: "Sam" } })),
    getPersonMetric,
    getPersonDrilldown: vi.fn(async () => null),
}));
vi.mock("@/components/charts/HorizontalBarChart", () => ({
    HorizontalBarChart: ({ categories }: { categories: string[] }) => (
        <ul data-testid="bars">
            {categories.map((c) => (
                <li key={c}>{c}</li>
            ))}
        </ul>
    ),
}));
vi.mock("@/components/charts/HeatmapPanel", () => ({ HeatmapPanel: () => null }));
vi.mock("@/components/charts/TimeseriesChart", () => ({ TimeseriesChart: () => null }));
vi.mock("@/components/people/PersonRangeBar", () => ({ PersonRangeBar: () => null }));
vi.mock("@/components/shell/PageHeader", () => ({ PageHeader: () => null }));
vi.mock("next/navigation", () => ({
    usePathname: () => "/people/p1/metrics/review_latency",
    useSearchParams: () => new URLSearchParams(),
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

// ops serves by_repo[].label as repos.repo: the repository name, never an id.
const BY_REPO = [
    { label: "acme/web-app", value: 4 },
    { label: "payments-api", value: 2 },
];

describe("person metric page repo breakdown", () => {
    it("shows each served repository name as it is served", async () => {
        getPersonMetric.mockResolvedValue({
            label: "Review latency",
            breakdowns: { by_repo: BY_REPO, by_work_type: [], by_stage: [] },
            drivers: [],
            timeseries: [],
        });
        const ui = await PersonMetricPage({
            params: Promise.resolve({ person_id: "p1", metric: "review_latency" }),
        });
        render(ui);
        expect(screen.getAllByText("acme/web-app").length).toBeGreaterThan(0);
        expect(screen.getAllByText("payments-api").length).toBeGreaterThan(0);
        expect(screen.queryByText("Unresolved")).toBeNull();
    });
});
