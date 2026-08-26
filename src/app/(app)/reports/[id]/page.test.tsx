import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@/test/utils";
import SingleReportPage from "./page";
import { ReportStatus } from "@/lib/reports/types";
import type { ReportRun, SavedReport } from "@/lib/reports/types";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
    useParams: () => ({ id: "report-1" }),
    useRouter: () => ({ push: mockPush }),
    usePathname: () => "/reports/report-1",
    useSearchParams: () => new URLSearchParams(),
}));

// Not under test here — the report/run-history refresh behavior is.
vi.mock("@/components/navigation/PrimaryNav", () => ({ PrimaryNav: () => null }));

const mockFetchSavedReport = vi.fn();
const mockFetchReportRuns = vi.fn();
const mockTriggerReport = vi.fn();
vi.mock("@/lib/reports/fetchers", () => ({
    fetchSavedReport: (...args: unknown[]) => mockFetchSavedReport(...args),
    fetchReportRuns: (...args: unknown[]) => mockFetchReportRuns(...args),
    triggerReport: (...args: unknown[]) => mockTriggerReport(...args),
    updateSavedReport: vi.fn(),
    cloneSavedReport: vi.fn(),
    deleteSavedReport: vi.fn(),
}));

const REPORT: SavedReport = {
    id: "report-1",
    orgId: "default-org",
    name: "Weekly DORA",
    description: "DORA metrics",
    reportPlan: {},
    isTemplate: false,
    isActive: true,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
};

function run(overrides: Partial<ReportRun> = {}): ReportRun {
    return {
        id: "run-1",
        reportId: "report-1",
        status: ReportStatus.SUCCESS,
        startedAt: "2026-08-01T00:00:00.000Z",
        triggeredBy: "admin@devhealth.example",
        createdAt: "2026-08-01T00:00:00.000Z",
        ...overrides,
    };
}

describe("SingleReportPage — CHAOS-4318 manual refresh (no timer-driven polling)", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        mockFetchSavedReport.mockResolvedValue(REPORT);
        mockFetchReportRuns.mockResolvedValue({ items: [run()], total: 1 });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    async function flush() {
        await act(async () => {
            await vi.advanceTimersByTimeAsync(0);
        });
    }

    it("fetches the report and run history once on mount and renders a Refresh control with a last-updated timestamp", async () => {
        render(<SingleReportPage />);
        await flush();

        expect(mockFetchSavedReport).toHaveBeenCalledTimes(1);
        expect(mockFetchReportRuns).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId("refresh-control-button")).toBeInTheDocument();
        expect(screen.getByText(/Last updated:/)).toBeInTheDocument();
    });

    it("never re-fetches run history on its own, however long the page stays open", async () => {
        render(<SingleReportPage />);
        await flush();
        mockFetchReportRuns.mockClear();

        await act(async () => {
            await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
        });

        expect(mockFetchReportRuns).not.toHaveBeenCalled();
    });

    it("re-fetches run history only on an explicit Refresh click", async () => {
        render(<SingleReportPage />);
        await flush();
        mockFetchReportRuns.mockClear();

        await act(async () => {
            screen.getByTestId("refresh-control-button").click();
            await vi.advanceTimersByTimeAsync(0);
        });

        expect(mockFetchReportRuns).toHaveBeenCalledTimes(1);
    });

    it("triggers a run with a single follow-up fetch — no setInterval poll loop", async () => {
        mockTriggerReport.mockResolvedValue(run({ status: ReportStatus.RUNNING }));
        mockFetchReportRuns.mockResolvedValue({
            items: [run({ status: ReportStatus.RUNNING })],
            total: 1,
        });

        render(<SingleReportPage />);
        await flush();
        mockFetchReportRuns.mockClear();

        await act(async () => {
            screen.getByRole("button", { name: /run now/i }).click();
            await vi.advanceTimersByTimeAsync(0);
        });

        expect(mockTriggerReport).toHaveBeenCalledTimes(1);
        // Exactly one follow-up fetch from the trigger itself.
        expect(mockFetchReportRuns).toHaveBeenCalledTimes(1);

        // No repeated polling — a 4s+ wait (the old interval cadence) issues
        // no further requests.
        await act(async () => {
            await vi.advanceTimersByTimeAsync(4000 * 3);
        });
        expect(mockFetchReportRuns).toHaveBeenCalledTimes(1);

        // The trigger button re-enables even while the run is still RUNNING —
        // seeing it through to completion is the Refresh control's job now.
        expect(screen.getByRole("button", { name: /run now/i })).not.toBeDisabled();
    });
});
