import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

const { mockForecast } = vi.hoisted(() => ({ mockForecast: vi.fn() }));

vi.mock("@/lib/api/system", () => ({ checkApiHealth: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock("@/lib/auth", () => ({
    requireSession: vi.fn().mockResolvedValue({ user: { org_id: "org-1" } }),
}));
vi.mock("@/lib/graphql/capacityFetchers", () => ({
    getThroughputForecastViaGraphQL: mockForecast,
}));
vi.mock("@/components/shell/PageHeader", () => ({
    PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock("@/components/shell/ScopeBar", () => ({ ScopeBar: () => <div data-testid="scope-bar" /> }));
vi.mock("@/components/charts/VerticalBarChart", () => ({
    VerticalBarChart: ({ categories }: { categories: string[] }) => (
        <div data-testid="throughput-bars">{categories.join(",")}</div>
    ),
}));

import PlanPage from "./page";

const overlay = (
    kind: string,
    label: string,
    value: number,
    threshold: number,
    active = false,
) => ({
    kind,
    score: 0,
    label,
    value,
    threshold,
    active,
});

const forecast = (over: Record<string, unknown> = {}) => ({
    forecastId: "f1",
    computedAt: "2026-10-01T00:00:00Z",
    teamId: null,
    backlogSize: 51,
    historyWeeks: 12,
    insufficientHistory: false,
    p50Weeks: 1,
    p75Weeks: 2,
    p90Weeks: 4,
    rollingWindows: [
        { windowWeeks: 4, meanWeeklyThroughput: 12, sampleCount: 4, insufficientHistory: false },
        { windowWeeks: 8, meanWeeklyThroughput: 10, sampleCount: 8, insufficientHistory: false },
        { windowWeeks: 12, meanWeeklyThroughput: 9, sampleCount: 12, insufficientHistory: false },
    ],
    wipCongestion: overlay("wip", "WIP congestion", 0.69, 1.25),
    reviewBottleneck: overlay("review", "Review bottleneck", 0.3, 48),
    incidentLoad: overlay("incident_load", "Incident burden", 0, 10),
    primaryRisk: overlay("wip", "WIP congestion", 0.69, 1.25),
    ...over,
});

async function renderPage(searchParams: Record<string, string> = {}) {
    return render(await PlanPage({ searchParams: Promise.resolve(searchParams) }));
}

beforeEach(() => mockForecast.mockReset());

describe("Plan overview — what the page shows (pins)", () => {
    it("shows the open items, P50 / P75 / P90 in weeks and the caption", async () => {
        mockForecast.mockResolvedValue(forecast());
        await renderPage();

        expect(screen.getByText("Delivery confidence")).toBeInTheDocument();
        expect(screen.getByText("open items")).toBeInTheDocument();
        expect(screen.getAllByText("51").length).toBeGreaterThan(0);
        expect(screen.getByText("1 weeks")).toBeInTheDocument();
        expect(screen.getByText("2 weeks")).toBeInTheDocument();
        expect(screen.getByText("4 weeks")).toBeInTheDocument();
        expect(screen.getAllByText("Weeks to complete backlog")).toHaveLength(3);
        expect(
            screen.getByText(/Backlog and scope count are derived from current filters/),
        ).toBeInTheDocument();
    });

    it("shows a missing percentile as text, never a number", async () => {
        mockForecast.mockResolvedValue(forecast({ p75Weeks: null }));
        await renderPage();

        expect(screen.getByText("Not enough throughput")).toBeInTheDocument();
    });

    it("marks the percentiles with a Limited history chip when history is short", async () => {
        mockForecast.mockResolvedValue(forecast({ insufficientHistory: true }));
        await renderPage();

        expect(screen.getAllByText("Limited history").length).toBeGreaterThanOrEqual(3);
    });

    it("shows the rolling throughput windows 4w / 8w / 12w", async () => {
        mockForecast.mockResolvedValue(forecast());
        await renderPage();

        expect(screen.getByRole("heading", { name: "Rolling throughput" })).toBeInTheDocument();
        expect(screen.getByTestId("throughput-bars")).toHaveTextContent("4w,8w,12w");
    });

    it("shows the three risk cards with value, threshold and Elevated / Normal", async () => {
        mockForecast.mockResolvedValue(
            forecast({
                wipCongestion: overlay("wip", "WIP congestion", 1.5, 1.25, true),
            }),
        );
        await renderPage();

        const wip = screen.getByRole("heading", { level: 3, name: "WIP congestion" }).closest("div")
            ?.parentElement as HTMLElement;
        expect(within(wip).getByText("Elevated")).toBeInTheDocument();
        expect(within(wip).getByText("1.5×")).toBeInTheDocument();
        expect(within(wip).getByText("Threshold 1.25×")).toBeInTheDocument();
        const review = screen
            .getByRole("heading", { level: 3, name: "Review bottleneck" })
            .closest("div")?.parentElement as HTMLElement;
        expect(within(review).getByText("Normal")).toBeInTheDocument();
        expect(within(review).getByText("0.3h")).toBeInTheDocument();
        expect(within(review).getByText("Threshold 48h")).toBeInTheDocument();
        expect(screen.getByText("0/week")).toBeInTheDocument();
    });

    it("keeps the primary risk callout as the last section", async () => {
        mockForecast.mockResolvedValue(forecast());
        await renderPage();

        const callout = screen.getByText("Primary risk callout").closest("section");
        expect(callout).not.toBeNull();
        expect(callout?.nextElementSibling).toBeNull();
        expect(within(callout as HTMLElement).getByRole("heading")).toHaveTextContent(
            "WIP congestion",
        );
    });

    it("shows the empty forecast state with the scope and its text when there is no forecast", async () => {
        mockForecast.mockResolvedValue(null);
        await renderPage();

        expect(screen.getByRole("heading", { name: "No forecast available" })).toBeInTheDocument();
        expect(screen.getByText("All teams")).toBeInTheDocument();
        expect(
            screen.getByText(/Not enough throughput history to generate a forecast/),
        ).toBeInTheDocument();
        expect(screen.queryByText("Delivery confidence")).toBeNull();
    });
});
