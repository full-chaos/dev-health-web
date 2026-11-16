/** CHAOS-9077: the suite duration tile passes goodDirection as inverseGood and the window tiles draw no change; the tone must not move. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { cleanup, render, screen, within } from "@/test/utils";

const { mockCheckApiHealth, mockFetchTestOpsData, mockFetchJobFailures, mockFetchTestWindow } =
    vi.hoisted(() => ({
        mockCheckApiHealth: vi.fn(),
        mockFetchTestOpsData: vi.fn(),
        mockFetchJobFailures: vi.fn(),
        mockFetchTestWindow: vi.fn(),
    }));

const requireSessionMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ requireSession: requireSessionMock }));
beforeEach(() => requireSessionMock.mockResolvedValue({ user: { org_id: "org-1" } }));
vi.mock("next/navigation", () => ({
    usePathname: () => "/testops/tests",
    useSearchParams: () => new URLSearchParams(),
    useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/lib/api/system", () => ({ checkApiHealth: mockCheckApiHealth }));
vi.mock("@/lib/testops/fetchers", () => ({
    fetchTestOpsData: mockFetchTestOpsData,
    fetchJobFailures: mockFetchJobFailures,
    fetchTestWindow: mockFetchTestWindow,
}));
vi.mock("@/lib/config", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/config")>()),
    getServerEnv: () => ({}),
}));
vi.mock("@/components/shell/ScopeBar", () => ({ ScopeBar: () => <div /> }));
vi.mock("../TestOpsTabs", () => ({ TestOpsTabs: () => <div /> }));
vi.mock("@/components/shell/PageHeaderEvidenceAction", () => ({
    PageHeaderEvidenceAction: ({ subject }: { subject: { content: ReactNode } }) => (
        <div>{subject.content}</div>
    ),
}));
vi.mock("@/components/charts/SparklineChart", () => ({ SparklineChart: () => null }));
vi.mock("@/components/testops/PipelineRateTrendChart", () => ({
    PipelineRateTrendChart: () => <div />,
}));
vi.mock("@/components/charts/TimeseriesChart", () => ({ TimeseriesChart: () => <div /> }));
vi.mock("@/components/charts/HeatmapChart", () => ({ HeatmapChart: () => <div /> }));

import TestsPage from "./page";

const GOOD = "text-(--positive)";
const BAD = "text-(--accent-negative)";

/** The change element of the tile named `label` inside the tile strip, or null when it has none. */
function deltaOf(stripId: string, label: string): HTMLElement | null {
    const strip = screen.getByTestId(stripId);
    let el: HTMLElement | null = within(strip).getByText(label);
    while (el && el !== strip) {
        const found = el.querySelector<HTMLElement>('[data-testid="metric-delta"]');
        if (found) return found;
        el = el.parentElement;
    }
    return null;
}

const ts = (measure: string, first: number, last: number) => ({
    dimension: "TEAM",
    dimensionValue: "org",
    scope: "ORG",
    measure,
    buckets: [
        { date: "2026-09-01", value: first },
        { date: "2026-09-02", value: last },
    ],
});

const WINDOW = {
    sinceDate: "2026-09-01",
    untilDate: "2026-09-02",
    coverage: { completedRuns: 100, runsWithTests: 80, sharePct: 80 },
    cases: { passed: 90, failed: 10, skipped: 0, quarantined: 0, total: 100 },
    passRatePct: 90,
    failureRatePct: 10,
    flakeRatePct: 1,
};

async function renderWith(duration: [number, number]) {
    mockFetchTestWindow.mockResolvedValue(WINDOW);
    mockFetchTestOpsData.mockResolvedValue({
        tests: {
            timeseries: [
                ts("TEST_PASS_RATE", 90, 95),
                ts("TEST_FAILURE_RATE", 6, 3),
                ts("TEST_SUITE_DURATION_P95", ...duration),
            ],
            breakdowns: [],
        },
        pipelines: { timeseries: [], breakdowns: [] },
        coverage: { timeseries: [], breakdowns: [] },
    });
    render(await TestsPage({ searchParams: Promise.resolve({}) }));
}

beforeEach(() => {
    vi.clearAllMocks();
    mockCheckApiHealth.mockResolvedValue({ ok: true });
    mockFetchJobFailures.mockResolvedValue({ groups: [], totalCount: 0, truncated: false });
});
afterEach(cleanup);

describe("TestOps Tests tile change tone", () => {
    it("the window tiles draw no change at all, and not the default 'No prior period'", async () => {
        await renderWith([8, 5]);
        for (const label of ["Test coverage", "Pass Rate", "Failure Rate", "Flake Rate"]) {
            expect(deltaOf("testops-tests-tiles", label)).toBeNull();
        }
        expect(screen.queryByText("No prior period")).toBeNull();
    });
    it("suite duration (down is good, CHAOS-9077): falling good, rising bad", async () => {
        await renderWith([8, 5]);
        expect(deltaOf("testops-tests-tiles", "P95 Suite Duration")?.className).toContain(GOOD);
        cleanup();
        await renderWith([5, 8]);
        const cls = deltaOf("testops-tests-tiles", "P95 Suite Duration")?.className;
        expect(cls).toContain(BAD);
        expect(cls).not.toContain(GOOD);
    });
});
