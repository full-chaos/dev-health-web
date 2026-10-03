import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@/test/utils";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn() }),
    usePathname: () => "/org/admin/integrations",
    useSearchParams: () => new URLSearchParams(),
}));

const listCredentials = vi.fn();
vi.mock("@/lib/admin/server", () => ({
    listCredentials: () => listCredentials(),
    listSyncConfigs: vi.fn(async () => ({ data: [] })),
    getCanonicalIncidentIngestionEntitlement: vi.fn(async () => ({ data: { enabled: false } })),
    testConnection: vi.fn(),
    createCredential: vi.fn(),
}));

import IntegrationsPage from "./page";

beforeEach(() => listCredentials.mockReset());

describe("IntegrationsPage (CHAOS-8099)", () => {
    it("says one plain sentence with Retry and never prints the backend text", async () => {
        listCredentials.mockResolvedValue({
            data: null,
            error: "GET /api/v1/admin/credentials 502 upstream connect error",
        });

        const { container } = render(await IntegrationsPage());

        const notice = screen
            .getByText("Providers could not be loaded. Retry, or check again in a moment.")
            .closest("[data-notice-variant]");
        expect(notice).toHaveAttribute("data-notice-variant", "danger");
        expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
        expect(container.textContent).not.toContain("502");
        expect(container.textContent).not.toContain("/api/v1");
    });

    it("shows no notice when the credentials loaded", async () => {
        listCredentials.mockResolvedValue({ data: [] });

        render(await IntegrationsPage());

        expect(screen.queryByText(/could not be loaded/)).toBeNull();
        expect(screen.getByRole("heading", { level: 1, name: "Connections" })).toBeInTheDocument();
    });

    it("has Add Provider in the page header, with the icon before the label", async () => {
        listCredentials.mockResolvedValue({ data: [] });

        render(await IntegrationsPage());

        const add = within(screen.getByTestId("page-header")).getByRole("button", {
            name: "Add Provider",
        });
        expect(add.firstElementChild?.querySelector("svg") ?? null).not.toBeNull();
    });
});
