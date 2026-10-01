/**
 * Pins /explore (metric evidence) as it is: header and its actions, the Context card with its
 * filter chips, the "Debug filters" block, the Snapshot card and the two association cards.
 * Server component: called as a function, element tree rendered, data and shell parts mocked.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@/test/utils";

vi.mock("next/navigation", () => ({
    usePathname: () => "/explore",
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/shell/ScopeBar", () => ({ ScopeBar: () => <div data-testid="scope-bar" /> }));
vi.mock("@/components/charts/HorizontalBarChart", () => ({
    HorizontalBarChart: () => <div data-testid="bar-chart" />,
}));
vi.mock("@/lib/api/system", () => ({ checkApiHealth: async () => ({ ok: true }) }));

const explain = vi.hoisted(() => ({
    value: {
        metric: "cycle_time",
        label: "Cycle Time",
        unit: "days",
        value: 4.2,
        delta_pct: -12,
        drivers: [
            {
                id: "d1",
                label: "repo-alpha",
                value: 3,
                delta_pct: -20,
                evidence_link: "/api/v1/drilldown/prs?x=1",
            },
        ],
        contributors: [
            {
                id: "c1",
                label: "repo-gamma",
                value: 7,
                delta_pct: 1,
                evidence_link: "/api/v1/drilldown/prs?x=3",
            },
        ],
        drilldown_links: {},
    } as Record<string, unknown> | null,
}));
vi.mock("@/lib/api/home", () => ({
    getExplainData: async () => explain.value,
    getHomeData: async () => null,
}));
vi.mock("@/lib/api/investment", () => ({ getDrilldown: async () => null }));

import Explore from "./page";

const renderExplore = async (params: Record<string, string> = {}) =>
    render(await Explore({ searchParams: Promise.resolve(params) }));

describe("/explore today", () => {
    it("header: metric label as title, subtitle, back to Metrics, Flame diagram and Landscape actions", async () => {
        await renderExplore();
        expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Cycle Time");
        expect(screen.getByText("Evidence detail for the selected metric.")).toBeInTheDocument();
        expect(screen.getByText("Select evidence to investigate.")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /flame diagram/i }).getAttribute("href")).toContain(
            "/work?tab=flame&mode=cycle_breakdown",
        );
        expect(screen.getByRole("link", { name: /landscape/i }).getAttribute("href")).toContain(
            "/landscape",
        );
        expect(screen.getByRole("link", { name: /metrics/i }).getAttribute("href")).toContain(
            "/metrics",
        );
    });

    it("Context card: metric, view tag, the explanation line, source and the active filter chips", async () => {
        await renderExplore();
        expect(screen.getByText("Context")).toBeInTheDocument();
        expect(screen.getByText("EXPLAIN")).toBeInTheDocument();
        expect(
            screen.getByText(/This view explains Cycle Time for all orgs over the last \d+ days\./),
        ).toBeInTheDocument();
        expect(screen.getByText("Source: Metric explanation")).toBeInTheDocument();
        expect(screen.getByText("Active filters")).toBeInTheDocument();
        expect(screen.getByText("Scope: org")).toBeInTheDocument();
        expect(screen.getByText(/^Range: \d+d$/)).toBeInTheDocument();
    });

    it("the Debug filters block is gone", async () => {
        const { container } = await renderExplore();
        expect(screen.queryByText("Debug filters")).toBeNull();
        expect(container.querySelector("details")).toBeNull();
        expect(container.querySelector("pre")).toBeNull();
    });

    it("Snapshot card: value, delta against the previous window and the scope note", async () => {
        await renderExplore();
        const snap = screen.getByText("Snapshot").closest("div")!.parentElement as HTMLElement;
        expect(snap).toHaveTextContent("4.2");
        expect(snap).toHaveTextContent("-12%");
        expect(snap).toHaveTextContent("vs previous window");
        expect(snap).toHaveTextContent("Evidence links below stay in this scope.");
    });

    it("Top Associations and Contributors: headings, bar chart, link rows", async () => {
        await renderExplore();
        expect(screen.getByText("Top Associations")).toBeInTheDocument();
        expect(screen.getByText("Contributors")).toBeInTheDocument();
        expect(screen.getAllByTestId("bar-chart").length).toBeGreaterThan(0);
        expect(screen.getByText("repo-alpha")).toBeInTheDocument();
        expect(screen.getByText("repo-gamma")).toBeInTheDocument();
        expect(
            within(
                screen.getByText("Top Associations").closest("div")!.parentElement!,
            ).getAllByRole("link").length,
        ).toBeGreaterThan(0);
    });

    it("with no data the snapshot says -- and the cards say data will appear", async () => {
        explain.value = null;
        await renderExplore();
        expect(screen.getAllByText("--").length).toBeGreaterThan(0);
        explain.value = {
            metric: "cycle_time",
            label: "Cycle Time",
            unit: "days",
            value: 4.2,
            delta_pct: -12,
            drivers: [],
            contributors: [],
            drilldown_links: {},
        };
    });

    it("Read the signal sits before the Context card on the explain view", async () => {
        await renderExplore();
        const signal = screen.getByTestId("read-the-signal");
        expect(signal).toHaveTextContent("Cycle Time appears down");
        expect(signal).toHaveTextContent("shows 4.2d and a -12% change over the selected window");
        const context = screen.getByText("Context").closest("section")!;
        expect(
            signal.compareDocumentPosition(context) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
    });

    it("no Read the signal card on the drilldown view (no metric snapshot there)", async () => {
        await renderExplore({ api: "/api/v1/drilldown/prs" });
        expect(screen.queryByTestId("read-the-signal")).toBeNull();
        expect(screen.getByText("Context")).toBeInTheDocument();
    });
});
