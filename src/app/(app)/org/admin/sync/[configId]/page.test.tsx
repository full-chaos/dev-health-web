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
    AdminHeader: ({ title, description }: { title: string; description?: string }) => (
        <header>
            <h1>{title}</h1>
            <p data-testid="header-description">{description}</p>
        </header>
    ),
}));
vi.mock("@/components/admin/sync/SyncProgressBar", () => ({ SyncProgressBar: () => null }));
vi.mock("@/components/admin/sync/BackfillOperations", () => ({ BackfillOperations: () => null }));
vi.mock("@/components/admin/sync/TestConnectionButton", () => ({
    TestConnectionButton: () => null,
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
            /^Provider: .+ · \d+ sync targets? · (Schedule: .+|Not scheduled)$/,
        );
    });

    it("draws Sync details and Job History as shared section cards with their titles", async () => {
        await renderPage();
        const details = screen.getByTestId("sync-details");
        expect(
            within(details).getByRole("heading", { level: 2, name: "Sync details" }),
        ).toBeVisible();
        const history = screen.getByTestId("sync-job-history");
        expect(
            within(history).getByRole("heading", { level: 2, name: "Job History" }),
        ).toBeVisible();
        expect(within(history).getByTestId("job-history-body")).toBeInTheDocument();
        // Sync details is no longer a collapsed <details>.
        expect(document.querySelector("details")).toBeNull();
    });
});
