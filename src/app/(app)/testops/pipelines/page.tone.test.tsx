/** CHAOS-9077: the TestOps Pipelines tiles pass goodDirection as inverseGood; the tone must not move. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { cleanup, render, screen, within } from "@/test/utils";

const { mockCheckApiHealth, mockFetchTestOpsData, mockFetchJobFailures } = vi.hoisted(() => ({
    mockCheckApiHealth: vi.fn(),
    mockFetchTestOpsData: vi.fn(),
    mockFetchJobFailures: vi.fn(),
}));

const requireSessionMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ requireSession: requireSessionMock }));
beforeEach(() => requireSessionMock.mockResolvedValue({ user: { org_id: "org-1" } }));
vi.mock("next/navigation", () => ({
    usePathname: () => "/testops/pipelines",
    useSearchParams: () => new URLSearchParams(),
    useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/lib/api/system", () => ({ checkApiHealth: mockCheckApiHealth }));
vi.mock("@/lib/testops/fetchers", () => ({
    fetchTestOpsData: mockFetchTestOpsData,
    fetchJobFailures: mockFetchJobFailures,
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

import PipelinesPage from "./page";

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
    dimensionValue: "all",
    measure,
    buckets: [
        { date: "2026-09-01", value: first },
        { date: "2026-09-02", value: last },
    ],
});

async function renderWith(success: [number, number], failure: [number, number]) {
    mockFetchTestOpsData.mockResolvedValue({
        pipelines: {
            timeseries: [
                ts("PIPELINE_SUCCESS_RATE", ...success),
                ts("PIPELINE_FAILURE_RATE", ...failure),
            ],
            breakdowns: [],
        },
        tests: { timeseries: [], breakdowns: [] },
        coverage: { timeseries: [], breakdowns: [] },
    });
    render(await PipelinesPage({ searchParams: Promise.resolve({}) }));
}

beforeEach(() => {
    vi.clearAllMocks();
    mockCheckApiHealth.mockResolvedValue({ ok: true });
    mockFetchJobFailures.mockResolvedValue({ groups: [], totalCount: 0, truncated: false });
});
afterEach(cleanup);

describe("TestOps Pipelines tile change tone", () => {
    it("failure rate (down is good): falling good, rising bad", async () => {
        await renderWith([90, 90], [6, 3]);
        expect(deltaOf("testops-pipelines-tiles", "Failure Rate")?.className).toContain(GOOD);
        cleanup();
        await renderWith([90, 90], [3, 6]);
        const cls = deltaOf("testops-pipelines-tiles", "Failure Rate")?.className;
        expect(cls).toContain(BAD);
        expect(cls).not.toContain(GOOD);
    });
    it("success rate (up is good): rising good, falling bad", async () => {
        await renderWith([90, 95], [3, 3]);
        expect(deltaOf("testops-pipelines-tiles", "Success Rate")?.className).toContain(GOOD);
        cleanup();
        await renderWith([95, 90], [3, 3]);
        const cls = deltaOf("testops-pipelines-tiles", "Success Rate")?.className;
        expect(cls).toContain(BAD);
        expect(cls).not.toContain(GOOD);
    });
});
