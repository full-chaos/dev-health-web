import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IntegrationCredential } from "@/lib/admin/types";
import { PagerDutySetup } from "./PagerDutySetup";

const actions = vi.hoisted(() => ({
    connectPagerDutyApiToken: vi.fn(),
    connectPagerDutyClientCredentials: vi.fn(),
    disconnectPagerDuty: vi.fn(),
    getPagerDutyStatus: vi.fn(),
    preflightPagerDuty: vi.fn(),
    startPagerDutyOAuth: vi.fn(),
}));

vi.mock("@/lib/admin/server", () => ({
    connectPagerDutyApiToken: actions.connectPagerDutyApiToken,
    connectPagerDutyClientCredentials: actions.connectPagerDutyClientCredentials,
    disconnectPagerDuty: actions.disconnectPagerDuty,
    getPagerDutyStatus: actions.getPagerDutyStatus,
    preflightPagerDuty: actions.preflightPagerDuty,
    startPagerDutyOAuth: actions.startPagerDutyOAuth,
}));

vi.mock("sonner", () => ({
    toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), warning: vi.fn() }),
}));

const disconnectedStatus = {
    connected: false,
    credential_name: "default",
    auth_mode: null,
    region: null,
    subdomain: null,
    account_id: null,
    account_display: null,
    granted_scopes: [],
    expires_at: null,
    has_refresh_token: false,
};

const connectedStatus = {
    ...disconnectedStatus,
    connected: true,
    credential_name: "production",
    auth_mode: "client_credentials" as const,
    subdomain: "acme",
    region: "us" as const,
    account_display: "Acme PagerDuty",
};

function makePagerDutyCredential(name: string): IntegrationCredential {
    return {
        id: `credential-${name}`,
        provider: "pagerduty",
        name,
        is_active: true,
        config: {},
        last_test_at: null,
        last_test_success: null,
        last_test_error: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
    };
}

describe("PagerDutySetup", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        actions.getPagerDutyStatus.mockResolvedValue({ data: disconnectedStatus });
        actions.connectPagerDutyClientCredentials.mockResolvedValue({ data: disconnectedStatus });
        actions.connectPagerDutyApiToken.mockResolvedValue({ data: disconnectedStatus });
        actions.startPagerDutyOAuth.mockResolvedValue({ data: { authorize_url: "/authorize" } });
    });

    it("offers persisted credentials for selection while keeping a custom credential name editable", async () => {
        const user = userEvent.setup();
        render(
            <PagerDutySetup
                canCreatePagerDuty
                credentials={[
                    makePagerDutyCredential("production"),
                    makePagerDutyCredential("staging"),
                ]}
            />,
        );

        const credentialName = screen.getByLabelText("Credential name");
        const savedCredentials = screen.getByLabelText("Saved credentials");
        expect(savedCredentials).toHaveTextContent("production");
        expect(savedCredentials).toHaveTextContent("staging");

        await user.selectOptions(savedCredentials, "production");
        expect(credentialName).toHaveValue("production");

        await user.clear(credentialName);
        await user.type(credentialName, "sandbox");
        expect(credentialName).toHaveValue("sandbox");
        expect(savedCredentials).toHaveValue("__custom__");

        await user.selectOptions(savedCredentials, "production");
        await user.click(screen.getByRole("button", { name: "Check connection status" }));
        await waitFor(() =>
            expect(actions.getPagerDutyStatus).toHaveBeenLastCalledWith("production"),
        );

        await user.selectOptions(savedCredentials, "__custom__");
        expect(savedCredentials).toHaveValue("__custom__");
        expect(credentialName).toHaveValue("");
    });

    it("checks the named connection status", async () => {
        const user = userEvent.setup();
        render(<PagerDutySetup canCreatePagerDuty />);

        await user.click(screen.getByRole("button", { name: "Check connection status" }));

        await waitFor(() => expect(actions.getPagerDutyStatus).toHaveBeenCalledWith("default"));
        expect(screen.getByRole("status")).toHaveTextContent("Not connected");
    });

    it("keeps an existing connection manageable while blocking new PagerDuty setup", async () => {
        const user = userEvent.setup();
        actions.getPagerDutyStatus.mockResolvedValue({ data: connectedStatus });
        render(
            <PagerDutySetup
                canCreatePagerDuty={false}
                credentials={[makePagerDutyCredential("production")]}
            />,
        );

        expect(screen.getByText("PagerDuty setup is unavailable")).toBeVisible();
        expect(screen.queryByRole("button", { name: "Connect PagerDuty" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Create credential" })).not.toBeInTheDocument();

        await user.selectOptions(screen.getByLabelText("Saved credentials"), "production");
        await user.click(screen.getByRole("button", { name: "Check connection status" }));

        expect(await screen.findByRole("button", { name: "Disconnect" })).toBeVisible();
        expect(
            screen.queryByRole("link", { name: "Create sync configuration" }),
        ).not.toBeInTheDocument();
    });

    it("shows only the unavailable state when no PagerDuty credential exists", () => {
        render(<PagerDutySetup canCreatePagerDuty={false} />);

        expect(screen.getByText("PagerDuty setup is unavailable")).toBeVisible();
        expect(screen.queryByLabelText("Saved credentials")).not.toBeInTheDocument();
        expect(
            screen.queryByRole("button", { name: "Check connection status" }),
        ).not.toBeInTheDocument();
    });

    it("keeps a failed OAuth start visible with a retry action", async () => {
        const user = userEvent.setup();
        actions.startPagerDutyOAuth.mockResolvedValue({ error: "PagerDuty authorization failed." });
        render(<PagerDutySetup canCreatePagerDuty />);

        await user.type(screen.getByLabelText("Account subdomain"), "acme");
        await user.click(screen.getByRole("button", { name: "Connect PagerDuty" }));

        expect(
            await screen.findByRole("heading", {
                name: "Could not start PagerDuty authorization",
            }),
        ).toBeVisible();
        expect(screen.getByText("PagerDuty authorization failed.")).toBeVisible();
        expect(screen.getByRole("button", { name: "Retry authorization" })).toBeVisible();
    });

    it("keeps a failed manual credential save visible with a retry action", async () => {
        const user = userEvent.setup();
        actions.connectPagerDutyApiToken.mockResolvedValue({ error: "Credential save failed." });
        render(<PagerDutySetup canCreatePagerDuty />);

        await user.click(screen.getByRole("button", { name: "Use API token instead" }));
        await user.type(screen.getByLabelText("Account subdomain"), "acme");
        await user.type(screen.getByLabelText("API token"), "token");
        await user.click(screen.getByRole("button", { name: "Create credential" }));

        expect(
            await screen.findByRole("heading", { name: "Could not save PagerDuty credential" }),
        ).toBeVisible();
        expect(screen.getByText("Credential save failed.")).toBeVisible();
        expect(screen.getByRole("button", { name: "Retry credential save" })).toBeVisible();
    });

    it("marks the selected authentication method with visible text as well as aria-pressed", async () => {
        const user = userEvent.setup();
        render(<PagerDutySetup canCreatePagerDuty />);

        const oauth = screen.getByRole("button", { name: "OAuth (recommended)" });
        expect(oauth).toHaveAttribute("aria-pressed", "true");
        expect(oauth).toHaveTextContent("Selected");

        await user.click(screen.getByRole("button", { name: "Client credentials" }));
        expect(oauth).toHaveAttribute("aria-pressed", "false");
        expect(screen.getByRole("button", { name: "Client credentials" })).toHaveTextContent(
            "Selected",
        );
        expect(screen.getByRole("button", { name: "Create credential" })).toHaveClass(
            "text-(--accent-foreground)",
        );
    });

    it("shows connected credential metadata and links to the supported sync configuration route", async () => {
        const user = userEvent.setup();
        actions.getPagerDutyStatus.mockResolvedValue({
            data: {
                ...connectedStatus,
                account_id: "PABC123",
                granted_scopes: ["incidents.read", "users.read"],
                expires_at: "2027-01-01T00:00:00Z",
                has_refresh_token: true,
            },
        });
        render(<PagerDutySetup canCreatePagerDuty />);

        await user.click(screen.getByRole("button", { name: "Check connection status" }));

        const status = screen.getByRole("status");
        await waitFor(() => expect(status).toHaveTextContent("Acme PagerDuty"));
        expect(status).toHaveTextContent("Authentication method");
        expect(status).toHaveTextContent("Client credentials");
        expect(status).toHaveTextContent("Region");
        expect(status).toHaveTextContent("US");
        expect(status).toHaveTextContent("Account");
        expect(status).toHaveTextContent("Acme PagerDuty");
        expect(status).not.toHaveTextContent("PABC123");
        expect(status).toHaveTextContent("Granted scopes");
        expect(status).toHaveTextContent("incidents.read, users.read");
        expect(status).toHaveTextContent("Credential expiry");
        expect(status).toHaveTextContent("Expires");
        expect(status).toHaveTextContent("Refresh token available");
        expect(screen.getByRole("link", { name: "Create sync configuration" })).toHaveAttribute(
            "href",
            "/org/admin/sync/new",
        );
    });

    it("uses an explicit caution treatment when the connected credential has expired", async () => {
        const user = userEvent.setup();
        actions.getPagerDutyStatus.mockResolvedValue({
            data: { ...connectedStatus, expires_at: "2020-01-01T00:00:00Z" },
        });
        render(<PagerDutySetup canCreatePagerDuty />);

        await user.click(screen.getByRole("button", { name: "Check connection status" }));

        const expiry = await screen.findByText(/Expired — reconnect or renew/);
        expect(expiry).toHaveClass("text-(--caution)");
    });

    it("clears connected controls when returning to a custom credential name", async () => {
        const user = userEvent.setup();
        actions.getPagerDutyStatus.mockResolvedValue({ data: connectedStatus });
        render(
            <PagerDutySetup
                canCreatePagerDuty
                credentials={[makePagerDutyCredential("production")]}
            />,
        );

        const savedCredentials = screen.getByLabelText("Saved credentials");
        await user.selectOptions(savedCredentials, "production");
        await user.click(screen.getByRole("button", { name: "Check connection status" }));
        await waitFor(() =>
            expect(screen.getByRole("link", { name: "Create sync configuration" })).toBeVisible(),
        );

        await user.selectOptions(savedCredentials, "__custom__");

        expect(screen.getByLabelText("Credential name")).toHaveValue("");
        expect(screen.queryByRole("status")).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Run preflight" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Disconnect" })).not.toBeInTheDocument();
    });

    it("refreshes canonical status after saving client credentials", async () => {
        const user = userEvent.setup();
        actions.getPagerDutyStatus.mockResolvedValue({ data: connectedStatus });
        render(<PagerDutySetup canCreatePagerDuty />);

        await user.click(screen.getByRole("button", { name: "Client credentials" }));
        await user.clear(screen.getByLabelText("Credential name"));
        await user.type(screen.getByLabelText("Credential name"), "production");
        await user.type(screen.getByLabelText("Account subdomain"), "acme");
        await user.type(screen.getByLabelText("Client ID"), "client-id");
        await user.type(screen.getByLabelText("Client secret"), "secret");
        await user.click(screen.getByRole("button", { name: "Create credential" }));

        await waitFor(() =>
            expect(actions.connectPagerDutyClientCredentials).toHaveBeenCalledWith({
                credentialName: "production",
                clientId: "client-id",
                clientSecret: "secret",
                region: "us",
                subdomain: "acme",
            }),
        );
        await waitFor(() => expect(actions.getPagerDutyStatus).toHaveBeenCalledWith("production"));

        expect(screen.getByRole("status")).toHaveTextContent("Acme PagerDuty");
        expect(screen.getByRole("button", { name: "Run preflight" })).toBeVisible();
        expect(screen.getByRole("button", { name: "Disconnect" })).toBeVisible();
        expect(screen.getByLabelText("Client secret")).toHaveValue("");
        expect(toast.success).toHaveBeenCalledWith("PagerDuty credential saved.");
    });

    it("refreshes canonical status after saving an API token", async () => {
        const user = userEvent.setup();
        actions.getPagerDutyStatus.mockResolvedValue({
            data: { ...connectedStatus, auth_mode: "api_token" as const },
        });
        render(<PagerDutySetup canCreatePagerDuty />);

        await user.click(screen.getByRole("button", { name: "Use API token instead" }));
        await user.clear(screen.getByLabelText("Credential name"));
        await user.type(screen.getByLabelText("Credential name"), "production");
        await user.type(screen.getByLabelText("Account subdomain"), "acme");
        await user.type(screen.getByLabelText("API token"), "token");
        await user.click(screen.getByRole("button", { name: "Create credential" }));

        await waitFor(() =>
            expect(actions.connectPagerDutyApiToken).toHaveBeenCalledWith({
                credentialName: "production",
                apiToken: "token",
                region: "us",
                subdomain: "acme",
            }),
        );
        await waitFor(() => expect(actions.getPagerDutyStatus).toHaveBeenCalledWith("production"));

        expect(screen.getByRole("status")).toHaveTextContent("Acme PagerDuty");
        expect(screen.getByRole("button", { name: "Run preflight" })).toBeVisible();
        expect(screen.getByRole("button", { name: "Disconnect" })).toBeVisible();
        expect(screen.getByLabelText("API token")).toHaveValue("");
    });

    it("does not claim a manual credential is connected when the status refresh fails", async () => {
        const user = userEvent.setup();
        actions.getPagerDutyStatus.mockResolvedValue({ error: "PagerDuty status is unavailable." });
        render(<PagerDutySetup canCreatePagerDuty />);

        await user.click(screen.getByRole("button", { name: "Use API token instead" }));
        await user.clear(screen.getByLabelText("Credential name"));
        await user.type(screen.getByLabelText("Credential name"), "production");
        await user.type(screen.getByLabelText("Account subdomain"), "acme");
        await user.type(screen.getByLabelText("API token"), "token");
        await user.click(screen.getByRole("button", { name: "Create credential" }));

        await waitFor(() => expect(actions.getPagerDutyStatus).toHaveBeenCalledWith("production"));
        expect(toast.error).toHaveBeenCalledWith("PagerDuty status is unavailable.");
        expect(screen.getByText("PagerDuty status is unavailable.")).toBeVisible();
        expect(screen.getByRole("button", { name: "Retry status check" })).toBeVisible();
        expect(screen.queryByRole("button", { name: "Run preflight" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Disconnect" })).not.toBeInTheDocument();
    });

    it("keeps a failed disconnect visible with a retry action", async () => {
        const user = userEvent.setup();
        actions.getPagerDutyStatus.mockResolvedValue({ data: connectedStatus });
        actions.disconnectPagerDuty.mockResolvedValue({ error: "Disconnect failed" });
        render(<PagerDutySetup canCreatePagerDuty />);

        await user.click(screen.getByRole("button", { name: "Check connection status" }));
        await waitFor(() =>
            expect(screen.getByRole("button", { name: "Disconnect" })).toBeVisible(),
        );
        await user.click(screen.getByRole("button", { name: "Disconnect" }));

        expect(await screen.findByText("Disconnect failed")).toBeVisible();
        expect(screen.getByRole("button", { name: "Retry disconnect" })).toBeVisible();
        expect(screen.getByRole("button", { name: "Run preflight" })).toBeVisible();
    });

    it("keeps a newer saved credential selected when a delayed client-credentials save settles", async () => {
        const user = userEvent.setup();
        let resolveSave!: (value: { readonly data: typeof disconnectedStatus }) => void;
        const pendingSave = new Promise<{ readonly data: typeof disconnectedStatus }>((resolve) => {
            resolveSave = resolve;
        });
        actions.connectPagerDutyClientCredentials.mockReturnValueOnce(pendingSave);
        actions.getPagerDutyStatus.mockResolvedValue({ data: connectedStatus });
        render(
            <PagerDutySetup
                canCreatePagerDuty
                credentials={[
                    makePagerDutyCredential("production"),
                    makePagerDutyCredential("staging"),
                ]}
            />,
        );

        await user.click(screen.getByRole("button", { name: "Client credentials" }));
        await user.clear(screen.getByLabelText("Credential name"));
        await user.type(screen.getByLabelText("Credential name"), "production");
        await user.type(screen.getByLabelText("Account subdomain"), "acme");
        await user.type(screen.getByLabelText("Client ID"), "client-id");
        await user.type(screen.getByLabelText("Client secret"), "secret");
        await user.click(screen.getByRole("button", { name: "Create credential" }));
        await waitFor(() =>
            expect(actions.connectPagerDutyClientCredentials).toHaveBeenCalledOnce(),
        );

        await user.selectOptions(screen.getByLabelText("Saved credentials"), "staging");
        expect(screen.getByLabelText("Credential name")).toHaveValue("staging");

        await act(async () => {
            resolveSave({ data: disconnectedStatus });
            await pendingSave;
        });

        expect(actions.getPagerDutyStatus).not.toHaveBeenCalled();
        expect(screen.queryByRole("status")).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Run preflight" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Disconnect" })).not.toBeInTheDocument();
    });

    it("keeps a newer custom credential name when a delayed API token save settles", async () => {
        const user = userEvent.setup();
        let resolveSave!: (value: { readonly data: typeof disconnectedStatus }) => void;
        const pendingSave = new Promise<{ readonly data: typeof disconnectedStatus }>((resolve) => {
            resolveSave = resolve;
        });
        actions.connectPagerDutyApiToken.mockReturnValueOnce(pendingSave);
        actions.getPagerDutyStatus.mockResolvedValue({ data: connectedStatus });
        render(
            <PagerDutySetup
                canCreatePagerDuty
                credentials={[makePagerDutyCredential("production")]}
            />,
        );

        await user.click(screen.getByRole("button", { name: "Use API token instead" }));
        await user.clear(screen.getByLabelText("Credential name"));
        await user.type(screen.getByLabelText("Credential name"), "production");
        await user.type(screen.getByLabelText("Account subdomain"), "acme");
        await user.type(screen.getByLabelText("API token"), "token");
        await user.click(screen.getByRole("button", { name: "Create credential" }));
        await waitFor(() => expect(actions.connectPagerDutyApiToken).toHaveBeenCalledOnce());

        await user.selectOptions(screen.getByLabelText("Saved credentials"), "__custom__");
        await user.type(screen.getByLabelText("Credential name"), "sandbox");
        expect(screen.getByLabelText("Credential name")).toHaveValue("sandbox");

        await act(async () => {
            resolveSave({ data: disconnectedStatus });
            await pendingSave;
        });

        expect(actions.getPagerDutyStatus).not.toHaveBeenCalled();
        expect(screen.queryByRole("status")).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Run preflight" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Disconnect" })).not.toBeInTheDocument();
    });

    it("clears a renamed status and ignores a late response for the prior credential", async () => {
        const user = userEvent.setup();
        let resolveStatus!: (value: { data: typeof connectedStatus }) => void;
        const pendingStatus = new Promise<{ data: typeof connectedStatus }>((resolve) => {
            resolveStatus = resolve;
        });
        actions.getPagerDutyStatus
            .mockResolvedValueOnce({ data: connectedStatus })
            .mockReturnValueOnce(pendingStatus)
            .mockResolvedValueOnce({
                data: {
                    ...connectedStatus,
                    credential_name: "staging",
                    account_display: "Staging PagerDuty",
                },
            });
        render(<PagerDutySetup canCreatePagerDuty />);

        await user.clear(screen.getByLabelText("Credential name"));
        await user.type(screen.getByLabelText("Credential name"), "production");
        await user.click(screen.getByRole("button", { name: "Check connection status" }));
        await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Acme PagerDuty"));

        await user.click(screen.getByRole("button", { name: "Check connection status" }));
        await waitFor(() =>
            expect(actions.getPagerDutyStatus).toHaveBeenLastCalledWith("production"),
        );
        await user.clear(screen.getByLabelText("Credential name"));
        await user.type(screen.getByLabelText("Credential name"), "staging");

        expect(screen.queryByRole("status")).not.toBeInTheDocument();
        await act(async () => {
            resolveStatus({ data: connectedStatus });
            await pendingStatus;
        });
        expect(screen.queryByRole("status")).not.toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Check connection status" }));
        await waitFor(() => expect(actions.getPagerDutyStatus).toHaveBeenLastCalledWith("staging"));
        expect(screen.getByRole("status")).toHaveTextContent("Staging PagerDuty");
    });

    it("uses the canonical status credential for preflight and disconnect", async () => {
        const user = userEvent.setup();
        actions.getPagerDutyStatus.mockResolvedValue({
            data: { ...connectedStatus, credential_name: "canonical-production" },
        });
        actions.preflightPagerDuty.mockResolvedValue({ data: { datasets: [] } });
        actions.disconnectPagerDuty.mockResolvedValue({ data: undefined });
        render(<PagerDutySetup canCreatePagerDuty />);

        await user.clear(screen.getByLabelText("Credential name"));
        await user.type(screen.getByLabelText("Credential name"), "production");
        await user.click(screen.getByRole("button", { name: "Check connection status" }));
        await waitFor(() =>
            expect(screen.getByRole("button", { name: "Run preflight" })).toBeVisible(),
        );

        await user.click(screen.getByRole("button", { name: "Run preflight" }));
        await waitFor(() =>
            expect(actions.preflightPagerDuty).toHaveBeenCalledWith("canonical-production", [
                "services",
                "incidents",
            ]),
        );

        await user.click(screen.getByRole("button", { name: "Disconnect" }));
        await waitFor(() =>
            expect(actions.disconnectPagerDuty).toHaveBeenCalledWith("canonical-production"),
        );
    });
});
