import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

import type { SavedReport } from "@/lib/reports/types";

import ReportsPage from "./page";

const fetchChecked = vi.fn();

vi.mock("next/navigation", () => ({
    usePathname: () => "/reports",
    useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/lib/reports/fetchers", () => ({
    fetchSavedReportsChecked: (...args: unknown[]) => fetchChecked(...args),
}));
vi.mock("@/lib/config", () => ({
    getServerEnv: () => ({ DEV_HEALTH_TEST_MODE: "false" }),
}));

function report(over: Partial<SavedReport>): SavedReport {
    return {
        id: "r1",
        orgId: "o",
        name: "Weekly health",
        description: "Delivery summary",
        reportPlan: {},
        isTemplate: false,
        isActive: true,
        createdAt: "2026-09-01T00:00:00Z",
        updatedAt: "2026-09-01T00:00:00Z",
        ...over,
    };
}

async function renderPage() {
    return render(await ReportsPage());
}

beforeEach(() => fetchChecked.mockReset());

describe("Report Center page", () => {
    it("lists saved reports as a table with schedule, last run and status", async () => {
        fetchChecked.mockResolvedValue({
            error: false,
            total: 2,
            items: [
                report({
                    id: "a",
                    name: "Weekly health",
                    scheduleId: "s1",
                    lastRunAt: "2026-09-29T12:00:00Z",
                    lastRunStatus: "success",
                }),
                report({ id: "b", name: "Release readiness", description: undefined }),
            ],
        });
        await renderPage();

        const rows = screen.getAllByTestId("report-row");
        expect(rows).toHaveLength(2);
        const first = within(rows[0]);
        expect(first.getByRole("link", { name: "Weekly health" })).toHaveAttribute(
            "href",
            "/reports/a",
        );
        expect(first.getByText("Scheduled")).toBeInTheDocument();
        expect(first.getByText("Success")).toBeInTheDocument();
        const second = within(rows[1]);
        expect(second.getByText("Manual")).toBeInTheDocument();
        expect(second.getByText("Never")).toBeInTheDocument();
        expect(second.getByText("Never run")).toBeInTheDocument();
        expect(screen.getByText("2 saved reports")).toBeInTheDocument();
    });

    it("shows a dashed empty state with Create Report when there are no reports", async () => {
        fetchChecked.mockResolvedValue({ items: [], total: 0, error: false });
        await renderPage();

        expect(screen.getByTestId("data-state-detector-enabled-no-findings")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Create report" })).toHaveAttribute(
            "href",
            "/reports/new",
        );
        expect(screen.queryByTestId("data-state-error")).toBeNull();
        expect(screen.queryByTestId("reports-table")).toBeNull();
    });

    it("shows an error state with Retry, not the empty state, when the fetch failed", async () => {
        fetchChecked.mockResolvedValue({ items: [], total: 0, error: true });
        await renderPage();

        expect(screen.getByTestId("data-state-error")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
        expect(screen.queryByTestId("data-state-detector-enabled-no-findings")).toBeNull();
        expect(screen.queryByText("No saved reports yet")).toBeNull();
    });
});

describe("Report links stay inside /reports/", () => {
    it("builds the path from the id alone: a slash or a scheme in the id is encoded", async () => {
        fetchChecked.mockResolvedValue({
            error: false,
            total: 2,
            items: [
                report({ id: "a/b", name: "Slash" }),
                report({ id: "//evil.example", name: "Evil" }),
            ],
        });
        await renderPage();

        for (const [name, href] of [
            ["Slash", "/reports/a%2Fb"],
            ["Evil", "/reports/%2F%2Fevil.example"],
        ]) {
            const link = screen.getByRole("link", { name });
            expect(link).toHaveAttribute("href", href);
            expect(screen.getByRole("link", { name: `Open ${name}` })).toHaveAttribute(
                "href",
                href,
            );
        }
    });
});
