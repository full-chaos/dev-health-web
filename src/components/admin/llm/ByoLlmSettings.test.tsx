import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithToaster, screen, userEvent, waitFor } from "@/test/utils";

vi.mock("next/link", () => ({
    default: ({ href, children }: { href: string; children: React.ReactNode }) => (
        <a href={href}>{children}</a>
    ),
}));

import { ByoLlmSettings, type ByoLlmSettingsProps } from "./ByoLlmSettings";

const mockLoad = vi.fn<ByoLlmSettingsProps["loadSettingsAction"]>();
const mockSave = vi.fn<ByoLlmSettingsProps["saveSettingsAction"]>();
const mockRemove = vi.fn<ByoLlmSettingsProps["removeSettingsAction"]>();

function renderForm() {
    return renderWithToaster(
        <ByoLlmSettings
            loadSettingsAction={mockLoad}
            saveSettingsAction={mockSave}
            removeSettingsAction={mockRemove}
        />,
    );
}

describe("ByoLlmSettings", () => {
    beforeEach(() => {
        mockLoad.mockReset();
        mockSave.mockReset();
        mockRemove.mockReset();
    });

    it("renders the form with a Not configured status for an empty config", async () => {
        mockLoad.mockResolvedValue({ data: {} });
        renderForm();

        expect(await screen.findByText("Not configured")).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "AI Setup" })).toBeInTheDocument();
        expect(screen.getByLabelText("Provider")).toBeInTheDocument();
        expect(screen.getByLabelText("API Key")).toBeInTheDocument();
    });

    it("hydrates fields and shows Saved when settings are persisted", async () => {
        mockLoad.mockResolvedValue({
            data: {
                provider: "anthropic",
                model: "claude-3-5-sonnet",
                api_key: "sk-1…last",
                base_url: "https://example.test",
            },
        });
        renderForm();

        await screen.findByRole("heading", { name: "AI Setup" });
        expect(screen.getByText("Saved")).toBeInTheDocument();
        expect(screen.getByLabelText<HTMLSelectElement>("Provider").value).toBe("anthropic");
        expect(screen.getByLabelText<HTMLInputElement>("Model").value).toBe("claude-3-5-sonnet");
        expect(screen.getByLabelText<HTMLInputElement>("Base URL").value).toBe(
            "https://example.test",
        );
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
        expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
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

        await screen.findByRole("heading", { name: "AI Setup" });
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

    it("surfaces a 400 base_url validation error inline", async () => {
        mockLoad.mockResolvedValue({ data: { provider: "openai" } });
        mockSave.mockResolvedValue({ error: "invalid_base_url", status: 400 });
        renderForm();

        await screen.findByRole("heading", { name: "AI Setup" });
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

        await screen.findByRole("heading", { name: "AI Setup" });
        await userEvent.click(screen.getByRole("button", { name: "Delete" }));
        expect(mockRemove).not.toHaveBeenCalled();

        await userEvent.click(screen.getByRole("button", { name: "Confirm delete?" }));
        expect(mockRemove).toHaveBeenCalledTimes(1);
        await waitFor(() => {
            expect(screen.getByText("BYO-LLM settings removed.")).toBeInTheDocument();
        });
    });
});
