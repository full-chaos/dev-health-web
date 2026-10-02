import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AdminTierProvider } from "@/components/admin/AdminTierContext";
import { AppShell } from "@/components/shell/AppShell";
import { CTA_LABELS } from "@/lib/design/cta";
import { defaultMetricFilter } from "@/lib/filters/defaults";
import { encodeFilterParam } from "@/lib/filters/encode";
import type { SavedReport } from "@/lib/reports/types";

import SingleReportPage from "./page";

// The report detail page inside the shared app shell. Its three returns
// (loading, not found, the report) lose their own navigation and `<main>`.
// The report name stays the page's h1, also while it is edited (decision D1).

const fetchers = vi.hoisted(() => ({ report: vi.fn(), runs: vi.fn() }));
const DEFAULT_F = encodeFilterParam(defaultMetricFilter);
const TEAM_F = encodeFilterParam({
    ...defaultMetricFilter,
    scope: { level: "team", ids: ["platform"] },
});

vi.mock("next/navigation", () => ({
    useParams: () => ({ id: "report-1" }),
    usePathname: () => "/reports/report-1",
    useSearchParams: () => new URLSearchParams(`f=${TEAM_F}`),
    useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}));
vi.mock("next-auth/react", () => ({
    useSession: () => ({
        data: { user: { org_id: "org-1", email: "admin@devhealth.example" } },
        status: "authenticated",
        update: vi.fn(),
    }),
    signOut: vi.fn(),
}));
vi.mock("@/lib/reports/fetchers", () => ({
    fetchSavedReport: (...args: unknown[]) => fetchers.report(...args),
    fetchReportRuns: (...args: unknown[]) => fetchers.runs(...args),
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

function renderPage() {
    return render(
        <AdminTierProvider tier="community" features={{}}>
            <AppShell>
                <SingleReportPage />
            </AppShell>
        </AdminTierProvider>,
    );
}

beforeEach(() => {
    fetchers.report.mockReset();
    fetchers.runs.mockReset();
    fetchers.report.mockResolvedValue(REPORT);
    fetchers.runs.mockResolvedValue({ items: [], total: 0 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
});

describe("Report detail in the shared app shell", () => {
    it("has one main and one h1 (the report name), the description and 'Back to Reports'", async () => {
        renderPage();

        const title = await screen.findByRole("heading", { level: 1, name: "Weekly DORA" });
        expect(screen.getAllByRole("heading", { level: 1 })).toEqual([title]);
        expect(screen.getAllByRole("main")).toHaveLength(1);
        expect(screen.getByTestId("app-shell")).toContainElement(
            screen.getByTestId("shell-sidebar"),
        );
        const header = within(screen.getByTestId("page-header"));
        expect(header.getByText("DORA metrics")).toBeInTheDocument();
        expect(header.getByRole("link", { name: "Back to Reports" })).toHaveAttribute(
            "href",
            "/reports",
        );
        expect(screen.getByTestId("page-header-eyebrow")).toHaveTextContent("Reports");
    });

    it("has Edit, Clone, Delete and Run now in the header actions", async () => {
        renderPage();
        await screen.findByRole("heading", { level: 1, name: "Weekly DORA" });

        const header = within(screen.getByTestId("page-header"));
        for (const label of [
            CTA_LABELS.edit,
            CTA_LABELS.clone,
            CTA_LABELS.delete,
            CTA_LABELS.runNow,
        ]) {
            expect(header.getByRole("button", { name: label })).toBeInTheDocument();
        }
    });

    it("keeps the name as the h1 while editing; the inputs and Save / Cancel are in the header", async () => {
        const user = userEvent.setup();
        renderPage();
        await screen.findByRole("heading", { level: 1, name: "Weekly DORA" });

        await user.click(
            within(screen.getByTestId("page-header")).getByRole("button", {
                name: CTA_LABELS.edit,
            }),
        );

        expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
        const header = within(screen.getByTestId("page-header"));
        expect(header.getByRole("heading", { level: 1 })).toHaveTextContent("Weekly DORA");
        expect(header.getByDisplayValue("Weekly DORA")).toBeInTheDocument();
        expect(header.getByDisplayValue("DORA metrics")).toBeInTheDocument();
        expect(header.getByRole("button", { name: CTA_LABELS.save })).toBeInTheDocument();
        expect(header.getByRole("button", { name: CTA_LABELS.cancel })).toBeInTheDocument();
        expect(header.queryByRole("button", { name: CTA_LABELS.runNow })).toBeNull();
    });

    it("loading state: one main and the shell, no page navigation", async () => {
        fetchers.report.mockReturnValue(new Promise(() => {}));
        renderPage();

        expect(await screen.findByText("Loading report...")).toBeInTheDocument();
        expect(screen.getAllByRole("main")).toHaveLength(1);
        expect(document.querySelectorAll("aside")).toHaveLength(1);
    });

    it("not-found state: one main, the message and its return link, as before", async () => {
        fetchers.report.mockResolvedValue(null);
        renderPage();

        expect(await screen.findByText("Report not found.")).toBeInTheDocument();
        expect(screen.getAllByRole("main")).toHaveLength(1);
        expect(screen.getByRole("link", { name: "Back to Reports" })).toHaveAttribute(
            "href",
            "/reports",
        );
    });

    it("gives the sidebar links the default metric filter, as the page-level navigation did", async () => {
        renderPage();
        await waitFor(() => expect(fetchers.report).toHaveBeenCalled());

        const links = within(screen.getByRole("navigation", { name: "Primary areas" }))
            .getAllByRole("link")
            .filter((link) => (link.getAttribute("href") ?? "").includes("f="));
        expect(links.length).toBeGreaterThan(5);
        for (const link of links) {
            const url = new URL(link.getAttribute("href") ?? "", "https://app.example");
            expect(url.searchParams.get("f"), url.pathname).toBe(DEFAULT_F);
        }
    });
});
