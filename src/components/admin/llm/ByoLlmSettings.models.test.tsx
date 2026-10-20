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
const mockRunReadiness = vi.fn<ByoLlmSettingsProps["runReadinessAction"]>();
const mockLoadModels = vi.fn<NonNullable<ByoLlmSettingsProps["loadModelsAction"]>>();

function renderForm() {
    return renderWithToaster(
        <ByoLlmSettings
            loadSettingsAction={mockLoad}
            loadBudgetAction={mockLoadBudget}
            loadStatusAction={mockLoadStatus}
            saveSettingsAction={mockSave}
            removeSettingsAction={mockRemove}
            runReadinessAction={mockRunReadiness}
            loadModelsAction={mockLoadModels}
        />,
    );
}

const SAVED = {
    provider: "openai",
    model: "gpt-4o",
    api_key: "sk-1…last",
    base_url: "https://a.test",
};

function optionValues(): string[] {
    const list = document.getElementById("byo-model-options");
    return list ? Array.from(list.querySelectorAll("option")).map((o) => o.value) : [];
}

describe("ByoLlmSettings model picker", () => {
    beforeEach(() => {
        for (const mock of [
            mockLoad,
            mockLoadBudget,
            mockLoadStatus,
            mockSave,
            mockRemove,
            mockRunReadiness,
            mockLoadModels,
        ]) {
            mock.mockReset();
        }
        mockLoadStatus.mockResolvedValue({ error: "Not implemented", status: 501 });
        mockLoadBudget.mockResolvedValue({ error: "unavailable", status: 503 });
    });

    it("offers the provider's models as suggestions for the model field", async () => {
        mockLoad.mockResolvedValue({ data: SAVED });
        mockLoadModels.mockResolvedValue({
            data: {
                models: [{ id: "gpt-4o" }, { id: "gpt-4o-mini" }, { id: "o4-mini" }],
                source: "live",
                reason: null,
                fetched_at: "2026-10-20T12:00:00Z",
            },
        });
        renderForm();
        await screen.findByRole("heading", { name: "BYO LLM", level: 2 });
        expect(mockLoadModels).not.toHaveBeenCalled();

        await userEvent.click(screen.getByRole("button", { name: "Edit" }));

        await waitFor(() => {
            expect(optionValues()).toEqual(["gpt-4o", "gpt-4o-mini", "o4-mini"]);
        });
        expect(screen.getByLabelText("Model")).toHaveAttribute("list", "byo-model-options");
        expect(screen.getByTestId("byo-model-hint")).toHaveTextContent(
            "3 models from your provider. Any model name still works.",
        );
        expect(mockLoadModels).toHaveBeenCalledTimes(1);
    });

    it("keeps free text: a name that is not in the list is saved as typed", async () => {
        mockLoad.mockResolvedValue({ data: SAVED });
        mockLoadModels.mockResolvedValue({
            data: {
                models: [{ id: "gpt-4o" }],
                source: "cache",
                reason: null,
                fetched_at: "2026-10-20T12:00:00Z",
            },
        });
        mockSave.mockResolvedValue({ data: { ...SAVED, model: "my-private-finetune" } });
        renderForm();
        await screen.findByRole("heading", { name: "BYO LLM", level: 2 });
        await userEvent.click(screen.getByRole("button", { name: "Edit" }));
        await waitFor(() => expect(optionValues()).toEqual(["gpt-4o"]));

        const modelInput = screen.getByLabelText<HTMLInputElement>("Model");
        await userEvent.clear(modelInput);
        await userEvent.type(modelInput, "my-private-finetune");
        await userEvent.click(screen.getByRole("button", { name: "Save" }));

        expect(mockSave).toHaveBeenCalledWith(
            expect.objectContaining({ provider: "openai", model: "my-private-finetune" }),
        );
    });

    it("does not read the list and says why when no key is saved yet", async () => {
        mockLoad.mockResolvedValue({ data: {} });
        renderForm();
        await screen.findByLabelText("Model");

        expect(mockLoadModels).not.toHaveBeenCalled();
        expect(document.getElementById("byo-model-options")).toBeNull();
        expect(screen.getByLabelText("Model")).not.toHaveAttribute("list");
        expect(screen.getByTestId("byo-model-hint")).toHaveTextContent(
            "Save an API key to load the provider's models. Any model name still works.",
        );
    });

    it("shows the reason and keeps a plain text field when the list is unavailable", async () => {
        mockLoad.mockResolvedValue({ data: SAVED });
        mockLoadModels.mockResolvedValue({
            data: {
                models: [],
                source: "unavailable",
                reason: "provider_rejected",
                fetched_at: null,
            },
        });
        renderForm();
        await screen.findByRole("heading", { name: "BYO LLM", level: 2 });
        await userEvent.click(screen.getByRole("button", { name: "Edit" }));

        await waitFor(() => {
            expect(screen.getByTestId("byo-model-hint")).toHaveTextContent(
                "The provider rejected the saved key, so its models could not be loaded. Any model name still works.",
            );
        });
        expect(document.getElementById("byo-model-options")).toBeNull();
        expect(screen.getByLabelText("Model")).not.toHaveAttribute("list");
    });

    it("treats a failed read as unavailable and never blocks the form", async () => {
        mockLoad.mockResolvedValue({ data: SAVED });
        mockLoadModels.mockResolvedValue({ error: "boom", status: 500 });
        renderForm();
        await screen.findByRole("heading", { name: "BYO LLM", level: 2 });
        await userEvent.click(screen.getByRole("button", { name: "Edit" }));

        await waitFor(() => {
            expect(screen.getByTestId("byo-model-hint")).toHaveTextContent(
                "The provider's model list is not available right now. Any model name still works.",
            );
        });
        expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    });

    it("hides the suggestions when the provider is changed, since the list belongs to the saved provider", async () => {
        mockLoad.mockResolvedValue({ data: SAVED });
        mockLoadModels.mockResolvedValue({
            data: { models: [{ id: "gpt-4o" }], source: "live", reason: null, fetched_at: null },
        });
        renderForm();
        await screen.findByRole("heading", { name: "BYO LLM", level: 2 });
        await userEvent.click(screen.getByRole("button", { name: "Edit" }));
        await waitFor(() => expect(optionValues()).toEqual(["gpt-4o"]));

        await userEvent.selectOptions(screen.getByLabelText("Provider"), "anthropic");

        expect(document.getElementById("byo-model-options")).toBeNull();
        expect(screen.getByTestId("byo-model-hint")).toHaveTextContent(
            "Save the provider change, then reopen the form to load that provider's models.",
        );
    });

    it("never writes a setting by itself while loading the list", async () => {
        mockLoad.mockResolvedValue({ data: SAVED });
        mockLoadModels.mockResolvedValue({
            data: { models: [{ id: "gpt-4o" }], source: "live", reason: null, fetched_at: null },
        });
        renderForm();
        await screen.findByRole("heading", { name: "BYO LLM", level: 2 });
        await userEvent.click(screen.getByRole("button", { name: "Edit" }));
        await waitFor(() => expect(optionValues()).toEqual(["gpt-4o"]));

        expect(mockSave).not.toHaveBeenCalled();
        expect(mockRemove).not.toHaveBeenCalled();
        expect(mockRunReadiness).not.toHaveBeenCalled();
    });
    it("drops the suggestions when the saved setting is deleted", async () => {
        mockLoad.mockResolvedValue({ data: SAVED });
        mockLoadModels.mockResolvedValue({
            data: { models: [{ id: "gpt-4o" }], source: "live", reason: null, fetched_at: null },
        });
        mockRemove.mockResolvedValue({ data: { ok: true } } as never);
        renderForm();
        await screen.findByRole("heading", { name: "BYO LLM", level: 2 });
        await userEvent.click(screen.getByRole("button", { name: "Edit" }));
        await waitFor(() => expect(optionValues()).toEqual(["gpt-4o"]));

        await userEvent.click(screen.getByRole("button", { name: "Delete" }));
        await userEvent.click(screen.getByRole("button", { name: /Confirm/ }));

        await waitFor(() => expect(mockRemove).toHaveBeenCalled());
        await waitFor(() => expect(document.getElementById("byo-model-options")).toBeNull());
        expect(screen.getByLabelText("Model")).not.toHaveAttribute("list");
        expect(screen.getByTestId("byo-model-hint")).toHaveTextContent(
            "Save an API key to load the provider's models.",
        );
    });

    it("ignores a list read that finishes after the setting was deleted", async () => {
        mockLoad.mockResolvedValue({ data: SAVED });
        let finish: (value: Awaited<ReturnType<typeof mockLoadModels>>) => void = () => {};
        mockLoadModels.mockReturnValue(
            new Promise((resolve) => {
                finish = resolve;
            }),
        );
        mockRemove.mockResolvedValue({ data: { ok: true } } as never);
        renderForm();
        await screen.findByRole("heading", { name: "BYO LLM", level: 2 });
        await userEvent.click(screen.getByRole("button", { name: "Edit" }));
        await waitFor(() => expect(mockLoadModels).toHaveBeenCalledTimes(1));

        await userEvent.click(screen.getByRole("button", { name: "Delete" }));
        await userEvent.click(screen.getByRole("button", { name: /Confirm/ }));
        await waitFor(() => expect(mockRemove).toHaveBeenCalled());
        finish({
            data: {
                models: [{ id: "stale-openai-model" }],
                source: "live",
                reason: null,
                fetched_at: null,
            },
        });

        await new Promise((r) => setTimeout(r, 20));
        expect(document.getElementById("byo-model-options")).toBeNull();
    });

    it("drops the suggestions when the form is cancelled and reopened before the new read ends", async () => {
        mockLoad.mockResolvedValue({ data: SAVED });
        mockLoadModels.mockResolvedValueOnce({
            data: { models: [{ id: "gpt-4o" }], source: "live", reason: null, fetched_at: null },
        });
        renderForm();
        await screen.findByRole("heading", { name: "BYO LLM", level: 2 });
        await userEvent.click(screen.getByRole("button", { name: "Edit" }));
        await waitFor(() => expect(optionValues()).toEqual(["gpt-4o"]));
        mockLoadModels.mockReturnValue(new Promise(() => {}));

        await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
        await userEvent.click(screen.getByRole("button", { name: "Edit" }));

        expect(document.getElementById("byo-model-options")).toBeNull();
    });
});
