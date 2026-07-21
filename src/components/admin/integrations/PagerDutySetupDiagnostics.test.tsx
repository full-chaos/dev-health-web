import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PagerDutySetup } from "./PagerDutySetup";

const actions = vi.hoisted(() => ({
    getPagerDutyStatus: vi.fn(),
    preflightPagerDuty: vi.fn(),
}));

vi.mock("@/lib/admin/server", () => ({
    connectPagerDutyApiToken: vi.fn(),
    connectPagerDutyClientCredentials: vi.fn(),
    disconnectPagerDuty: vi.fn(),
    getPagerDutyStatus: actions.getPagerDutyStatus,
    preflightPagerDuty: actions.preflightPagerDuty,
    startPagerDutyOAuth: vi.fn(),
}));

vi.mock("sonner", () => ({
    toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), warning: vi.fn() }),
}));

const connectedStatus = {
    connected: true,
    credential_name: "production",
    auth_mode: "oauth",
    region: "us",
    subdomain: "acme",
    account_id: "account-1",
    account_display: "Acme PagerDuty",
    granted_scopes: ["Services.read"],
    expires_at: null,
    has_refresh_token: false,
} as const;

const readyPreflight = {
    connected: true,
    credential_name: "production",
    datasets: [
        {
            requested: "services",
            required_scopes: ["Services.read"],
            granted: true,
            missing: [],
        },
    ],
} as const;

async function loadConnectedStatus(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await user.click(screen.getByRole("button", { name: "Check connection status" }));
    await waitFor(() =>
        expect(screen.getByRole("button", { name: "Run preflight" })).toBeVisible(),
    );
}

async function renderPreflight(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await user.click(screen.getByRole("button", { name: "Run preflight" }));
    await waitFor(() =>
        expect(screen.getByRole("heading", { name: "Permission checks" })).toBeVisible(),
    );
}

describe("PagerDutySetup diagnostics", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        actions.getPagerDutyStatus.mockResolvedValue({ data: connectedStatus });
        actions.preflightPagerDuty.mockResolvedValue({ data: readyPreflight });
    });

    it("renders the reported expiry and refresh availability for a connected credential", async () => {
        const user = userEvent.setup();
        actions.getPagerDutyStatus.mockResolvedValue({
            data: {
                ...connectedStatus,
                expires_at: "2099-01-02T03:04:05Z",
                has_refresh_token: true,
            },
        });
        render(<PagerDutySetup canCreatePagerDuty />);

        await loadConnectedStatus(user);

        expect(screen.getByText(/^Expires /)).toBeInTheDocument();
        expect(screen.getByText("Refresh token available")).toBeInTheDocument();
    });

    it("renders an expired credential and unavailable refresh token truthfully", async () => {
        const user = userEvent.setup();
        actions.getPagerDutyStatus.mockResolvedValue({
            data: {
                ...connectedStatus,
                expires_at: "2020-01-02T03:04:05Z",
                has_refresh_token: false,
            },
        });
        render(<PagerDutySetup canCreatePagerDuty />);

        await loadConnectedStatus(user);

        expect(screen.getByText(/^Expired /)).toBeInTheDocument();
        expect(screen.getByText("Refresh token unavailable")).toBeInTheDocument();
    });

    it("renders ready preflight datasets persistently", async () => {
        const user = userEvent.setup();
        render(<PagerDutySetup canCreatePagerDuty />);

        await loadConnectedStatus(user);
        await renderPreflight(user);

        expect(screen.getByText("services")).toBeInTheDocument();
        expect(screen.getByText("Ready")).toBeInTheDocument();
    });

    it("keeps missing scopes visible for the datasets that need them", async () => {
        const user = userEvent.setup();
        actions.preflightPagerDuty.mockResolvedValue({
            data: {
                ...readyPreflight,
                datasets: [
                    ...readyPreflight.datasets,
                    {
                        requested: "incidents",
                        required_scopes: ["Incidents.read"],
                        granted: false,
                        missing: ["Incidents.read"],
                    },
                ],
            },
        });
        render(<PagerDutySetup canCreatePagerDuty />);

        await loadConnectedStatus(user);
        await renderPreflight(user);

        expect(screen.getByText("incidents")).toBeInTheDocument();
        expect(screen.getByText("Additional permissions needed")).toBeInTheDocument();
        expect(screen.getByText("Missing scopes: Incidents.read")).toBeInTheDocument();
    });

    it("keeps a failed preflight visible and retries the permission check", async () => {
        const user = userEvent.setup();
        actions.preflightPagerDuty
            .mockResolvedValueOnce({ error: "PagerDuty preflight failed." })
            .mockResolvedValueOnce({ data: readyPreflight });
        render(<PagerDutySetup canCreatePagerDuty />);

        await loadConnectedStatus(user);
        await user.click(screen.getByRole("button", { name: "Run preflight" }));

        expect(
            await screen.findByRole("heading", {
                name: "PagerDuty permission check unavailable",
            }),
        ).toBeVisible();
        expect(screen.getByText("PagerDuty preflight failed.")).toBeVisible();
        await user.click(screen.getByRole("button", { name: "Retry preflight" }));
        expect(await screen.findByRole("heading", { name: "Permission checks" })).toBeVisible();
        expect(actions.preflightPagerDuty).toHaveBeenCalledTimes(2);
    });

    it("clears preflight diagnostics when credential, mode, or datasets change", async () => {
        const user = userEvent.setup();
        render(<PagerDutySetup canCreatePagerDuty />);

        await loadConnectedStatus(user);
        await renderPreflight(user);
        await user.type(screen.getByLabelText("Credential name"), "-next");
        expect(
            screen.queryByRole("heading", { name: "Permission checks" }),
        ).not.toBeInTheDocument();

        await loadConnectedStatus(user);
        await renderPreflight(user);
        await user.click(screen.getByRole("button", { name: "Client credentials" }));
        expect(
            screen.queryByRole("heading", { name: "Permission checks" }),
        ).not.toBeInTheDocument();

        await loadConnectedStatus(user);
        await renderPreflight(user);
        await user.click(screen.getByRole("checkbox", { name: "Business services" }));
        expect(
            screen.queryByRole("heading", { name: "Permission checks" }),
        ).not.toBeInTheDocument();
    });
});
