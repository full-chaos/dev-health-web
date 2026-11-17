/**
 * CHAOS-13869: a selected team that owns no repository reads "No owned repositories" on every TestOps
 * tab, from the server's `filterEmptyReason`. Never a number, never "No data", never a healthy tone.
 * Without the reason the page keeps its empty state.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { cleanup, render, screen, within } from "@/test/utils";

const mocks = vi.hoisted(() => ({
    health: vi.fn(),
    data: vi.fn(),
    jobs: vi.fn(),
    window: vi.fn(),
    coverage: vi.fn(),
}));

const requireSessionMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ requireSession: requireSessionMock }));
vi.mock("next/navigation", () => ({
    usePathname: () => "/testops",
    useSearchParams: () => new URLSearchParams(),
    useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/lib/api/system", () => ({ checkApiHealth: mocks.health }));
vi.mock("@/lib/api/filterOptions", () => ({ fetchTeamNames: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/labels/entityLabel", () => ({
    resolveEntityLabels: (ids: string[]) => ({ labels: ids, titles: ids }),
}));
vi.mock("@/lib/testops/fetchers", () => ({
    fetchTestOpsData: mocks.data,
    fetchJobFailures: mocks.jobs,
    fetchTestWindow: mocks.window,
    fetchCoverageMetrics: mocks.coverage,
    fetchCoverageBaselines: vi.fn().mockResolvedValue([]),
    fetchCoverageScopeBaseline: vi.fn().mockResolvedValue({ lineBaselinePct: null, lineDays: 0 }),
}));
vi.mock("@/lib/config", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/config")>()),
    getServerEnv: () => ({}),
}));
vi.mock("@/components/shell/ScopeBar", () => ({ ScopeBar: () => <div /> }));
vi.mock("./TestOpsTabs", () => ({ TestOpsTabs: () => <div /> }));
vi.mock("@/components/shell/PageHeaderEvidenceAction", () => ({
    PageHeaderEvidenceAction: ({ subject }: { subject: { content: ReactNode } }) => (
        <div data-testid="evidence">{subject.content}</div>
    ),
}));
vi.mock("@/components/charts/SparklineChart", () => ({ SparklineChart: () => null }));
vi.mock("@/components/testops/PipelineRateTrendChart", () => ({
    PipelineRateTrendChart: () => <div data-testid="rate-chart" />,
}));
vi.mock("@/components/charts/TimeseriesChart", () => ({
    TimeseriesChart: () => <div data-testid="timeseries-chart" />,
}));
vi.mock("@/components/charts/HeatmapChart", () => ({ HeatmapChart: () => <div /> }));
vi.mock("@/components/charts/HorizontalBarChart", () => ({ HorizontalBarChart: () => <div /> }));

import OverviewPage from "./page";
import PipelinesPage from "./pipelines/page";
import TestsPage from "./tests/page";
import CoveragePage from "./coverage/page";

const NO_OWNED = "No owned repositories";
const REASON = "team_owns_no_repository";

const answer = (filterEmptyReason: string | null | undefined) => ({
    timeseries: [],
    breakdowns: [],
    filterEmptyReason,
});
const analytics = (reason: string | null | undefined) => ({
    pipelines: answer(reason),
    tests: answer(reason),
    coverage: answer(reason),
});
const WINDOW = (filterEmptyReason: string | null) => ({
    sinceDate: "2026-09-01",
    untilDate: "2026-09-02",
    coverage: { completedRuns: 0, runsWithTests: 0, sharePct: null },
    cases: { passed: 0, failed: 0, skipped: 0, quarantined: 0, total: 0 },
    passRatePct: null,
    failureRatePct: null,
    flakeRatePct: null,
    filterEmptyReason,
});
const JOBS = (filterEmptyReason: string | null) => ({
    groups: [],
    totalCount: 0,
    truncated: false,
    filterEmptyReason,
});

const NOT_THIS = /healthy|all clear|No data for this window|No failure patterns|not populated/i;

beforeEach(() => {
    vi.clearAllMocks();
    requireSessionMock.mockResolvedValue({ user: { org_id: "org-1" } });
    mocks.health.mockResolvedValue({ ok: true });
});
afterEach(cleanup);

async function renderPage(
    page: "overview" | "pipelines" | "tests" | "coverage",
    reason: string | null,
) {
    mocks.data.mockResolvedValue(analytics(reason));
    mocks.coverage.mockResolvedValue(answer(reason));
    mocks.window.mockResolvedValue(WINDOW(reason));
    mocks.jobs.mockResolvedValue(JOBS(reason));
    const props = { searchParams: Promise.resolve({}) };
    const element =
        page === "overview"
            ? await OverviewPage(props)
            : page === "pipelines"
              ? await PipelinesPage(props)
              : page === "tests"
                ? await TestsPage(props)
                : await CoveragePage(props);
    render(element);
}

describe.each([
    ["overview", "testops-overview-tiles", 5],
    ["pipelines", "testops-pipelines-tiles", 5],
    ["tests", "testops-tests-tiles", 6],
    ["coverage", "testops-coverage-tiles", 3],
] as const)("%s with a team that owns no repository", (page, strip, tileCount) => {
    it("every tile is the state, with no number and no change", async () => {
        await renderPage(page, REASON);
        const tiles = screen.getByTestId(strip);
        expect(within(tiles).getAllByText(NO_OWNED)).toHaveLength(tileCount);
        // "P95" is part of a tile name; any other digit would be a value.
        expect((tiles.textContent ?? "").replace(/P95/g, "")).not.toMatch(/\d|--/);
        expect(tiles.textContent).not.toMatch(NOT_THIS);
        expect(within(tiles).queryByText("No prior period")).toBeNull();
        expect(within(tiles).queryByText("Insufficient history")).toBeNull();
    });

    it("the body is the state too, never an empty or healthy-looking one", async () => {
        await renderPage(page, REASON);
        expect(screen.getAllByTestId("testops-no-owned-repositories").length).toBeGreaterThan(0);
        expect(screen.queryByTestId("rate-chart")).toBeNull();
        expect(screen.queryByTestId("timeseries-chart")).toBeNull();
        expect(document.body.textContent).not.toMatch(NOT_THIS);
    });

    it("the evidence facts, where the page has them, say the same", async () => {
        await renderPage(page, REASON);
        const evidence = screen.queryByTestId("evidence");
        if (evidence) expect(evidence.textContent).toContain(NO_OWNED);
    });

    it("no reason: the page keeps its empty state and shows no owned-repositories text", async () => {
        await renderPage(page, null);
        expect(screen.queryByText(NO_OWNED)).toBeNull();
        expect(screen.queryByTestId("testops-no-owned-repositories")).toBeNull();
    });

    it("an absent field is the same as no reason", async () => {
        await renderPage(page, null);
        cleanup();
        mocks.data.mockResolvedValue(analytics(undefined));
        mocks.coverage.mockResolvedValue(answer(undefined));
        await renderPage(page, null);
        expect(screen.queryByText(NO_OWNED)).toBeNull();
    });
});

describe("a window answer on its own", () => {
    it("the job-failures part says it when only its answer carries the reason", async () => {
        mocks.data.mockResolvedValue(analytics(null));
        mocks.jobs.mockResolvedValue(JOBS(REASON));
        render(await OverviewPage({ searchParams: Promise.resolve({}) }));
        const part = screen.getByTestId("testops-job-failures");
        expect(within(part).getByText(NO_OWNED)).toBeTruthy();
        expect(screen.queryByTestId("testops-job-failures-empty")).toBeNull();
    });

    it("the Tests tab says it when only the window answer carries the reason", async () => {
        mocks.data.mockResolvedValue(analytics(null));
        mocks.window.mockResolvedValue(WINDOW(REASON));
        render(await TestsPage({ searchParams: Promise.resolve({}) }));
        const tiles = screen.getByTestId("testops-tests-tiles");
        expect(within(tiles).getAllByText(NO_OWNED)).toHaveLength(6);
    });
});

describe("split answers: one reason per page (CHAOS-13936)", () => {
    const split = (over: Partial<ReturnType<typeof analytics>>) => ({
        ...analytics(null),
        ...over,
    });

    it("Tests tab: the analytics answer alone carries the reason, the window tiles say it too", async () => {
        mocks.data.mockResolvedValue(split({ tests: answer(REASON) }));
        mocks.window.mockResolvedValue({
            ...WINDOW(null),
            coverage: { completedRuns: 10, runsWithTests: 4, sharePct: 40 },
        });
        render(await TestsPage({ searchParams: Promise.resolve({}) }));
        const tiles = screen.getByTestId("testops-tests-tiles");
        expect(within(tiles).getAllByText(NO_OWNED)).toHaveLength(6);
        expect(screen.queryByTestId("testops-tests-partial-notice")).toBeNull();
    });

    it.each([
        ["coverage", { coverage: answer(REASON) }],
        ["tests", { tests: answer(REASON) }],
    ] as const)(
        "Overview: only the %s answer carries it, the trend and failures say it",
        async (_n, over) => {
            mocks.data.mockResolvedValue(split(over));
            mocks.coverage.mockResolvedValue(answer(null));
            mocks.jobs.mockResolvedValue(JOBS(null));
            render(await OverviewPage({ searchParams: Promise.resolve({}) }));
            const tiles = screen.getByTestId("testops-overview-tiles");
            expect(within(tiles).getAllByText(NO_OWNED)).toHaveLength(5);
            const trend = screen.getByTestId("testops-ci-health");
            expect(within(trend).getByText(NO_OWNED)).toBeTruthy();
            expect(screen.queryByTestId("rate-chart")).toBeNull();
        },
    );

    it("Tests tab: only the coverage answer carries the reason, the tiles and notice follow it", async () => {
        mocks.data.mockResolvedValue(split({ coverage: answer(REASON) }));
        mocks.window.mockResolvedValue({
            ...WINDOW(null),
            coverage: { completedRuns: 10, runsWithTests: 4, sharePct: 40 },
        });
        render(await TestsPage({ searchParams: Promise.resolve({}) }));
        const tiles = screen.getByTestId("testops-tests-tiles");
        expect(within(tiles).getAllByText(NO_OWNED)).toHaveLength(6);
        expect(screen.queryByTestId("testops-tests-partial-notice")).toBeNull();
    });

    it("Overview: the page reason reaches the workflow and job section", async () => {
        mocks.data.mockResolvedValue(split({ coverage: answer(REASON) }));
        mocks.coverage.mockResolvedValue(answer(null));
        mocks.jobs.mockResolvedValue({
            groups: [
                {
                    workflowName: "ci",
                    jobName: "build",
                    provider: "github",
                    runs: 4,
                    failedRuns: 2,
                    failureRate: 0.5,
                },
            ],
            totalCount: 1,
            truncated: false,
            filterEmptyReason: null,
        });
        render(await OverviewPage({ searchParams: Promise.resolve({}) }));
        const part = screen.getByTestId("testops-job-failures");
        expect(within(part).getByText(NO_OWNED)).toBeTruthy();
        expect(screen.queryByTestId("testops-job-failure-rows")).toBeNull();
    });
});
