import { act, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithToaster, userEvent } from "@/test/utils";
import type { IntegrationCredential } from "@/lib/admin/types";
import { PagerDutySetup } from "./PagerDutySetup";

const actions = vi.hoisted(() => ({
    connectPagerDutyApiToken: vi.fn(),
    connectPagerDutyClientCredentials: vi.fn(),
    startPagerDutyOAuth: vi.fn(),
    testConnection: vi.fn(),
    deleteCredential: vi.fn(),
}));
const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
vi.mock("@/lib/admin/server", () => ({
    connectPagerDutyApiToken: actions.connectPagerDutyApiToken,
    connectPagerDutyClientCredentials: actions.connectPagerDutyClientCredentials,
    startPagerDutyOAuth: actions.startPagerDutyOAuth,
    testConnection: actions.testConnection,
    deleteCredential: actions.deleteCredential,
}));

function makeCredential(overrides: Partial<IntegrationCredential> = {}): IntegrationCredential {
    return {
        id: "credential-production",
        provider: "pagerduty",
        name: "production",
        is_active: true,
        config: {},
        last_test_at: "2026-01-01T00:00:00Z",
        last_test_success: true,
        last_test_error: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        ...overrides,
    };
}

describe("PagerDutySetup", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        actions.startPagerDutyOAuth.mockResolvedValue({ data: { authorize_url: "/authorize" } });
        actions.connectPagerDutyApiToken.mockResolvedValue({
            data: {
                connected: true,
                credential_name: "production",
                auth_mode: "api_token",
                region: "us",
                subdomain: "acme",
            },
        });
        actions.connectPagerDutyClientCredentials.mockResolvedValue({
            data: {
                connected: true,
                credential_name: "production",
                auth_mode: "client_credentials",
                region: "us",
                subdomain: "acme",
            },
        });
    });

    it("renders existing PagerDuty credentials as inventory rows with real sync-config counts", () => {
        renderWithToaster(
            <PagerDutySetup
                canCreatePagerDuty
                credentials={[makeCredential()]}
                syncConfigs={[
                    { credential_id: "credential-production" },
                    { credential_id: "credential-production" },
                ]}
            />,
        );

        expect(screen.getByRole("region", { name: "PagerDuty credentials" })).toBeInTheDocument();
        expect(screen.getByText("production")).toBeInTheDocument();
        expect(screen.getByText("2")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Test" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Reconnect / rotate" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Create credential" })).toBeInTheDocument();
        expect(screen.queryByLabelText("Saved credentials")).not.toBeInTheDocument();
        expect(screen.queryByText("Datasets")).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Run preflight" })).not.toBeInTheDocument();
    });

    it("keeps feature-off PagerDuty rows cleanup-only", () => {
        renderWithToaster(
            <PagerDutySetup
                canCreatePagerDuty={false}
                credentials={[makeCredential()]}
                syncConfigs={[]}
            />,
        );

        expect(screen.getByText("New PagerDuty connections are unavailable")).toBeVisible();
        expect(screen.getByRole("button", { name: "Test" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Create credential" })).not.toBeInTheDocument();
        expect(
            screen.queryByRole("button", { name: "Reconnect / rotate" }),
        ).not.toBeInTheDocument();
    });

    it("opens a focused credential flow with OAuth, client credentials, and API-token fallback", async () => {
        const user = userEvent.setup();
        renderWithToaster(<PagerDutySetup canCreatePagerDuty credentials={[]} syncConfigs={[]} />);

        await user.click(screen.getByRole("button", { name: "Create credential" }));

        expect(screen.getByRole("button", { name: "OAuth (recommended)" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Client credentials" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Use API token instead" })).toBeInTheDocument();
        expect(screen.getByLabelText("Credential name")).toBeInTheDocument();
        expect(screen.queryByLabelText("Saved credentials")).not.toBeInTheDocument();
        expect(screen.queryByText("Datasets")).not.toBeInTheDocument();
    });

    it("keeps a failed manual save visible for retry", async () => {
        const user = userEvent.setup();
        actions.connectPagerDutyApiToken
            .mockResolvedValueOnce({ error: "Credential save failed." })
            .mockResolvedValueOnce({
                data: {
                    connected: true,
                    credential_name: "production",
                    auth_mode: "api_token",
                    region: "us",
                    subdomain: "acme",
                },
            });
        renderWithToaster(<PagerDutySetup canCreatePagerDuty credentials={[]} syncConfigs={[]} />);

        await user.click(screen.getByRole("button", { name: "Create credential" }));
        await user.click(screen.getByRole("button", { name: "Use API token instead" }));
        await user.type(screen.getByLabelText("Credential name"), "production");
        await user.type(screen.getByLabelText("Account subdomain"), "acme");
        await user.type(screen.getByLabelText("API token"), "token");
        await user.click(screen.getByRole("button", { name: "Save" }));

        expect(await screen.findByTestId("data-state-error")).toHaveTextContent(
            "Credential save failed.",
        );
        await user.click(screen.getByRole("button", { name: "Save" }));
        await waitFor(() => expect(navigation.push).toHaveBeenCalledOnce());
    });

    it("hands off a new manual credential to the fixed preselected sync-config route", async () => {
        const user = userEvent.setup();
        renderWithToaster(<PagerDutySetup canCreatePagerDuty credentials={[]} syncConfigs={[]} />);

        await user.click(screen.getByRole("button", { name: "Create credential" }));
        await user.click(screen.getByRole("button", { name: "Use API token instead" }));
        await user.type(screen.getByLabelText("Credential name"), "production");
        await user.type(screen.getByLabelText("Account subdomain"), "acme");
        await user.type(screen.getByLabelText("API token"), "token");
        await user.click(screen.getByRole("button", { name: "Save" }));

        await waitFor(() =>
            expect(navigation.push).toHaveBeenCalledWith(
                "/org/admin/sync/new?provider=pagerduty&credential_name=production",
            ),
        );
    });

    it("ignores a delayed manual save after the user starts a different credential", async () => {
        const user = userEvent.setup();
        let resolveSave: (value: {
            readonly data: {
                readonly connected: true;
                readonly credential_name: string;
                readonly auth_mode: "api_token";
                readonly region: "us";
                readonly subdomain: string;
            };
        }) => void = () => {};
        const delayedSave = new Promise<{
            readonly data: {
                readonly connected: true;
                readonly credential_name: string;
                readonly auth_mode: "api_token";
                readonly region: "us";
                readonly subdomain: string;
            };
        }>((resolve) => {
            resolveSave = resolve;
        });
        actions.connectPagerDutyApiToken.mockReturnValueOnce(delayedSave);
        renderWithToaster(<PagerDutySetup canCreatePagerDuty credentials={[]} syncConfigs={[]} />);

        await user.click(screen.getByRole("button", { name: "Create credential" }));
        await user.click(screen.getByRole("button", { name: "Use API token instead" }));
        await user.type(screen.getByLabelText("Credential name"), "production");
        await user.type(screen.getByLabelText("Account subdomain"), "acme");
        await user.type(screen.getByLabelText("API token"), "token");
        await user.click(screen.getByRole("button", { name: "Save" }));
        await user.clear(screen.getByLabelText("Credential name"));
        await user.type(screen.getByLabelText("Credential name"), "staging");

        await act(async () => {
            resolveSave({
                data: {
                    connected: true,
                    credential_name: "production",
                    auth_mode: "api_token",
                    region: "us",
                    subdomain: "acme",
                },
            });
            await delayedSave;
        });

        expect(navigation.push).not.toHaveBeenCalled();
    });
});
