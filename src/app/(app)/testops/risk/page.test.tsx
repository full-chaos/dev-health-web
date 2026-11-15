import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockFetchRiskMetrics, quadrantProps } = vi.hoisted(() => ({
    mockFetchRiskMetrics: vi.fn(),
    quadrantProps: vi.fn(),
}));

const requireSessionMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ requireSession: requireSessionMock }));
beforeEach(() => requireSessionMock.mockResolvedValue({ user: { org_id: "org-1" } }));
vi.mock("@/lib/api/system", () => ({ checkApiHealth: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock("@/lib/testops/fetchers", () => ({ fetchRiskMetrics: mockFetchRiskMetrics }));
vi.mock("@/lib/config", () => ({ getServerEnv: () => ({}) }));
vi.mock("@/components/shell/ScopeBar", () => ({ ScopeBar: () => <div data-testid="scope-bar" /> }));
vi.mock("@/components/shell/PageHeader", () => ({
    PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock("@/components/metrics/MetricCard", () => ({
    MetricCard: ({ label }: { label: string }) => <article>{label}</article>,
}));
vi.mock("@/components/charts/TimeseriesChart", () => ({
    TimeseriesChart: () => <div data-testid="timeseries-chart" />,
}));
vi.mock("@/components/charts/HorizontalBarChart", () => ({
    HorizontalBarChart: () => <div data-testid="horizontal-bar-chart" />,
}));
vi.mock("@/components/charts/QuadrantChart", () => ({
    QuadrantChart: (props: { data: { points: unknown[] } }) => {
        quadrantProps(props);
        return <div data-testid="quadrant-chart" data-points={props.data.points.length} />;
    },
}));

import RiskPage from "./page";

const risk = (quadrant_data: unknown[]) => ({
    timeseries: [{ date: "2026-09-01", riskScore: 0.2 }],
    quality_drag_breakdown: [{ category: "Retry Overhead", hours: 3 }],
    quadrant_data,
});

describe("Delivery Risk page", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("titles the scatter after its axes and draws no zone overlay", async () => {
        mockFetchRiskMetrics.mockResolvedValue(
            risk([{ id: "repo-a", pipeline_success_rate: 0.9, test_pass_rate: 0.95 }]),
        );

        render(await RiskPage({ searchParams: Promise.resolve({}) }));

        expect(
            screen.getByRole("heading", { name: "Pipeline success × test pass rate (by repo)" }),
        ).toBeInTheDocument();
        expect(screen.queryByText("Risk vs Throughput (by Repo)")).toBeNull();
        const props = quadrantProps.mock.calls[0][0];
        expect(props.scopeType).toBe("repo");
        expect(props.showZoneOverlay).toBeUndefined();
    });

    it("keeps every repo: plots the measured ones and lists the rest as not measured", async () => {
        mockFetchRiskMetrics.mockResolvedValue(
            risk([
                { id: "repo-a", name: "repo-a", pipeline_success_rate: 90, test_pass_rate: 95 },
                { id: "repo-b", name: "repo-b", pipeline_success_rate: 90 },
                { id: "repo-c", name: "repo-c", test_pass_rate: 50 },
            ]),
        );
        render(await RiskPage({ searchParams: Promise.resolve({}) }));
        expect(screen.getByTestId("quadrant-chart")).toHaveAttribute("data-points", "1");
        const items = within(screen.getByTestId("risk-not-measured")).getAllByRole("listitem");
        expect(items).toHaveLength(2);
        expect(screen.getByTestId("risk-not-measured-count")).toHaveTextContent(
            "1 plotted, 2 not measured",
        );
    });

    it("keeps the empty state only when the window holds no repo at all", async () => {
        mockFetchRiskMetrics.mockResolvedValue(risk([]));
        render(await RiskPage({ searchParams: Promise.resolve({}) }));
        expect(screen.queryByTestId("quadrant-chart")).toBeNull();
        expect(screen.queryByTestId("risk-not-measured")).toBeNull();
        expect(screen.getByTestId("risk-throughput-empty")).toBeInTheDocument();
        expect(screen.getByText("No repo risk data for this window")).toBeInTheDocument();
    });

    describe("a repo with an absent rate (CHAOS-13847)", () => {
        const both = {
            id: "repo-a",
            name: "repo-a",
            pipeline_success_rate: 90,
            test_pass_rate: 95,
        };
        const listed = () => screen.getByTestId("risk-not-measured");

        it("(a) plots a repo with both rates and lists nothing as not measured", async () => {
            mockFetchRiskMetrics.mockResolvedValue(risk([both]));
            render(await RiskPage({ searchParams: Promise.resolve({}) }));
            expect(screen.getByTestId("quadrant-chart")).toHaveAttribute("data-points", "1");
            expect(screen.queryByTestId("risk-not-measured")).toBeNull();
            const point = quadrantProps.mock.calls[0][0].data.points[0];
            expect([point.x, point.y]).toEqual([90, 95]);
        });

        it("(b) lists a repo with no test pass rate, naming that rate, and does not plot it", async () => {
            mockFetchRiskMetrics.mockResolvedValue(
                risk([both, { id: "repo-b", name: "repo-b", pipeline_success_rate: 90 }]),
            );
            render(await RiskPage({ searchParams: Promise.resolve({}) }));
            expect(screen.getByTestId("quadrant-chart")).toHaveAttribute("data-points", "1");
            expect(listed()).toHaveTextContent("repo-b");
            expect(listed()).toHaveTextContent("test pass rate not measured");
            expect(listed()).not.toHaveTextContent("pipeline success rate");
            expect(listed()).not.toHaveTextContent("0%");
            const ids = quadrantProps.mock.calls[0][0].data.points.map(
                (p: { entity_id: string }) => p.entity_id,
            );
            expect(ids).toEqual(["repo-a"]);
        });

        it("(c) lists a repo with no pipeline success rate, naming that rate, and does not plot it", async () => {
            mockFetchRiskMetrics.mockResolvedValue(
                risk([both, { id: "repo-c", name: "repo-c", test_pass_rate: 50 }]),
            );
            render(await RiskPage({ searchParams: Promise.resolve({}) }));
            expect(screen.getByTestId("quadrant-chart")).toHaveAttribute("data-points", "1");
            expect(listed()).toHaveTextContent("repo-c");
            expect(listed()).toHaveTextContent("pipeline success rate not measured");
            expect(listed()).not.toHaveTextContent("test pass rate");
            expect(listed()).not.toHaveTextContent("0%");
        });

        it("(d) lists a repo with both rates absent, and the list replaces the empty state", async () => {
            mockFetchRiskMetrics.mockResolvedValue(risk([{ id: "repo-d", name: "repo-d" }]));
            render(await RiskPage({ searchParams: Promise.resolve({}) }));
            expect(screen.queryByTestId("quadrant-chart")).toBeNull();
            expect(screen.queryByTestId("risk-throughput-empty")).toBeNull();
            expect(listed()).toHaveTextContent("repo-d");
            expect(listed()).toHaveTextContent(
                "pipeline success rate and test pass rate not measured",
            );
            expect(listed()).not.toHaveTextContent("0%");
        });

        it("(e) keeps a real 0 rate plotted, not listed", async () => {
            mockFetchRiskMetrics.mockResolvedValue(
                risk([
                    { id: "repo-z", name: "repo-z", pipeline_success_rate: 0, test_pass_rate: 0 },
                ]),
            );
            render(await RiskPage({ searchParams: Promise.resolve({}) }));
            expect(screen.getByTestId("quadrant-chart")).toHaveAttribute("data-points", "1");
            expect(screen.queryByTestId("risk-not-measured")).toBeNull();
        });

        it("(f) orders the list by repo name, not by input order", async () => {
            mockFetchRiskMetrics.mockResolvedValue(
                risk([
                    { id: "1", name: "zeta" },
                    { id: "2", name: "alpha", test_pass_rate: 10 },
                    { id: "3", name: "mid", pipeline_success_rate: 10 },
                ]),
            );
            render(await RiskPage({ searchParams: Promise.resolve({}) }));
            const names = within(listed())
                .getAllByRole("listitem")
                .map((li) => li.getAttribute("data-repo"));
            expect(names).toEqual(["alpha", "mid", "zeta"]);
        });
    });

    it("draws the three tiles as one joined metric strip and each chart in a shared section card", async () => {
        mockFetchRiskMetrics.mockResolvedValue(
            risk([{ id: "repo-a", pipeline_success_rate: 0.9, test_pass_rate: 0.95 }]),
        );
        render(await RiskPage({ searchParams: Promise.resolve({}) }));

        const strip = screen.getByTestId("delivery-risk-tiles");
        expect(strip).toHaveAttribute("data-columns", "3");
        expect(
            within(strip)
                .getAllByRole("article")
                .map((a) => a.textContent),
        ).toEqual(["Release Confidence", "Quality Drag", "Pipeline Stability"]);
        for (const [id, title, chart] of [
            ["delivery-risk-trend", "Risk Trend", "timeseries-chart"],
            ["delivery-risk-drag", "Quality Drag Breakdown", "horizontal-bar-chart"],
            [
                "delivery-risk-scatter",
                "Pipeline success × test pass rate (by repo)",
                "quadrant-chart",
            ],
        ]) {
            const card = screen.getByTestId(id);
            expect(card.tagName).toBe("SECTION");
            expect(within(card).getByRole("heading", { level: 2 })).toHaveTextContent(title);
            expect(within(card).getByTestId(chart)).toBeInTheDocument();
        }
    });
});

describe("RiskPage org scope (CHAOS-8272)", () => {
    it("shows one plain sentence and makes no request when the session has no org", async () => {
        requireSessionMock.mockResolvedValue({ user: {} });
        mockFetchRiskMetrics.mockClear();
        render(await RiskPage({ searchParams: Promise.resolve({}) }));
        expect(screen.getByText(/no organization selected/i)).toBeInTheDocument();
        expect(mockFetchRiskMetrics).not.toHaveBeenCalled();
    });
});

describe("Delivery Risk says the scope bar's team and repository do not apply", () => {
    const NOTICE =
        "Delivery Risk shows the whole organization. The team and repository selection does not apply on this tab.";
    const f = (filter: Record<string, unknown>) => ({
        f: Buffer.from(
            JSON.stringify({ time: { range_days: 14 }, who: {}, why: {}, how: {}, ...filter }),
            "utf8",
        ).toString("base64url"),
    });
    const renderWith = async (searchParams: Record<string, string>) => {
        mockFetchRiskMetrics.mockResolvedValue(risk([]));
        render(await RiskPage({ searchParams: Promise.resolve(searchParams) }));
    };

    it("shows the notice when a team is picked", async () => {
        await renderWith(f({ scope: { level: "team", ids: ["t1"] }, what: {} }));
        expect(screen.getByText(NOTICE)).toBeInTheDocument();
    });

    it("shows the notice when a repository is picked", async () => {
        await renderWith(f({ scope: { level: "org", ids: [] }, what: { repos: ["r1"] } }));
        expect(screen.getByText(NOTICE)).toBeInTheDocument();
    });

    it("shows no notice when nothing is picked", async () => {
        await renderWith({});
        expect(screen.queryByText(NOTICE)).toBeNull();
    });
});
