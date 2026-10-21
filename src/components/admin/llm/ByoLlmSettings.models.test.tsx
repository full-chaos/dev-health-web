import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithToaster, screen, userEvent, waitFor } from "@/test/utils";

vi.mock("next/link", () => ({
    default: ({ href, children }: { href: string; children: React.ReactNode }) => (
        <a href={href}>{children}</a>
    ),
}));

import type { LLMModelListResponse } from "@/lib/admin/types";
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
    const select = document.getElementById("byo-model");
    return select instanceof HTMLSelectElement
        ? Array.from(select.options)
              .map((o) => o.value)
              .filter((v) => v !== "" && v !== "__other__")
        : [];
}

const LIVE: LLMModelListResponse = {
    models: [{ id: "gpt-4o" }, { id: "gpt-4o-mini" }],
    source: "live",
    reason: null,
    fetched_at: null,
};

function catalogBody(provider: string, ids: string[], extra: Record<string, unknown> = {}) {
    return {
        provider,
        models: ids.map((id) => ({ id, source: "catalog" as const, verified: false })),
        source: "catalog" as const,
        reason: null,
        fetched_at: null,
        ...extra,
    };
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

    it("shows the platform catalog as a select with no key saved, right after the provider is chosen", async () => {
        mockLoad.mockResolvedValue({ data: {} });
        mockLoadModels.mockResolvedValue({
            data: catalogBody("openai", ["gpt-4o", "o4-mini"]),
        });
        renderForm();

        await waitFor(() => expect(optionValues()).toEqual(["gpt-4o", "o4-mini"]));
        expect(mockLoadModels).toHaveBeenCalledWith(expect.any(AbortSignal), "openai");
        expect(screen.getByLabelText("Model").tagName).toBe("SELECT");
        expect(screen.getByTestId("byo-model-hint")).toHaveTextContent(
            "2 models from the platform catalog. Save an API key to verify them with your provider.",
        );
    });

    it("reads the list for the chosen provider and drops an answer that arrives late for the old one", async () => {
        mockLoad.mockResolvedValue({ data: {} });
        let finishOpenai: (v: Awaited<ReturnType<typeof mockLoadModels>>) => void = () => {};
        mockLoadModels.mockImplementation((_signal, provider) =>
            provider === "openai"
                ? new Promise((resolve) => {
                      finishOpenai = resolve;
                  })
                : Promise.resolve({ data: catalogBody("anthropic", ["claude-haiku-5-5"]) }),
        );
        renderForm();
        await screen.findByLabelText("Provider");
        await userEvent.selectOptions(screen.getByLabelText("Provider"), "anthropic");
        await waitFor(() => expect(optionValues()).toEqual(["claude-haiku-5-5"]));

        finishOpenai({ data: catalogBody("openai", ["gpt-4o"]) });
        await new Promise((r) => setTimeout(r, 20));

        expect(optionValues()).toEqual(["claude-haiku-5-5"]);
        expect(mockLoadModels).toHaveBeenCalledWith(expect.any(AbortSignal), "anthropic");
    });

    it("groups verified names first, then the catalog", async () => {
        mockLoad.mockResolvedValue({ data: {} });
        mockLoadModels.mockResolvedValue({
            data: {
                provider: "openai",
                models: [
                    { id: "gpt-4o", source: "live", verified: true },
                    { id: "gpt-5", source: "catalog", verified: false },
                ],
                source: "live",
                reason: null,
                fetched_at: "2026-10-21T21:30:00Z",
            },
        });
        renderForm();
        await waitFor(() => expect(optionValues()).toEqual(["gpt-4o", "gpt-5"]));

        const groups = Array.from(document.querySelectorAll("#byo-model optgroup")).map((g) =>
            g.getAttribute("label"),
        );
        expect(groups).toEqual(["Verified with your key", "Platform catalog"]);
        expect(screen.getByTestId("byo-model-hint")).toHaveTextContent(
            "2 models, 1 verified with your key.",
        );
    });

    it("keeps a saved model that the list does not carry as the selected option", async () => {
        mockLoad.mockResolvedValue({
            data: { ...SAVED, model: "claude-haiku-5-5", provider: "anthropic" },
        });
        mockLoadModels.mockResolvedValue({
            data: catalogBody("anthropic", ["claude-opus-5"]),
        });
        renderForm();
        await screen.findByRole("heading", { name: "BYO LLM", level: 2 });
        await userEvent.click(screen.getByRole("button", { name: "Edit" }));

        await waitFor(() => expect(optionValues()).toContain("claude-haiku-5-5"));
        expect(screen.getByLabelText<HTMLSelectElement>("Model").value).toBe("claude-haiku-5-5");
    });

    it("saves the chosen name, and a typed name through Other", async () => {
        mockLoad.mockResolvedValue({ data: {} });
        mockLoadModels.mockResolvedValue({ data: catalogBody("openai", ["gpt-4o"]) });
        mockSave.mockResolvedValue({ data: { ...SAVED } });
        renderForm();
        await waitFor(() => expect(optionValues()).toEqual(["gpt-4o"]));

        await userEvent.selectOptions(screen.getByLabelText("Model"), "gpt-4o");
        await userEvent.type(screen.getByLabelText("API Key"), "sk-test-12345678");
        await userEvent.click(screen.getByRole("button", { name: "Save" }));
        expect(mockSave).toHaveBeenLastCalledWith(
            expect.objectContaining({ provider: "openai", model: "gpt-4o" }),
        );

        await userEvent.click(screen.getByRole("button", { name: "Edit" }));
        await userEvent.selectOptions(await screen.findByLabelText("Model"), "__other__");
        const other = screen.getByLabelText("Other model name");
        await userEvent.clear(other);
        await userEvent.type(other, "my-private-finetune");
        await userEvent.click(screen.getByRole("button", { name: "Save" }));
        expect(mockSave).toHaveBeenLastCalledWith(
            expect.objectContaining({ model: "my-private-finetune" }),
        );
    });

    it("still reads an older route's answer (no provider, no per-model source) as a select", async () => {
        mockLoad.mockResolvedValue({ data: SAVED });
        mockLoadModels.mockResolvedValue({ data: LIVE });
        renderForm();
        await screen.findByRole("heading", { name: "BYO LLM", level: 2 });
        await userEvent.click(screen.getByRole("button", { name: "Edit" }));

        await waitFor(() => expect(optionValues()).toEqual(["gpt-4o", "gpt-4o-mini"]));
    });

    it("ignores an older route's saved-provider list when another provider is chosen", async () => {
        mockLoad.mockResolvedValue({ data: SAVED });
        mockLoadModels.mockResolvedValue({ data: LIVE });
        renderForm();
        await screen.findByRole("heading", { name: "BYO LLM", level: 2 });
        await userEvent.click(screen.getByRole("button", { name: "Edit" }));
        await waitFor(() => expect(optionValues()).toEqual(["gpt-4o", "gpt-4o-mini"]));

        await userEvent.selectOptions(screen.getByLabelText("Provider"), "anthropic");

        await waitFor(() => expect(screen.getByLabelText("Model").tagName).toBe("INPUT"));
    });

    it("falls back to a plain text field, with the reason, when the list is unavailable", async () => {
        mockLoad.mockResolvedValue({ data: {} });
        mockLoadModels.mockResolvedValue({
            data: { models: [], source: "unavailable", reason: "not_configured", fetched_at: null },
        });
        renderForm();

        await waitFor(() =>
            expect(screen.getByTestId("byo-model-hint")).toHaveTextContent(
                "Save a provider and API key to load its models. Any model name still works.",
            ),
        );
        expect(screen.getByLabelText("Model").tagName).toBe("INPUT");
    });

    it.each([
        ["a failed read", { error: "boom", status: 500 }],
        ["an unknown provider", { error: "unknown_provider", status: 400 }],
    ])("treats %s as unavailable and keeps the text field", async (_name, result) => {
        mockLoad.mockResolvedValue({ data: SAVED });
        mockLoadModels.mockResolvedValue(result as never);
        renderForm();
        await screen.findByRole("heading", { name: "BYO LLM", level: 2 });
        await userEvent.click(screen.getByRole("button", { name: "Edit" }));

        await waitFor(() =>
            expect(screen.getByTestId("byo-model-hint")).toHaveTextContent(
                "The provider's model list is not available right now. Any model name still works.",
            ),
        );
        expect(screen.getByLabelText("Model").tagName).toBe("INPUT");
        expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    });

    it("keeps the text field when the list action rejects, without an unhandled rejection", async () => {
        const unhandled: unknown[] = [];
        const onUnhandled = (reason: unknown) => unhandled.push(reason);
        process.on("unhandledRejection", onUnhandled);
        try {
            mockLoad.mockResolvedValue({ data: SAVED });
            mockLoadModels.mockRejectedValue(new Error("transport failure"));
            renderForm();
            await screen.findByRole("heading", { name: "BYO LLM", level: 2 });
            await userEvent.click(screen.getByRole("button", { name: "Edit" }));
            await waitFor(() =>
                expect(screen.getByTestId("byo-model-hint")).toHaveTextContent(
                    "The provider's model list is not available right now.",
                ),
            );
            expect(screen.getByLabelText("Model").tagName).toBe("INPUT");
            await new Promise((r) => setTimeout(r, 20));
            expect(unhandled).toEqual([]);
        } finally {
            process.off("unhandledRejection", onUnhandled);
        }
    });

    it.each([
        ["a row with no id", { models: [{}], source: "live", reason: null }],
        ["empty and non-string ids", { models: [{ id: "" }, { id: 5 }, null], source: "live" }],
        ["a models field that is not a list", { models: "gpt-4o", source: "live" }],
        ["a malformed answer", { models: null }],
        [
            "a list the answer declares unavailable",
            { models: [{ id: "gpt-4o" }], source: "unavailable" },
        ],
    ])("treats %s as unavailable, not as a list", async (_name, data) => {
        mockLoad.mockResolvedValue({ data: SAVED });
        mockLoadModels.mockResolvedValue({ data } as never);
        renderForm();
        await screen.findByRole("heading", { name: "BYO LLM", level: 2 });
        await userEvent.click(screen.getByRole("button", { name: "Edit" }));

        await waitFor(() =>
            expect(screen.getByTestId("byo-model-hint")).toHaveTextContent(
                "The provider's model list is not available right now.",
            ),
        );
        expect(screen.getByLabelText("Model").tagName).toBe("INPUT");
    });

    it("keeps only valid distinct ids", async () => {
        mockLoad.mockResolvedValue({ data: SAVED });
        mockLoadModels.mockResolvedValue({
            data: {
                models: [{ id: 5 }, { id: "gpt-4o" }, {}, { id: "gpt-4o" }, { id: "o4-mini" }],
                source: "live",
                reason: null,
                fetched_at: null,
            },
        } as never);
        renderForm();
        await screen.findByRole("heading", { name: "BYO LLM", level: 2 });
        await userEvent.click(screen.getByRole("button", { name: "Edit" }));

        await waitFor(() => expect(optionValues()).toEqual(["gpt-4o", "o4-mini"]));
    });

    it("never writes a setting by itself while loading the list", async () => {
        mockLoad.mockResolvedValue({ data: SAVED });
        mockLoadModels.mockResolvedValue({ data: LIVE });
        renderForm();
        await screen.findByRole("heading", { name: "BYO LLM", level: 2 });
        await userEvent.click(screen.getByRole("button", { name: "Edit" }));
        await waitFor(() => expect(optionValues()).toEqual(["gpt-4o", "gpt-4o-mini"]));

        expect(mockSave).not.toHaveBeenCalled();
        expect(mockRemove).not.toHaveBeenCalled();
        expect(mockRunReadiness).not.toHaveBeenCalled();
    });

    it("gives the list read an abort signal and aborts it when the component unmounts", async () => {
        mockLoad.mockResolvedValue({ data: SAVED });
        const signals: AbortSignal[] = [];
        mockLoadModels.mockImplementation((signal) => {
            signals.push(signal);
            return new Promise(() => {});
        });
        const view = renderForm();
        await screen.findByRole("heading", { name: "BYO LLM", level: 2 });
        await waitFor(() => expect(signals.length).toBeGreaterThan(0));
        const last = signals[signals.length - 1];
        expect(last.aborted).toBe(false);
        view.unmount();
        expect(last.aborted).toBe(true);
    });

    it("reads the list again after a save", async () => {
        mockLoad.mockResolvedValue({ data: SAVED });
        mockLoadModels.mockResolvedValue({ data: LIVE });
        mockSave.mockResolvedValue({
            data: { ...SAVED, provider: "anthropic", model: "claude-x" },
        });
        renderForm();
        await screen.findByRole("heading", { name: "BYO LLM", level: 2 });
        await userEvent.click(screen.getByRole("button", { name: "Edit" }));
        await waitFor(() => expect(optionValues()).toEqual(["gpt-4o", "gpt-4o-mini"]));
        mockLoadModels.mockResolvedValue({ data: catalogBody("anthropic", ["claude-x"]) });

        await userEvent.selectOptions(screen.getByLabelText("Provider"), "anthropic");
        await userEvent.click(screen.getByRole("button", { name: "Save" }));
        await waitFor(() => expect(mockSave).toHaveBeenCalled());

        await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
        await waitFor(() => expect(optionValues()).toContain("claude-x"));
    });

    it("lets a save run while the list read is still pending", async () => {
        mockLoad.mockResolvedValue({ data: SAVED });
        mockLoadModels.mockReturnValue(new Promise(() => {}));
        mockSave.mockResolvedValue({ data: SAVED });
        renderForm();
        await screen.findByRole("heading", { name: "BYO LLM", level: 2 });
        await userEvent.click(screen.getByRole("button", { name: "Edit" }));
        await waitFor(() => expect(mockLoadModels).toHaveBeenCalled());

        await userEvent.click(screen.getByRole("button", { name: "Save" }));

        await waitFor(() => expect(mockSave).toHaveBeenCalled());
    });
});
