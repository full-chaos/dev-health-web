import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithToaster, screen, userEvent, waitFor } from "@/test/utils";

vi.mock("next/link", () => ({
    default: ({ href, children }: { href: string; children: React.ReactNode }) => (
        <a href={href}>{children}</a>
    ),
}));

import { ByoLlmSettings, type ByoLlmSettingsProps } from "./ByoLlmSettings";

const mockLoad = vi.fn<ByoLlmSettingsProps["loadSettingsAction"]>();
const mockLoadBudget = vi.fn<ByoLlmSettingsProps["loadBudgetAction"]>();
const mockLoadStatus = vi.fn<ByoLlmSettingsProps["loadStatusAction"]>();
const mockSave = vi.fn<ByoLlmSettingsProps["saveSettingsAction"]>();
const mockRemove = vi.fn<ByoLlmSettingsProps["removeSettingsAction"]>();

function renderForm() {
    return renderWithToaster(
        <ByoLlmSettings
            loadSettingsAction={mockLoad}
            loadBudgetAction={mockLoadBudget}
            loadStatusAction={mockLoadStatus}
            saveSettingsAction={mockSave}
            removeSettingsAction={mockRemove}
        />,
    );
}

describe("ByoLlmSettings", () => {
    beforeEach(() => {
        mockLoad.mockReset();
        mockLoadBudget.mockReset();
        mockSave.mockReset();
        mockRemove.mockReset();
        mockLoadStatus.mockReset();
        // The CHAOS-2560 status endpoint is being built on a sibling branch;
        // default every test to the "not built yet" failure so the badge falls
        // back to settings-derived Saved/Not configured wording unless a test
        // explicitly exercises the happy-path status DTO.
        mockLoadStatus.mockResolvedValue({ error: "Not implemented", status: 501 });
        mockLoadBudget.mockResolvedValue({
            data: {
                used_micro_usd: 0,
                limit_micro_usd: null,
                remaining_micro_usd: null,
                window: "calendar_month_utc",
                reset_at: "2026-08-01T00:00:00Z",
                enforcement_available: false,
                reason: "budget_not_configured",
                maximum_limit_micro_usd: 500_000_000,
                pricing_version: "openai-public-2025-08-07.v1",
            },
        });
    });

    it("renders the form with a Not configured status for an empty config", async () => {
        mockLoad.mockResolvedValue({ data: {} });
        renderForm();

        expect(await screen.findByText("Not configured")).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "BYO LLM", level: 2 })).toBeInTheDocument();
        expect(screen.getByLabelText("Provider")).toBeInTheDocument();
        expect(screen.getByLabelText("API Key")).toBeInTheDocument();
        expect(await screen.findByText("No budget configured")).toBeInTheDocument();
        expect(screen.getByLabelText("Monthly organization budget (USD)")).toHaveValue("");
    });

    it("renders reserved usage, warning state, monthly reset, and provisioned maximum", async () => {
        mockLoad.mockResolvedValue({ data: { provider: "openai", model: "gpt-5-mini" } });
        mockLoadBudget.mockResolvedValue({
            data: {
                used_micro_usd: 85_000_000,
                limit_micro_usd: 100_000_000,
                remaining_micro_usd: 15_000_000,
                window: "calendar_month_utc",
                reset_at: "2026-08-01T00:00:00Z",
                enforcement_available: true,
                reason: "available",
                maximum_limit_micro_usd: 500_000_000,
                pricing_version: "openai-public-2025-08-07.v1",
            },
        });

        renderForm();

        expect(await screen.findByText("Approaching budget")).toBeInTheDocument();
        expect(screen.getByText("$85.00")).toBeInTheDocument();
        expect(screen.getByText("$100.00")).toBeInTheDocument();
        expect(screen.getByText("$15.00")).toBeInTheDocument();
        expect(screen.getByText(/At least 80%/)).toBeInTheDocument();
        expect(screen.getByText(/maximum provisioned limit \$500.00/)).toBeInTheDocument();
    });

    it("keeps provider settings usable when budget status is temporarily unavailable", async () => {
        mockLoad.mockResolvedValue({ data: { provider: "openai", model: "gpt-5-mini" } });
        mockLoadBudget
            .mockResolvedValueOnce({ error: "Budget service unavailable", status: 503 })
            .mockResolvedValueOnce({
                data: {
                    used_micro_usd: 0,
                    limit_micro_usd: 10_000_000,
                    remaining_micro_usd: 10_000_000,
                    window: "calendar_month_utc",
                    reset_at: "2026-08-01T00:00:00Z",
                    enforcement_available: true,
                    reason: "available",
                    maximum_limit_micro_usd: 500_000_000,
                    pricing_version: "openai-public-2025-08-07.v1",
                },
            });

        renderForm();

        expect(await screen.findByText("Budget service unavailable")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Retry" }));
        expect(await screen.findByText("Budget enforced")).toBeInTheDocument();
    });

    it.each([
        {
            reason: "budget_exhausted" as const,
            label: "Budget exhausted",
            explanation: /New budgeted BYO-LLM calls are blocked/,
            used: 100_000_000,
        },
        {
            reason: "usage_unavailable" as const,
            label: "Usage unavailable — calls blocked",
            explanation: /did not report usable token data/,
            used: null,
        },
        {
            reason: "pricing_unavailable" as const,
            label: "Pricing unavailable — calls blocked",
            explanation: /has no reliable price/,
            used: null,
        },
    ])("renders the $reason enforcement state", async ({ reason, label, explanation, used }) => {
        mockLoad.mockResolvedValue({ data: { provider: "openai", model: "custom-model" } });
        mockLoadBudget.mockResolvedValue({
            data: {
                used_micro_usd: used,
                limit_micro_usd: 100_000_000,
                remaining_micro_usd: reason === "budget_exhausted" ? 0 : null,
                window: "calendar_month_utc",
                reset_at: "2026-08-01T00:00:00Z",
                enforcement_available: reason === "budget_exhausted",
                reason,
                maximum_limit_micro_usd: 500_000_000,
                pricing_version:
                    reason === "pricing_unavailable" ? null : "openai-public-2025-08-07.v1",
            },
        });

        renderForm();

        expect(await screen.findByText(label)).toBeInTheDocument();
        expect(screen.getByText(explanation)).toBeInTheDocument();
    });

    it("renders a read-only summary with a Saved badge when settings are persisted", async () => {
        mockLoad.mockResolvedValue({
            data: {
                provider: "anthropic",
                model: "claude-3-5-sonnet",
                api_key: "sk-1…last",
                base_url: "https://example.test",
            },
        });
        renderForm();

        await screen.findByRole("heading", { name: "BYO LLM", level: 2 });
        expect(screen.getByText("Saved")).toBeInTheDocument();
        expect(screen.getByText("Anthropic")).toBeInTheDocument();
        expect(screen.getByText("claude-3-5-sonnet")).toBeInTheDocument();
        expect(screen.getByText("https://example.test")).toBeInTheDocument();
        expect(screen.getByText("sk-1…last")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
        // Read-only summary: no editable form fields until Edit is clicked.
        expect(screen.queryByLabelText("Provider")).not.toBeInTheDocument();
        expect(screen.queryByLabelText("Model")).not.toBeInTheDocument();
    });

    it("shows an Active badge when the status endpoint reports an active configuration", async () => {
        mockLoad.mockResolvedValue({ data: { provider: "openai", model: "gpt-4o" } });
        mockLoadStatus.mockResolvedValue({
            data: {
                configured: true,
                active: true,
                degraded: false,
                reason_code: "active",
                last_fallback_at: null,
            },
        });
        renderForm();

        expect(await screen.findByText("Active")).toBeInTheDocument();
    });

    it("shows a degraded badge when the stored config is falling back to the platform default", async () => {
        mockLoad.mockResolvedValue({
            data: { provider: "openai", model: "gpt-4o", base_url: "https://bad.test" },
        });
        mockLoadStatus.mockResolvedValue({
            data: {
                configured: true,
                active: false,
                degraded: true,
                reason_code: "invalid_base_url",
                last_fallback_at: "2026-01-01T00:00:00Z",
            },
        });
        renderForm();

        expect(await screen.findByText("Invalid — using platform default")).toBeInTheDocument();
    });

    it("enters edit mode from the summary, edits, and saves", async () => {
        mockLoad.mockResolvedValue({
            data: {
                provider: "openai",
                model: "gpt-4o",
                api_key: "sk-1…last",
                base_url: "https://a.test",
            },
        });
        mockSave.mockResolvedValue({
            data: {
                provider: "openai",
                model: "gpt-4o-mini",
                api_key: "sk-1…last",
                base_url: "https://a.test",
            },
        });
        renderForm();

        await screen.findByRole("heading", { name: "BYO LLM", level: 2 });
        expect(screen.getByText("gpt-4o")).toBeInTheDocument();

        await userEvent.click(screen.getByRole("button", { name: "Edit" }));
        const modelInput = screen.getByLabelText<HTMLInputElement>("Model");
        expect(modelInput.value).toBe("gpt-4o");
        await userEvent.clear(modelInput);
        await userEvent.type(modelInput, "gpt-4o-mini");
        await userEvent.click(screen.getByRole("button", { name: "Save" }));

        expect(mockSave).toHaveBeenCalledWith(
            expect.objectContaining({ provider: "openai", model: "gpt-4o-mini" }),
        );
        await waitFor(() => {
            expect(screen.getByText("BYO-LLM settings saved.")).toBeInTheDocument();
        });
        // Reverts to the read-only summary after a successful save.
        expect(screen.queryByLabelText("Model")).not.toBeInTheDocument();
        expect(screen.getByText("gpt-4o-mini")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    });

    it("reverts to the summary without saving when edit is cancelled", async () => {
        mockLoad.mockResolvedValue({
            data: {
                provider: "openai",
                model: "gpt-4o",
                api_key: "sk-1…last",
                base_url: "https://a.test",
            },
        });
        renderForm();

        await screen.findByRole("heading", { name: "BYO LLM", level: 2 });
        await userEvent.click(screen.getByRole("button", { name: "Edit" }));
        const modelInput = screen.getByLabelText<HTMLInputElement>("Model");
        await userEvent.clear(modelInput);
        await userEvent.type(modelInput, "some-other-model");
        await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

        expect(mockSave).not.toHaveBeenCalled();
        expect(screen.queryByLabelText("Model")).not.toBeInTheDocument();
        expect(screen.getByText("gpt-4o")).toBeInTheDocument();
        expect(screen.queryByText("some-other-model")).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    });

    it("omits api_key from the save payload when the key field is left blank", async () => {
        mockLoad.mockResolvedValue({
            data: { provider: "openai", model: "gpt-4o", api_key: "sk-1…last" },
        });
        mockSave.mockResolvedValue({
            data: { provider: "openai", model: "gpt-4o", api_key: "sk-1…last" },
        });
        renderForm();

        await screen.findByRole("heading", { name: "BYO LLM", level: 2 });
        await userEvent.click(screen.getByRole("button", { name: "Edit" }));
        expect(screen.getByLabelText<HTMLInputElement>("API Key").value).toBe("");
        await userEvent.click(screen.getByRole("button", { name: "Save" }));

        await waitFor(() => {
            expect(mockSave).toHaveBeenCalledTimes(1);
        });
        const payload = mockSave.mock.calls[0][0];
        expect("api_key" in payload).toBe(false);
    });

    it("blocks saving until settings load successfully after a retry", async () => {
        mockLoad
            .mockResolvedValueOnce({
                error: "temporary backend failure",
                status: 500,
            })
            .mockResolvedValueOnce({ data: { provider: "openai" } });
        renderForm();

        expect(await screen.findByText("temporary backend failure")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
        expect(screen.queryByLabelText("Provider")).not.toBeInTheDocument();

        await userEvent.click(screen.getByRole("button", { name: "Retry" }));

        expect(await screen.findByText("Saved")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
        expect(mockLoad).toHaveBeenCalledTimes(2);
        expect(mockSave).not.toHaveBeenCalled();
    });

    it("renders a locked upsell state when the backend returns 402", async () => {
        mockLoad.mockResolvedValue({
            error: "This feature requires the Team plan.",
            status: 402,
        });
        renderForm();

        expect(await screen.findByText("BYO-LLM is locked")).toBeInTheDocument();
        expect(screen.getByText("This feature requires the Team plan.")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /Upgrade to Team/ })).toBeInTheDocument();
        expect(screen.queryByLabelText("Provider")).not.toBeInTheDocument();
    });

    it("renders a locked state without an upgrade link when the flag is off (403)", async () => {
        mockLoad.mockResolvedValue({
            error: "BYO LLM is not enabled for this organization",
            status: 403,
        });
        renderForm();

        expect(await screen.findByText("BYO-LLM is locked")).toBeInTheDocument();
        expect(screen.queryByRole("link", { name: /Upgrade to Team/ })).not.toBeInTheDocument();
    });

    it("submits the upsert payload and shows a success toast", async () => {
        mockLoad.mockResolvedValue({ data: {} });
        mockSave.mockResolvedValue({
            data: { provider: "openai", model: "gpt-4o" },
        });
        renderForm();

        await screen.findByRole("heading", { name: "BYO LLM", level: 2 });
        await userEvent.type(screen.getByLabelText("Model"), "gpt-4o");
        await userEvent.type(screen.getByLabelText("API Key"), "sk-secret");
        await userEvent.click(screen.getByRole("button", { name: "Save" }));

        expect(mockSave).toHaveBeenCalledWith(
            expect.objectContaining({
                provider: "openai",
                model: "gpt-4o",
                api_key: "sk-secret",
            }),
        );
        await waitFor(() => {
            expect(screen.getByText("BYO-LLM settings saved.")).toBeInTheDocument();
        });
    });

    it("submits an exact micro-USD budget and supports an explicit zero hard stop", async () => {
        mockLoad.mockResolvedValue({ data: {} });
        mockSave.mockResolvedValue({ data: { provider: "openai" } });
        renderForm();

        await screen.findByRole("heading", { name: "BYO LLM", level: 2 });
        const budgetInput = screen.getByLabelText("Monthly organization budget (USD)");
        await userEvent.type(budgetInput, "12.345678");
        await userEvent.click(screen.getByRole("button", { name: "Save" }));

        expect(mockSave).toHaveBeenCalledWith(
            expect.objectContaining({ budget_limit_micro_usd: 12_345_678 }),
        );

        await userEvent.click(screen.getByRole("button", { name: "Edit" }));
        await userEvent.clear(screen.getByLabelText("Monthly organization budget (USD)"));
        await userEvent.type(screen.getByLabelText("Monthly organization budget (USD)"), "0");
        await userEvent.click(screen.getByRole("button", { name: "Save" }));

        expect(mockSave).toHaveBeenLastCalledWith(
            expect.objectContaining({ budget_limit_micro_usd: 0 }),
        );
    });

    it("omits a blank budget so the backend preserves the current value", async () => {
        mockLoad.mockResolvedValue({ data: {} });
        mockSave.mockResolvedValue({ data: { provider: "openai" } });
        renderForm();

        await screen.findByRole("heading", { name: "BYO LLM", level: 2 });
        await userEvent.click(screen.getByRole("button", { name: "Save" }));

        const payload = mockSave.mock.calls[0][0];
        expect("budget_limit_micro_usd" in payload).toBe(false);
    });

    it("rejects malformed or over-provisioned budgets before saving", async () => {
        mockLoad.mockResolvedValue({ data: {} });
        mockLoadBudget.mockResolvedValue({
            data: {
                used_micro_usd: 0,
                limit_micro_usd: null,
                remaining_micro_usd: null,
                window: "calendar_month_utc",
                reset_at: "2026-08-01T00:00:00Z",
                enforcement_available: false,
                reason: "budget_not_configured",
                maximum_limit_micro_usd: 5_000_000,
                pricing_version: "openai-public-2025-08-07.v1",
            },
        });
        renderForm();

        await screen.findByRole("heading", { name: "BYO LLM", level: 2 });
        const input = screen.getByLabelText("Monthly organization budget (USD)");
        await userEvent.type(input, "1.0000001");
        await userEvent.click(screen.getByRole("button", { name: "Save" }));
        expect(screen.getByText(/no more than 6 decimal places/)).toBeInTheDocument();
        expect(mockSave).not.toHaveBeenCalled();

        await userEvent.clear(input);
        await userEvent.type(input, "6");
        await userEvent.click(screen.getByRole("button", { name: "Save" }));
        expect(screen.getByText("The maximum provisioned budget is $5.00.")).toBeInTheDocument();
        expect(mockSave).not.toHaveBeenCalled();
    });

    it("surfaces a backend budget maximum rejection on the budget field", async () => {
        mockLoad.mockResolvedValue({ data: { provider: "openai" } });
        mockSave.mockResolvedValue({
            error: "budget_limit_micro_usd must be between 0 and 5000000",
            status: 400,
        });
        renderForm();

        await screen.findByRole("heading", { name: "BYO LLM", level: 2 });
        await userEvent.click(screen.getByRole("button", { name: "Edit" }));
        await userEvent.type(screen.getByLabelText("Monthly organization budget (USD)"), "1");
        await userEvent.click(screen.getByRole("button", { name: "Save" }));

        expect(
            await screen.findByText("budget_limit_micro_usd must be between 0 and 5000000"),
        ).toBeInTheDocument();
        expect(screen.getByLabelText("Base URL")).not.toHaveAttribute("aria-invalid", "true");
    });

    it("surfaces a 400 base_url validation error inline", async () => {
        mockLoad.mockResolvedValue({ data: { provider: "openai" } });
        mockSave.mockResolvedValue({ error: "invalid_base_url", status: 400 });
        renderForm();

        await screen.findByRole("heading", { name: "BYO LLM", level: 2 });
        await userEvent.click(screen.getByRole("button", { name: "Edit" }));
        await userEvent.type(screen.getByLabelText("Base URL"), "not-a-url");
        await userEvent.click(screen.getByRole("button", { name: "Save" }));

        await waitFor(() => {
            expect(screen.getByText("invalid_base_url")).toBeInTheDocument();
        });
    });

    it("requires a confirmation click before deleting", async () => {
        mockLoad.mockResolvedValue({
            data: { provider: "openai", api_key: "sk-1…last" },
        });
        mockRemove.mockResolvedValue({ data: { deleted: true } });
        renderForm();

        await screen.findByRole("heading", { name: "BYO LLM", level: 2 });
        await userEvent.click(screen.getByRole("button", { name: "Delete" }));
        expect(mockRemove).not.toHaveBeenCalled();

        await userEvent.click(screen.getByRole("button", { name: "Confirm delete?" }));
        expect(mockRemove).toHaveBeenCalledTimes(1);
        await waitFor(() => {
            expect(screen.getByText("BYO-LLM settings removed.")).toBeInTheDocument();
        });
    });
});
