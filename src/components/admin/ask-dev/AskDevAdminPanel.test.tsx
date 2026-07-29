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
    },
    retention_options: [0, 30],
    fallback_options: ["fail_closed", "platform"],
    request_limits: {
        active_runs_per_user: 1,
        active_runs_per_organization: 5,
        requests_per_user_per_15_minutes: 20,
        requests_per_organization_per_hour: 100,
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
};

describe("AskDevAdminPanel", () => {
    const loadAction = vi.fn();
    const loadUsageAction = vi.fn();
    const saveAction = vi.fn();
    const readinessAction = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        loadAction.mockResolvedValue({ data: adminResponse });
        loadUsageAction.mockResolvedValue({ data: usageResponse });
        saveAction.mockResolvedValue({ data: adminResponse });
        readinessAction.mockResolvedValue({ data: adminResponse });
    });

    function renderPanel() {
        return render(
            <AskDevAdminPanel
                loadAction={loadAction}
                loadUsageAction={loadUsageAction}
                saveAction={saveAction}
                readinessAction={readinessAction}
            />,
        );
    }

    it("presents one policy for the permanent window and full-page workspace", async () => {
        renderPanel();

        expect(await screen.findByRole("heading", { name: "Ask Dev" })).toBeInTheDocument();
        expect(screen.getByText("Chat window")).toBeInTheDocument();
        expect(screen.getByText("Full page")).toBeInTheDocument();
        expect(screen.getByText("OpenAI compatible · platform")).toBeInTheDocument();
        expect(screen.getByText("Certified model")).toBeInTheDocument();
        expect(screen.getByText("10")).toBeInTheDocument();
        expect(screen.getByText("1,500")).toBeInTheDocument();
        expect(screen.getByText("$1.25")).toBeInTheDocument();
        expect(screen.getByText(/not used for model training by default/i)).toBeInTheDocument();
        expect(screen.queryByText(/api key/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/base url/i)).not.toBeInTheDocument();
    });

    it("submits only the approved retention, fallback, and emergency policy", async () => {
        renderPanel();

        await screen.findByRole("heading", { name: "Ask Dev" });
        fireEvent.change(screen.getByLabelText("Content retention"), {
            target: { value: "0" },
        });
        fireEvent.change(screen.getByLabelText("Unsupported BYO behavior"), {
            target: { value: "platform" },
        });
        fireEvent.click(screen.getByLabelText("Emergency disable Ask Dev"));
        fireEvent.click(screen.getByRole("button", { name: "Save" }));

        await waitFor(() =>
            expect(saveAction).toHaveBeenCalledWith({
                retention_days: 0,
                fallback_policy: "platform",
                emergency_disabled: true,
            }),
        );
        expect(screen.queryByRole("option", { name: /7 days/i })).not.toBeInTheDocument();
        expect(screen.queryByRole("option", { name: /90 days/i })).not.toBeInTheDocument();
    });

    it("runs the non-sensitive readiness action explicitly", async () => {
        renderPanel();

        fireEvent.click(await screen.findByRole("button", { name: "Run preflight" }));
        await waitFor(() => expect(readinessAction).toHaveBeenCalledTimes(1));
        expect(screen.getByText(/synthetic data only/i)).toBeInTheDocument();
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
        expect(screen.getByRole("button", { name: "Run preflight" })).toBeDisabled();
    });
});
