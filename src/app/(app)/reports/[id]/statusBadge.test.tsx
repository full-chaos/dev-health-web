import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@/test/utils";

import SingleReportPage from "./page";
import { ReportStatus } from "@/lib/reports/types";
import type { ReportRun, SavedReport } from "@/lib/reports/types";

// CHAOS-7885: the run history status badge. Pins the markup and the states, so the
// page can use the shared `components/reports/StatusBadge` with no visible change.

vi.mock("next/navigation", () => ({
    useParams: () => ({ id: "report-1" }),
    useRouter: () => ({ push: vi.fn() }),
    usePathname: () => "/reports/report-1",
    useSearchParams: () => new URLSearchParams(),
}));

const mockFetchSavedReport = vi.fn();
const mockFetchReportRuns = vi.fn();
vi.mock("@/lib/reports/fetchers", () => ({
    fetchSavedReport: (...args: unknown[]) => mockFetchSavedReport(...args),
    fetchReportRuns: (...args: unknown[]) => mockFetchReportRuns(...args),
    triggerReport: vi.fn(),
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

const STATES: Array<[string, string | null]> = [
    [ReportStatus.SUCCESS, "Success"],
    [ReportStatus.FAILED, "Failed"],
    [ReportStatus.RUNNING, "Running"],
    [ReportStatus.PENDING, "Pending"],
    ["", "Never run"],
    ["cancelled", null],
];

const LAYOUT = ["rounded-full", "px-2", "py-0.5", "text-label-caps", "uppercase", "tracking-wider"];

function run(index: number, status: string): ReportRun {
    return {
        id: `run-${index}`,
        reportId: "report-1",
        status: status as ReportStatus,
        startedAt: "2026-08-01T00:00:00.000Z",
        triggeredBy: "api",
        createdAt: "2026-08-01T00:00:00.000Z",
    };
}

describe("report detail run history: the status badge (CHAOS-7885 pin)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockFetchSavedReport.mockResolvedValue(REPORT);
        mockFetchReportRuns.mockResolvedValue({
            items: STATES.map(([status], index) => run(index, status)),
            total: STATES.length,
        });
    });

    it("renders one span pill per known state, with the same words and layout, and nothing for an unknown state", async () => {
        render(<SingleReportPage />);

        await screen.findByText("Success");
        const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
        expect(rows).toHaveLength(STATES.length);

        STATES.forEach(([status, label], index) => {
            const cell = within(rows[index]).getAllByRole("cell")[1];
            if (label === null) {
                expect(cell, `status "${status}"`).toBeEmptyDOMElement();
                return;
            }
            const badges = cell.querySelectorAll("span");
            expect(badges, `status "${status}"`).toHaveLength(1);
            expect(badges[0]).toHaveTextContent(new RegExp(`^${label}$`));
            expect(badges[0].classList.contains("border"), "no visible border").toBe(false);
            for (const name of LAYOUT) expect(badges[0]).toHaveClass(name);
        });
    });
});
