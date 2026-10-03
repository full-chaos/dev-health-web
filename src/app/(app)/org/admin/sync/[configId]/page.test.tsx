import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ notFound: vi.fn(), useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/config", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/config")>()),
    getServerEnv: () => ({ DEV_HEALTH_TEST_MODE: "true" }),
}));
vi.mock("@/lib/admin/server", () => ({
    getSyncConfig: vi.fn(),
    getSyncJobs: vi.fn(),
    getSyncCoverage: vi.fn(),
    getActiveBackfillJob: vi.fn(),
}));
vi.mock("@/components/admin/AdminHeader", () => ({
    AdminHeader: ({
        title,
        description,
        titleBadge,
        children,
    }: {
        title: string;
        description?: string;
        titleBadge?: React.ReactNode;
        children?: React.ReactNode;
    }) => (
        <header>
            <h1>{title}</h1>
            {titleBadge ? <div data-testid="page-header-title-adornment">{titleBadge}</div> : null}
            <p data-testid="header-description">{description}</p>
            {children}
        </header>
    ),
}));
vi.mock("@/components/admin/sync/SyncProgressBar", () => ({ SyncProgressBar: () => null }));
vi.mock("@/components/admin/sync/BackfillOperations", () => ({ BackfillOperations: () => null }));
vi.mock("@/components/admin/sync/TestConnectionButton", () => ({
    TestConnectionButton: () => <span data-testid="test-connection-stub" />,
}));
vi.mock("@/components/admin/sync/SyncConfigHeaderActions", () => ({
    SyncConfigHeaderActions: () => <span data-testid="header-actions-stub" />,
}));
vi.mock("@/components/admin/sync/SyncJobHistory", () => ({
    SyncJobHistory: () => <div data-testid="job-history-body" />,
}));

import { render, screen, within } from "@/test/utils";

import SyncConfigDetailPage from "./page";

async function renderPage() {
    return render(
        await SyncConfigDetailPage({
            params: Promise.resolve({ configId: "cfg-1" }),
            searchParams: Promise.resolve({}),
        }),
    );
}

describe("Sync detail page (CHAOS-8242)", () => {
    it("has a back link to the connections list and a header line of served facts", async () => {
        await renderPage();
        expect(screen.getByRole("link", { name: /Back to connections/ })).toHaveAttribute(
            "href",
            "/org/admin/sync",
        );
        expect(screen.getByTestId("header-description")).toHaveTextContent(
            /^Provider: .+ · \d+ sync targets?( · Schedule: .+)?$/,
        );
    });

    it("draws Job History as a shared section card, and keeps Sync details collapsed as before", async () => {
        await renderPage();
        const history = screen.getByTestId("sync-job-history");
        expect(
            within(history).getByRole("heading", { level: 2, name: "Job History" }),
        ).toBeVisible();
        expect(within(history).getByTestId("job-history-body")).toBeInTheDocument();
        const details = screen.getByTestId("sync-details");
        expect(details.tagName).toBe("DETAILS");
        expect(details).not.toHaveAttribute("open");
    });

    it("has the header actions: Edit, Pause or Resume, Delete and Sync Now (CHAOS-8242)", async () => {
        await renderPage();
        const actions = screen.getByTestId("sync-header-actions");
        expect(within(actions).getByTestId("header-actions-stub")).toBeInTheDocument();
        expect(within(actions).getByTestId("test-connection-stub")).toBeInTheDocument();
    });

    it("shows the coverage status label in the header, the label the coverage card shows (CHAOS-8265)", async () => {
        await renderPage();
        const badge = screen.getByTestId("sync-header-badge");
        expect(badge.textContent?.length).toBeGreaterThan(0);
        // Beside the name (the title adornment slot), not among the action buttons.
        expect(screen.getByTestId("page-header-title-adornment")).toContainElement(badge);
        expect(screen.getByTestId("sync-header-actions")).not.toContainElement(badge);
    });

    it("shows no status badge when the coverage cannot be read: missing is not a status", async () => {
        render(
            await SyncConfigDetailPage({
                params: Promise.resolve({ configId: "cfg-1" }),
                searchParams: Promise.resolve({ coverage_scenario: "unavailable" }),
            }),
        );
        expect(screen.queryByTestId("sync-header-badge")).not.toBeInTheDocument();
        expect(screen.queryByTestId("page-header-title-adornment")).not.toBeInTheDocument();
    });
});
