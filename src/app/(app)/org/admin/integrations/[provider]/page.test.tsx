import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@/test/utils";

import {
    getCustomerPushIngestEntitlement,
    listCredentials,
    listCustomerPushSources,
    listSyncConfigs,
} from "@/lib/admin/server";
import type { CustomerPushSource, IntegrationCredential } from "@/lib/admin/types";

const mockGetCanonicalIncidentIngestionEntitlement = vi.hoisted(() => vi.fn());

vi.mock("@/lib/admin/server", () => ({
    getCanonicalIncidentIngestionEntitlement: mockGetCanonicalIncidentIngestionEntitlement,
    getCustomerPushIngestEntitlement: vi.fn(),
    listCredentials: vi.fn(),
    listCustomerPushSources: vi.fn(),
    listSyncConfigs: vi.fn(),
}));

vi.mock("@/components/admin/integrations/ProviderCredentialsList", () => ({
    ProviderCredentialsList: () => <div data-testid="provider-credentials-list" />,
}));

vi.mock("@/components/admin/integrations/PagerDutySetup", () => ({
    PagerDutySetup: ({
        canCreatePagerDuty,
        credentials,
    }: {
        canCreatePagerDuty: boolean;
        credentials: readonly IntegrationCredential[];
    }) => (
        <div data-can-create={String(canCreatePagerDuty)} data-testid="pagerduty-setup">
            {credentials.map((credential) => credential.name).join(", ")}
        </div>
    ),
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

function makePagerDutyCredential(): IntegrationCredential {
    return {
        id: "cred-pagerduty",
        provider: "pagerduty",
        name: "production",
        is_active: true,
        config: {},
        last_test_at: null,
        last_test_success: null,
        last_test_error: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
    };
}

function makeCustomerPushSource(): CustomerPushSource {
    return {
        id: "src-1",
        org_id: "org-1",
        system: "github",
        instance: "acme/api",
        display_name: "Acme API",
        mode: "customer_push",
        enabled: true,
        webhook_mode: "disabled",
        matched_integration_source_id: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        warnings: [],
    };
}

describe("IntegrationPage ([provider]) — CHAOS-2837 blocker 3", () => {
    beforeEach(() => {
        mockGetCanonicalIncidentIngestionEntitlement.mockReset();
        mockGetCanonicalIncidentIngestionEntitlement.mockResolvedValue({
            data: { enabled: false },
        });
        vi.mocked(getCustomerPushIngestEntitlement).mockResolvedValue({
            data: {
                tier: "team",
                features: { customer_push_ingest: false },
                enabled: false,
            },
        });
        vi.mocked(listCustomerPushSources).mockResolvedValue({ data: [] });
    });

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

    it("renders the dedicated PagerDuty setup instead of the generic credential wizard", async () => {
        vi.mocked(listCredentials).mockResolvedValue({ data: [makePagerDutyCredential()] });
        vi.mocked(listSyncConfigs).mockResolvedValue({ data: [] });

        render(
            await IntegrationPage({
                params: Promise.resolve({ provider: "pagerduty" }),
                searchParams: Promise.resolve({}),
            }),
        );

        expect(screen.getByTestId("pagerduty-setup")).toBeInTheDocument();
        expect(screen.getByTestId("pagerduty-setup")).toHaveTextContent("production");
        expect(screen.queryByTestId("provider-credentials-list")).not.toBeInTheDocument();
    });

    it("fails closed for a direct PagerDuty route when an older Ops response has no entitlement", async () => {
        mockGetCanonicalIncidentIngestionEntitlement.mockResolvedValue({
            error: "Feature metadata unavailable",
        });
        vi.mocked(listCredentials).mockResolvedValue({ data: [makePagerDutyCredential()] });
        vi.mocked(listSyncConfigs).mockResolvedValue({ data: [] });

        render(
            await IntegrationPage({
                params: Promise.resolve({ provider: "pagerduty" }),
                searchParams: Promise.resolve({}),
            }),
        );

        expect(mockGetCanonicalIncidentIngestionEntitlement).toHaveBeenCalledOnce();
        expect(screen.getByTestId("pagerduty-setup")).toHaveAttribute("data-can-create", "false");
        expect(screen.getByTestId("pagerduty-setup")).toHaveTextContent("production");
    });

    it("keeps a direct PagerDuty route manage-only when the entitlement is false", async () => {
        mockGetCanonicalIncidentIngestionEntitlement.mockResolvedValue({
            data: { enabled: false },
        });
        vi.mocked(listCredentials).mockResolvedValue({ data: [makePagerDutyCredential()] });
        vi.mocked(listSyncConfigs).mockResolvedValue({ data: [] });

        render(
            await IntegrationPage({
                params: Promise.resolve({ provider: "pagerduty" }),
                searchParams: Promise.resolve({}),
            }),
        );

        expect(screen.getByTestId("pagerduty-setup")).toHaveAttribute("data-can-create", "false");
    });

    it("allows direct PagerDuty setup only for an explicit true entitlement", async () => {
        mockGetCanonicalIncidentIngestionEntitlement.mockResolvedValue({
            data: { enabled: true },
        });
        vi.mocked(listCredentials).mockResolvedValue({ data: [] });
        vi.mocked(listSyncConfigs).mockResolvedValue({ data: [] });

        render(
            await IntegrationPage({
                params: Promise.resolve({ provider: "pagerduty" }),
                searchParams: Promise.resolve({}),
            }),
        );

        expect(screen.getByTestId("pagerduty-setup")).toHaveAttribute("data-can-create", "true");
    });

    it("locks customer-push mode and skips source loading when customer_push_ingest is disabled", async () => {
        vi.mocked(listCredentials).mockResolvedValue({ data: [] });
        vi.mocked(listSyncConfigs).mockResolvedValue({ data: [] });

        render(
            await IntegrationPage({
                params: Promise.resolve({ provider: "github" }),
                searchParams: Promise.resolve({}),
            }),
        );

        expect(listCustomerPushSources).not.toHaveBeenCalled();
        expect(screen.getByRole("heading", { name: "Feature unavailable" })).toBeInTheDocument();
        expect(
            screen.getByText(
                "Contact an administrator to enable customer push ingest for this plan.",
            ),
        ).toBeInTheDocument();
    });

    it("renders customer-push sources when customer_push_ingest is enabled", async () => {
        vi.mocked(listCredentials).mockResolvedValue({ data: [] });
        vi.mocked(listSyncConfigs).mockResolvedValue({ data: [] });
        vi.mocked(getCustomerPushIngestEntitlement).mockResolvedValue({
            data: {
                tier: "team",
                features: { customer_push_ingest: true },
                enabled: true,
            },
        });
        vi.mocked(listCustomerPushSources).mockResolvedValue({ data: [makeCustomerPushSource()] });

        render(
            await IntegrationPage({
                params: Promise.resolve({ provider: "github" }),
                searchParams: Promise.resolve({}),
            }),
        );

        expect(listCustomerPushSources).toHaveBeenCalledWith("github");
        expect(screen.getByText("Acme API")).toBeInTheDocument();
    });
});
