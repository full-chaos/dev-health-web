import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AskDevAdminResponse, AskDevAdminUsageResponse } from "@/lib/admin/types";
import { AskDevAdminPanel } from "./AskDevAdminPanel";

vi.mock("sonner", () => ({
    toast: { success: vi.fn(), error: vi.fn() },
}));

const adminResponse: AskDevAdminResponse = {
    schema_version: "ask_dev_admin.v1",
    entitlement_state: "enabled",
    ask_dev_enabled: true,
    chat_window_available: true,
    full_page_available: true,
    effective_provider_label: "OpenAI compatible",
    effective_model_label: "Certified model",
    provider_source: "platform",
    readiness: "ready",
    readiness_checked_at: "2026-07-29T16:00:00Z",
    readiness_version: "agent-readiness.v1",
    administrator_safe_failure_reason: null,
    settings: {
        retention_days: 30,
        fallback_policy: "fail_closed",
        emergency_disabled: false,
        platform_monthly_request_limit: 1_000,
        platform_monthly_cost_limit_microusd: 100_000_000,
    },
    retention_options: [0, 30],
    fallback_options: ["fail_closed", "platform"],
    request_limits: {
        active_runs_per_user: 1,
        active_runs_per_organization: 5,
        requests_per_user_per_15_minutes: 20,
        requests_per_organization_per_hour: 100,
    },
    platform_allowance_bounds: {
        request_minimum: 100,
        request_maximum: 5_000,
        cost_minimum_microusd: 10_000_000,
        cost_maximum_microusd: 500_000_000,
    },
    no_training_by_default: true,
};

const usageResponse: AskDevAdminUsageResponse = {
    schema_version: "ask_dev_admin_usage.v1",
    use_case: "ask_dev",
    since: "2026-06-29T16:00:00Z",
    through: "2026-07-29T16:00:00Z",
    request_count: 12,
    run_count: 10,
    completed_runs: 8,
    failed_runs: 1,
    degraded_runs: 1,
    input_tokens: 1000,
    output_tokens: 500,
    estimated_cost_microusd: 1_250_000,
    failure_rate: 0.1,
    degraded_rate: 0.1,
    readiness: "ready",
    platform_allowance: {
        window_start: "2026-07-01T00:00:00Z",
        reset_at: "2026-08-01T00:00:00Z",
        request_limit: 1_000,
        request_used: 825,
        request_remaining: 175,
        cost_limit_microusd: 100_000_000,
        cost_used_microusd: 82_500_000,
        cost_remaining_microusd: 17_500_000,
        warning: "eighty_percent",
    },
};

describe("AskDevAdminPanel", () => {
    const loadAction = vi.fn();
    const loadUsageAction = vi.fn();
    const saveAction = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        loadAction.mockResolvedValue({ data: adminResponse });
        loadUsageAction.mockResolvedValue({ data: usageResponse });
        saveAction.mockResolvedValue({ data: adminResponse });
    });

    function renderPanel() {
        return render(
            <AskDevAdminPanel
                loadAction={loadAction}
                loadUsageAction={loadUsageAction}
                saveAction={saveAction}
            />,
        );
    }

    it("presents one policy for the permanent window and full-page workspace", async () => {
        renderPanel();

        expect(await screen.findByRole("heading", { name: "Ask Dev" })).toBeInTheDocument();
        expect(screen.getByText("10")).toBeInTheDocument();
        expect(screen.getByText("1,500")).toBeInTheDocument();
        expect(screen.getByText("$1.25")).toBeInTheDocument();
        expect(screen.getByText("825 of 1,000")).toBeInTheDocument();
        expect(screen.getByText("$82.50 of $100.00")).toBeInTheDocument();
        expect(screen.getByText(/80% of the platform allowance/i)).toBeInTheDocument();
        expect(screen.getByText(/resets aug 1, 2026/i)).toBeInTheDocument();
        expect(screen.getAllByText(/window and \/dev share this allowance/i)).not.toHaveLength(0);
        expect(screen.getAllByText(/platform fallback also consumes it/i)).not.toHaveLength(0);
        expect(screen.getByText(/not used for model training by default/i)).toBeInTheDocument();
        expect(screen.queryByText(/api key/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/base url/i)).not.toBeInTheDocument();
    });

    it("renders no provider identity, readiness badge, or preflight action (CHAOS-3265)", async () => {
        renderPanel();

        expect(await screen.findByRole("heading", { name: "Ask Dev" })).toBeInTheDocument();
        // No platform-provider identity fields (moved to Platform Admin / BYO LLM).
        expect(screen.queryByText("Chat window")).not.toBeInTheDocument();
        expect(screen.queryByText("Full page")).not.toBeInTheDocument();
        expect(screen.queryByText("Availability and provider")).not.toBeInTheDocument();
        expect(screen.queryByText(/OpenAI compatible/i)).not.toBeInTheDocument();
        expect(screen.queryByText("Certified model")).not.toBeInTheDocument();
        // No readiness badge/pill in the header.
        expect(screen.queryByRole("status")).not.toBeInTheDocument();
        expect(screen.queryByText("Ready")).not.toBeInTheDocument();
        // No preflight action anywhere on the surface.
        expect(screen.queryByRole("button", { name: "Run preflight" })).not.toBeInTheDocument();
        expect(screen.queryByText(/last preflight/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/synthetic data only/i)).not.toBeInTheDocument();
    });

    it("submits the approved conversation policy and bounded platform allowance", async () => {
        const refreshedUsage = {
            ...usageResponse,
            platform_allowance: {
                ...usageResponse.platform_allowance,
                request_limit: 750,
                request_remaining: 0,
                cost_limit_microusd: 75_000_000,
                cost_remaining_microusd: 0,
                warning: "exhausted",
            },
        } satisfies AskDevAdminUsageResponse;
        loadUsageAction
            .mockResolvedValueOnce({ data: usageResponse })
            .mockResolvedValueOnce({ data: refreshedUsage });
        saveAction.mockResolvedValueOnce({
            data: {
                ...adminResponse,
                settings: {
                    ...adminResponse.settings,
                    retention_days: 0,
                    fallback_policy: "platform",
                    emergency_disabled: true,
                    platform_monthly_request_limit: 750,
                    platform_monthly_cost_limit_microusd: 75_000_000,
                },
            } satisfies AskDevAdminResponse,
        });
        renderPanel();

        await screen.findByRole("heading", { name: "Ask Dev" });
        fireEvent.change(screen.getByLabelText("Content retention"), {
            target: { value: "0" },
        });
        fireEvent.change(screen.getByLabelText("Unsupported BYO behavior"), {
            target: { value: "platform" },
        });
        fireEvent.click(screen.getByLabelText("Emergency disable Ask Dev"));
        const requestLimit = screen.getByLabelText("Monthly platform run limit");
        const costLimit = screen.getByLabelText("Monthly platform cost cap (USD)");
        expect(requestLimit).toHaveAttribute("min", "100");
        expect(requestLimit).toHaveAttribute("max", "5000");
        expect(costLimit).toHaveAttribute("min", "10");
        expect(costLimit).toHaveAttribute("max", "500");
        fireEvent.change(requestLimit, { target: { value: "750" } });
        fireEvent.change(costLimit, { target: { value: "75" } });
        fireEvent.click(screen.getByRole("button", { name: "Save" }));

        await waitFor(() =>
            expect(saveAction).toHaveBeenCalledWith({
                retention_days: 0,
                fallback_policy: "platform",
                emergency_disabled: true,
                platform_monthly_request_limit: 750,
                platform_monthly_cost_limit_microusd: 75_000_000,
            }),
        );
        await waitFor(() => expect(loadUsageAction).toHaveBeenCalledTimes(2));
        expect(screen.getByText("825 of 750")).toBeInTheDocument();
        expect(screen.getByText("$82.50 of $75.00")).toBeInTheDocument();
        expect(screen.getByText(/platform allowance is exhausted/i)).toBeInTheDocument();
        expect(screen.queryByRole("option", { name: /7 days/i })).not.toBeInTheDocument();
        expect(screen.queryByRole("option", { name: /90 days/i })).not.toBeInTheDocument();
    });

    it("clearly reports an exhausted platform allowance and its reset", async () => {
        loadUsageAction.mockResolvedValue({
            data: {
                ...usageResponse,
                platform_allowance: {
                    ...usageResponse.platform_allowance,
                    request_used: 1_000,
                    request_remaining: 0,
                    cost_used_microusd: 100_000_000,
                    cost_remaining_microusd: 0,
                    warning: "exhausted",
                },
            } satisfies AskDevAdminUsageResponse,
        });

        renderPanel();

        expect(await screen.findByText(/platform allowance is exhausted/i)).toBeInTheDocument();
        expect(screen.getByText(/new platform-backed runs remain blocked/i)).toBeInTheDocument();
        expect(
            screen.getByText(/existing conversation history remains available/i),
        ).toBeInTheDocument();
    });

    it("keeps organization controls unavailable when Ask Dev is not entitled", async () => {
        loadAction.mockResolvedValue({
            data: {
                ...adminResponse,
                entitlement_state: "not_entitled",
                ask_dev_enabled: false,
                chat_window_available: false,
                full_page_available: false,
                readiness: "disabled",
            } satisfies AskDevAdminResponse,
        });
        renderPanel();

        expect(await screen.findByRole("button", { name: "Save" })).toBeDisabled();
        expect(screen.queryByRole("button", { name: "Run preflight" })).not.toBeInTheDocument();
    });
});
