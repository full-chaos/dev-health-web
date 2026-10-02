import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { STATUS_PILL } from "@/lib/statusPill";

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

        // The first tile is "Open items" (the concept's name; production said "Delivery confidence").
        expect(screen.getByText("Open items")).toBeInTheDocument();
        expect(screen.queryByText("Delivery confidence")).toBeNull();
        expect(screen.getAllByText("51").length).toBeGreaterThan(0);
        expect(screen.getByText("1 week")).toBeInTheDocument();
        expect(screen.queryByText("1 weeks")).toBeNull();
        expect(screen.getByText("2 weeks")).toBeInTheDocument();
        expect(screen.getByText("4 weeks")).toBeInTheDocument();
        expect(screen.getAllByText("throughput-based")).toHaveLength(3);
        expect(screen.getByText("Derived from current filters")).toBeInTheDocument();
        // The four tiles are one joined strip, one column per tile.
        const strip = screen.getByTestId("plan-tiles");
        expect(strip).toHaveAttribute("data-columns", "4");
        expect(within(strip).getAllByTestId("percentile-tile")).toHaveLength(3);
    });

    it("shows a missing percentile as a dash with its reason, never a number", async () => {
        mockForecast.mockResolvedValue(forecast({ p75Weeks: null }));
        await renderPage();

        // The value is a dash (missing is not zero) and the caption says why.
        const tiles = screen.getAllByTestId("percentile-tile");
        expect(within(tiles[1]).getByText("—")).toBeInTheDocument();
        expect(within(tiles[1]).getByText("Not enough throughput")).toBeInTheDocument();
        expect(within(tiles[1]).queryByText(/weeks/)).toBeNull();
    });

    it("marks the percentiles with a Limited history chip when history is short", async () => {
        mockForecast.mockResolvedValue(forecast({ insufficientHistory: true }));
        await renderPage();

        expect(screen.getAllByText("Limited history").length).toBeGreaterThanOrEqual(3);
        const pills = screen.getAllByTestId("limited-history-pill");
        expect(pills).toHaveLength(3);
        for (const pill of pills) expect(pill.className).toContain(STATUS_PILL.caution);
        // The production 60 % fade is gone: it lowered the contrast of the text.
        for (const tile of screen.getAllByTestId("percentile-tile")) {
            expect(tile.className).not.toContain("opacity");
        }
    });

    it("shows the rolling throughput windows 4w / 8w / 12w", async () => {
        mockForecast.mockResolvedValue(forecast());
        await renderPage();

        expect(screen.getByRole("heading", { name: "Rolling throughput" })).toBeInTheDocument();
        expect(screen.getByTestId("throughput-bars")).toHaveTextContent("4w,8w,12w");
    });

    it("shows the three risk checks as fact rows with value and Elevated / Normal", async () => {
        mockForecast.mockResolvedValue(
            forecast({
                wipCongestion: overlay("wip", "WIP congestion", 1.5, 1.25, true),
            }),
        );
        await renderPage();

        const facts = within(screen.getByTestId("risk-facts")).getAllByTestId("evidence-fact");
        expect(facts.map((row) => row.querySelector("dt")?.textContent)).toEqual([
            "WIP congestion",
            "Review bottleneck",
            "Incident burden",
        ]);
        expect(facts[0]).toHaveTextContent("1.5×Elevated");
        expect(facts[1]).toHaveTextContent("0.3hNormal");
        expect(facts[2]).toHaveTextContent("0/weekNormal");
    });

    it("names the incident check 'Incident burden' (prototype) whatever label the API serves", async () => {
        mockForecast.mockResolvedValue(
            forecast({ incidentLoad: overlay("incident_load", "Incident load", 0, 10) }),
        );
        await renderPage();

        const labels = within(screen.getByTestId("risk-facts"))
            .getAllByTestId("evidence-fact")
            .map((row) => row.querySelector("dt")?.textContent);
        expect(labels).toContain("Incident burden");
        expect(labels).not.toContain("Incident load");
    });

    it("labels the tiles P50 / P75 / P90 forecast and says '1 week' for exactly one", async () => {
        mockForecast.mockResolvedValue(forecast());
        await renderPage();

        const tiles = screen.getAllByTestId("percentile-tile");
        expect(tiles.map((tile) => within(tile).getByText(/forecast$/).textContent)).toEqual([
            "P50 forecast",
            "P75 forecast",
            "P90 forecast",
        ]);
    });

    it("shows the prototype's No elevated risk inset with the served thresholds when calm", async () => {
        mockForecast.mockResolvedValue(forecast());
        await renderPage();

        const inset = screen.getByTestId("risk-inset");
        expect(
            within(inset).getByRole("heading", { name: "No elevated risk" }),
        ).toBeInTheDocument();
        expect(inset).toHaveTextContent(
            "Checks: WIP threshold 1.25×, review threshold 48 hours, incident threshold 10 per week.",
        );
    });

    it("says 'not reported' for a threshold that is not set, never 0", async () => {
        mockForecast.mockResolvedValue(
            forecast({ reviewBottleneck: overlay("review", "Review bottleneck", 0.3, 0) }),
        );
        await renderPage();

        const text = screen.getByTestId("risk-inset").textContent ?? "";
        expect(text).toContain("review threshold not reported");
        expect(text).not.toMatch(/review threshold 0/);
    });

    it("folds the primary risk into the Risk checks inset when a risk is elevated", async () => {
        mockForecast.mockResolvedValue(
            forecast({
                wipCongestion: overlay("wip", "WIP congestion", 1.5, 1.25, true),
                primaryRisk: overlay("wip", "WIP congestion", 1.5, 1.25, true),
            }),
        );
        await renderPage();

        const inset = screen.getByTestId("risk-inset");
        expect(within(inset).getByRole("heading", { name: "WIP congestion" })).toBeInTheDocument();
        expect(inset).toHaveTextContent("most elevated current overlay");
        expect(screen.queryByText("No elevated risk")).toBeNull();
        // The old stand-alone callout section is gone.
        expect(screen.queryByText("Primary risk callout")).toBeNull();
    });

    it("shows the empty forecast state with the scope and its text when there is no forecast", async () => {
        mockForecast.mockResolvedValue(null);
        await renderPage();

        // The shared empty state (DataState) shows its title as text, not as a heading.
        expect(screen.getByText("No forecast available")).toBeInTheDocument();
        expect(screen.getByText(/Scope: All teams\./)).toBeInTheDocument();
        expect(
            screen.getByText(/Not enough throughput history to generate a forecast/),
        ).toBeInTheDocument();
        expect(screen.getByTestId("plan-empty-forecast")).toBeInTheDocument();
        expect(screen.queryByText("Delivery confidence")).toBeNull();
    });
});

describe("Plan overview — page pass", () => {
    it("shows the Completion outlook card from values on the page, in tentative words", async () => {
        mockForecast.mockResolvedValue(forecast());
        await renderPage();

        const card = screen.getByTestId("plan-completion-outlook");
        expect(
            within(card).getByRole("heading", { name: "Completion outlook" }),
        ).toBeInTheDocument();
        expect(within(card).getByTestId("outlook-headline")).toHaveTextContent(
            "51 items · about 1 week at P50",
        );
        const text = card.textContent ?? "";
        expect(text).toContain(
            "At recent throughput, the open items appear to take about 1 week (P50).",
        );
        expect(text).toContain("P50, P75 and P90 as shown in the tiles.");
        expect(text).not.toMatch(/\bwill\b/i);
        expect(text).not.toContain("provisional");
        // The rolling throughput chart lives in this card.
        expect(
            within(card).getByRole("heading", { name: "Rolling throughput" }),
        ).toBeInTheDocument();
        expect(within(card).getByTestId("throughput-bars")).toHaveTextContent("4w,8w,12w");
    });

    it("agrees singular and plural in the outlook", async () => {
        mockForecast.mockResolvedValue(forecast({ backlogSize: 1, p50Weeks: 3 }));
        await renderPage();

        expect(screen.getByTestId("outlook-headline")).toHaveTextContent(
            "1 item · about 3 weeks at P50",
        );
        expect(screen.getByTestId("plan-completion-outlook").textContent).toContain(
            "about 3 weeks (P50)",
        );
    });

    it("says the outlook is provisional with limited history, and invents no number without throughput", async () => {
        mockForecast.mockResolvedValue(forecast({ insufficientHistory: true }));
        const first = await renderPage();
        expect(screen.getByTestId("plan-completion-outlook")).toHaveTextContent("provisional");
        first.unmount();

        mockForecast.mockResolvedValue(forecast({ p50Weeks: null }));
        await renderPage();
        const card = screen.getByTestId("plan-completion-outlook");
        expect(within(card).getByTestId("outlook-headline")).toHaveTextContent(/^51 items$/);
        expect(card.textContent).toContain(
            "Not enough throughput history to suggest a completion range.",
        );
        expect(card.textContent).not.toMatch(/about \d+ weeks?/);
    });

    it("has no outlook card and no destinations when there is no forecast", async () => {
        mockForecast.mockResolvedValue(null);
        await renderPage();

        expect(screen.queryByTestId("plan-completion-outlook")).toBeNull();
        expect(screen.queryByTestId("plan-destinations")).toBeNull();
    });

    it("links to the forecast and the backlog risk page, keeping f, role and origin", async () => {
        mockForecast.mockResolvedValue(forecast());
        await renderPage({ role: "em", origin: "cockpit" });

        const destinations = screen.getByTestId("plan-destinations");
        const forecastLink = within(destinations).getByRole("link", {
            name: "Forecast completion",
        });
        const backlogLink = within(destinations).getByRole("link", {
            name: "Inspect backlog risk",
        });
        for (const [link, path] of [
            [forecastLink, "/plan/capacity"],
            [backlogLink, "/plan/backlog-risk"],
        ] as const) {
            const url = new URL(link.getAttribute("href") ?? "", "https://x.test");
            expect(url.pathname).toBe(path);
            expect(url.searchParams.has("f")).toBe(true);
            expect(url.searchParams.get("role")).toBe("em");
            expect(url.searchParams.get("origin")).toBe("cockpit");
        }
        // The outlook card has its own link to the forecast.
        expect(
            within(screen.getByTestId("plan-completion-outlook")).getByRole("link", {
                name: "Completion Forecast",
            }),
        ).toHaveAttribute("href", forecastLink.getAttribute("href"));
    });

    it("shows the three risk checks as rows of one Risk checks card", async () => {
        mockForecast.mockResolvedValue(forecast());
        await renderPage();

        const card = screen.getByTestId("plan-risk-checks");
        expect(
            within(card).getByRole("heading", { level: 2, name: "Risk checks" }),
        ).toBeInTheDocument();
        expect(within(card).getAllByTestId("risk-row")).toHaveLength(3);
        expect(within(card).getByTestId("risk-inset")).toBeInTheDocument();
    });

    it("draws Elevated and Normal as token pills with an icon and the word", async () => {
        mockForecast.mockResolvedValue(
            forecast({ wipCongestion: overlay("wip", "WIP congestion", 1.5, 1.25, true) }),
        );
        await renderPage();

        const pills = screen.getAllByTestId("risk-status");
        expect(pills.map((pill) => pill.textContent)).toEqual(["Elevated", "Normal", "Normal"]);
        expect(pills[0].className).toContain(STATUS_PILL.caution);
        expect(pills[1].className).toContain(STATUS_PILL.positive);
        for (const pill of pills) expect(pill.querySelector("svg")).not.toBeNull();
    });

    it("ends with the Planning destinations card", async () => {
        mockForecast.mockResolvedValue(forecast());
        await renderPage();

        const destinations = screen.getByTestId("plan-destinations");
        expect(destinations.nextElementSibling).toBeNull();
    });
});
