import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@/test/utils";

import { listCredentials, listSyncConfigs } from "@/lib/admin/server";
import type { IntegrationCredential } from "@/lib/admin/types";

vi.mock("@/lib/admin/server", () => ({
    listCredentials: vi.fn(),
    listSyncConfigs: vi.fn(),
}));

vi.mock("@/components/admin/integrations/ProviderCredentialsList", () => ({
    ProviderCredentialsList: () => <div data-testid="provider-credentials-list" />,
}));

import IntegrationPage from "./page";

function makeGitHubAppCredential(): IntegrationCredential {
    return {
        id: "cred-app",
        provider: "github",
        name: "github-app",
        is_active: true,
        config: { auth_mode: "github_app" },
        last_test_at: null,
        last_test_success: null,
        last_test_error: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
    };
}

describe("IntegrationPage ([provider]) — CHAOS-2837 blocker 3", () => {
    it("never renders a standalone install-card CTA, even with zero credentials and no callback result", async () => {
        vi.mocked(listCredentials).mockResolvedValue({ data: [] });
        vi.mocked(listSyncConfigs).mockResolvedValue({ data: [] });

        render(
            await IntegrationPage({
                params: Promise.resolve({ provider: "github" }),
                searchParams: Promise.resolve({}),
            }),
        );

        expect(screen.queryByRole("link", { name: "Connect GitHub App" })).not.toBeInTheDocument();
        expect(screen.queryByRole("status")).not.toBeInTheDocument();
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("never renders a standalone install-card CTA even when a GitHub App is already connected", async () => {
        vi.mocked(listCredentials).mockResolvedValue({ data: [makeGitHubAppCredential()] });
        vi.mocked(listSyncConfigs).mockResolvedValue({ data: [] });

        render(
            await IntegrationPage({
                params: Promise.resolve({ provider: "github" }),
                searchParams: Promise.resolve({}),
            }),
        );

        expect(screen.queryByRole("link", { name: "Connect GitHub App" })).not.toBeInTheDocument();
    });

    it("renders only a banner (no CTA) for a connected install-callback result", async () => {
        vi.mocked(listCredentials).mockResolvedValue({ data: [] });
        vi.mocked(listSyncConfigs).mockResolvedValue({ data: [] });

        render(
            await IntegrationPage({
                params: Promise.resolve({ provider: "github" }),
                searchParams: Promise.resolve({ github_app: "connected" }),
            }),
        );

        expect(screen.getByRole("status")).toHaveTextContent(/GitHub App connected/i);
        expect(screen.queryByRole("link", { name: "Connect GitHub App" })).not.toBeInTheDocument();
    });

    it("renders only a banner (no CTA) for an error install-callback result", async () => {
        vi.mocked(listCredentials).mockResolvedValue({ data: [] });
        vi.mocked(listSyncConfigs).mockResolvedValue({ data: [] });

        render(
            await IntegrationPage({
                params: Promise.resolve({ provider: "github" }),
                searchParams: Promise.resolve({ github_app: "error" }),
            }),
        );

        expect(screen.getByRole("alert")).toHaveTextContent(/couldn.t connect the GitHub App/i);
        expect(screen.queryByRole("link", { name: "Connect GitHub App" })).not.toBeInTheDocument();
    });

    it("renders no GitHub-App banner at all for a non-github provider", async () => {
        vi.mocked(listCredentials).mockResolvedValue({ data: [] });
        vi.mocked(listSyncConfigs).mockResolvedValue({ data: [] });

        render(
            await IntegrationPage({
                params: Promise.resolve({ provider: "linear" }),
                searchParams: Promise.resolve({}),
            }),
        );

        expect(screen.queryByRole("status")).not.toBeInTheDocument();
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        expect(screen.getByTestId("provider-credentials-list")).toBeInTheDocument();
    });
});
