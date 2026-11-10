import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithToaster, screen, userEvent, waitFor } from "@/test/utils";
import { BYO_LLM_CONFIG_CHANGED } from "@/lib/admin/byoLlmConfigChanges";
import { ByoLlmPurposeOverrides, type ByoLlmPurposeOverridesProps } from "./ByoLlmPurposeOverrides";

const load = vi.fn<ByoLlmPurposeOverridesProps["loadSettingsAction"]>();
const save = vi.fn<ByoLlmPurposeOverridesProps["saveAction"]>();
const remove = vi.fn<ByoLlmPurposeOverridesProps["removeAction"]>();

function renderIt() {
    return renderWithToaster(
        <ByoLlmPurposeOverrides
            loadSettingsAction={load}
            saveAction={save}
            removeAction={remove}
        />,
    );
}

describe("ByoLlmPurposeOverrides", () => {
    beforeEach(() => {
        load.mockReset();
        save.mockReset();
        remove.mockReset();
    });

    it("renders nothing until a default is saved", async () => {
        load.mockResolvedValue({ data: {} });
        renderIt();
        await waitFor(() => expect(load).toHaveBeenCalled());
        expect(screen.queryByText("Models per purpose")).toBeNull();
    });

    it("shows Use default for each purpose and lists a stored override", async () => {
        load.mockResolvedValue({
            data: {
                provider: "anthropic",
                api_key: "sk-a…1234",
                purposes: {
                    explain: { purpose: "explain", provider: "anthropic", model: "small-model" },
                },
            },
        });
        renderIt();
        expect(await screen.findAllByText("Use default")).toHaveLength(2);
        expect(screen.getByText(/small-model/)).toBeInTheDocument();
        expect(screen.queryByText(/categoriz/i)).toBeNull();
    });

    it("hides the categorize row when the org has not opted in", async () => {
        load.mockResolvedValue({
            data: { provider: "anthropic", api_key: "sk-a…1234", categorize_byo: false },
        });
        renderIt();
        expect(await screen.findAllByText("Use default")).toHaveLength(2);
        expect(screen.queryByText("Categorization")).toBeNull();
    });

    it("shows the categorize row when opted in", async () => {
        load.mockResolvedValue({
            data: { provider: "anthropic", api_key: "sk-a…1234", categorize_byo: true },
        });
        renderIt();
        expect(await screen.findAllByText("Use default")).toHaveLength(3);
        expect(screen.getByText("Categorization")).toBeInTheDocument();
    });

    it("lists a stored categorize override with the Cloudflare provider label", async () => {
        load.mockResolvedValue({
            data: {
                provider: "anthropic",
                categorize_byo: true,
                purposes: {
                    categorize: {
                        purpose: "categorize",
                        provider: "clef",
                        model: "clef-flash",
                        base_url: "https://api.cloudflare.com/client/v4/accounts/a1/ai/run",
                    },
                },
            },
        });
        renderIt();
        expect(await screen.findByText("Cloudflare Workers AI · clef-flash")).toBeInTheDocument();
    });

    async function openCategorize() {
        load.mockResolvedValue({
            data: { provider: "anthropic", api_key: "sk-a…1234", categorize_byo: true },
        });
        renderIt();
        const buttons = await screen.findAllByRole("button", { name: "Set model" });
        await userEvent.click(buttons[2]);
    }

    it("offers Cloudflare and TypeSafe as categorize providers", async () => {
        await openCategorize();
        const select = screen.getByLabelText("Provider") as HTMLSelectElement;
        expect(select.disabled).toBe(false);
        expect(Array.from(select.options).map((o) => [o.value, o.textContent])).toEqual([
            ["clef", "Cloudflare Workers AI"],
            ["typesafe", "TypeSafe (jev)"],
        ]);
        expect(screen.queryByRole("option", { name: "OpenAI" })).toBeNull();
    });

    it("offers clef and clef-flash for the clef categorize model", async () => {
        await openCategorize();
        const select = screen.getByLabelText("Model") as HTMLSelectElement;
        expect(select.tagName).toBe("SELECT");
        expect(Array.from(select.options).map((o) => o.value)).toEqual(["clef", "clef-flash"]);
    });

    it("follows the provider: typesafe offers only jev-1.13.0 and hides the base URL", async () => {
        await openCategorize();
        await userEvent.selectOptions(screen.getByLabelText("Model"), "clef-flash");
        await userEvent.selectOptions(screen.getByLabelText("Provider"), "typesafe");
        const select = screen.getByLabelText("Model") as HTMLSelectElement;
        expect(Array.from(select.options).map((o) => o.value)).toEqual(["jev-1.13.0"]);
        expect(select.value).toBe("jev-1.13.0");
        expect(screen.queryByLabelText("Base URL")).toBeNull();
    });

    it("saves typesafe with its own key, the jev model and no base URL", async () => {
        await openCategorize();
        save.mockResolvedValue({
            data: { purpose: "categorize", provider: "typesafe", model: "jev-1.13.0" },
        });
        await userEvent.type(screen.getByLabelText("Base URL"), "https://x");
        await userEvent.selectOptions(screen.getByLabelText("Provider"), "typesafe");
        await userEvent.type(screen.getByLabelText("API Key"), "ts-key");
        await userEvent.click(screen.getByRole("button", { name: "Save" }));
        await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
        expect(save.mock.calls[0][0]).toEqual({
            purpose: "categorize",
            provider: "typesafe",
            model: "jev-1.13.0",
            api_key: "ts-key",
        });
    });

    it("lists a stored typesafe override with the TypeSafe label", async () => {
        load.mockResolvedValue({
            data: {
                provider: "anthropic",
                categorize_byo: true,
                purposes: {
                    categorize: {
                        purpose: "categorize",
                        provider: "typesafe",
                        model: "jev-1.13.0",
                    },
                },
            },
        });
        renderIt();
        expect(await screen.findByText("TypeSafe (jev) · jev-1.13.0")).toBeInTheDocument();
    });

    it("asks for a new key when the provider changes from the stored one", async () => {
        load.mockResolvedValue({
            data: {
                provider: "anthropic",
                categorize_byo: true,
                purposes: {
                    categorize: { purpose: "categorize", provider: "clef", model: "clef" },
                },
            },
        });
        renderIt();
        await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
        await userEvent.selectOptions(screen.getByLabelText("Provider"), "typesafe");
        await userEvent.click(screen.getByRole("button", { name: "Save" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("own API key");
        expect(save).not.toHaveBeenCalled();
    });

    it.each([
        ["clef", "clef", "typesafe"],
        ["typesafe", "jev-1.13.0", "clef"],
    ])(
        "drops a typed key when switching a stored categorize override from %s (%s) to %s",
        async (provider, model, next) => {
            load.mockResolvedValue({
                data: {
                    provider: "anthropic",
                    categorize_byo: true,
                    purposes: {
                        categorize: {
                            purpose: "categorize",
                            provider,
                            model,
                            api_key: "stored…1234",
                        },
                    },
                },
            });
            save.mockResolvedValue({
                data: {
                    purpose: "categorize",
                    provider: next,
                    model: next === "clef" ? "clef" : "jev-1.13.0",
                },
            });
            renderIt();
            await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
            await userEvent.type(screen.getByLabelText("API Key"), "old-provider-key");
            await userEvent.selectOptions(screen.getByLabelText("Provider"), next);
            await userEvent.click(screen.getByRole("button", { name: "Save" }));
            expect(save).not.toHaveBeenCalled();
            expect(await screen.findByRole("alert")).toHaveTextContent("own API key");
        },
    );

    it.each([
        ["clef", "typesafe"],
        ["typesafe", "clef"],
    ])(
        "drops a typed key when switching a new categorize override from %s to %s",
        async (provider, next) => {
            await openCategorize();
            save.mockResolvedValue({
                data: {
                    purpose: "categorize",
                    provider: next,
                    model: next === "clef" ? "clef" : "jev-1.13.0",
                },
            });
            await userEvent.selectOptions(screen.getByLabelText("Provider"), provider);
            await userEvent.type(screen.getByLabelText("API Key"), "old-provider-key");
            await userEvent.selectOptions(screen.getByLabelText("Provider"), next);
            await userEvent.click(screen.getByRole("button", { name: "Save" }));
            expect(save).not.toHaveBeenCalled();
            expect(await screen.findByRole("alert")).toHaveTextContent("own API key");
        },
    );

    it("keeps the stored key when the provider is unchanged", async () => {
        load.mockResolvedValue({
            data: {
                provider: "anthropic",
                categorize_byo: true,
                purposes: {
                    categorize: { purpose: "categorize", provider: "clef", model: "clef" },
                },
            },
        });
        save.mockResolvedValue({
            data: { purpose: "categorize", provider: "clef", model: "clef" },
        });
        renderIt();
        await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
        await userEvent.click(screen.getByRole("button", { name: "Save" }));
        await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    });

    it("saves the categorize override without categorize_byo", async () => {
        load.mockResolvedValue({
            data: { provider: "anthropic", api_key: "sk-a…1234", categorize_byo: true },
        });
        save.mockResolvedValue({
            data: { purpose: "categorize", provider: "clef", model: "clef" },
        });
        renderIt();
        const buttons = await screen.findAllByRole("button", { name: "Set model" });
        await userEvent.click(buttons[2]);
        await userEvent.selectOptions(screen.getByLabelText("Model"), "clef-flash");
        await userEvent.type(screen.getByLabelText("API Key"), "cf-token");
        await userEvent.type(
            screen.getByLabelText("Base URL"),
            "https://api.cloudflare.com/client/v4/accounts/a1/ai/run",
        );
        await userEvent.click(screen.getByRole("button", { name: "Save" }));
        await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
        const body = save.mock.calls[0][0];
        expect(body).toEqual({
            purpose: "categorize",
            provider: "clef",
            model: "clef-flash",
            api_key: "cf-token",
            base_url: "https://api.cloudflare.com/client/v4/accounts/a1/ai/run",
        });
        expect("categorize_byo" in body).toBe(false);
    });

    it("removes the categorize override", async () => {
        load.mockResolvedValue({
            data: {
                provider: "anthropic",
                categorize_byo: true,
                purposes: {
                    categorize: { purpose: "categorize", provider: "clef", model: "clef" },
                },
            },
        });
        remove.mockResolvedValue({ data: { deleted: true, purpose: "categorize" } });
        renderIt();
        await userEvent.click(await screen.findByRole("button", { name: "Use default" }));
        await waitFor(() => expect(remove).toHaveBeenCalledWith("categorize"));
    });

    it.each([
        ["categorize_byo_model_unsupported", /clef or clef-flash/],
        ["purpose_not_configurable", /opt in/i],
        ["invalid_base_url", /Cloudflare account/],
    ])("shows a fixed message for the clef refusal %s", async (code, text) => {
        load.mockResolvedValue({
            data: { provider: "anthropic", api_key: "sk-a…1234", categorize_byo: true },
        });
        save.mockResolvedValue({ error: "served text must not show", status: 400, code });
        renderIt();
        const buttons = await screen.findAllByRole("button", { name: "Set model" });
        await userEvent.click(buttons[2]);
        await userEvent.type(screen.getByLabelText("API Key"), "k");
        await userEvent.type(screen.getByLabelText("Base URL"), "https://x");
        await userEvent.click(screen.getByRole("button", { name: "Save" }));
        const alert = await screen.findByRole("alert");
        expect(alert).toHaveTextContent(text);
        expect(alert).not.toHaveTextContent("served text must not show");
    });

    it.each([
        ["categorize_byo_model_unsupported", /must be jev-1\.13\.0/],
        ["invalid_base_url", /TypeSafe takes no base URL/],
    ])("shows TypeSafe copy for the refusal %s", async (code, text) => {
        await openCategorize();
        save.mockResolvedValue({ error: "served text must not show", status: 400, code });
        await userEvent.selectOptions(screen.getByLabelText("Provider"), "typesafe");
        await userEvent.type(screen.getByLabelText("API Key"), "k");
        await userEvent.click(screen.getByRole("button", { name: "Save" }));
        const alert = await screen.findByRole("alert");
        expect(alert).toHaveTextContent(text);
        expect(alert).not.toHaveTextContent("served text must not show");
    });

    it("falls back to the served error for an unknown code", async () => {
        load.mockResolvedValue({ data: { provider: "anthropic", api_key: "sk-a…1234" } });
        save.mockResolvedValue({ error: "Could not be saved", status: 400, code: "other" });
        renderIt();
        const buttons = await screen.findAllByRole("button", { name: "Set model" });
        await userEvent.click(buttons[0]);
        await userEvent.type(screen.getByLabelText("Model"), "m");
        await userEvent.click(screen.getByRole("button", { name: "Save" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("Could not be saved");
    });

    it("saves a same-provider override without a key and sends the purpose", async () => {
        load.mockResolvedValue({ data: { provider: "anthropic", api_key: "sk-a…1234" } });
        save.mockResolvedValue({ data: { purpose: "explain", provider: "anthropic", model: "m" } });
        renderIt();
        const changed = vi.fn();
        window.addEventListener(BYO_LLM_CONFIG_CHANGED, changed);
        const buttons = await screen.findAllByRole("button", { name: "Set model" });
        await userEvent.click(buttons[1]);
        await userEvent.type(screen.getByLabelText("Model"), "small-model");
        await userEvent.click(screen.getByRole("button", { name: "Save" }));
        await waitFor(() =>
            expect(save).toHaveBeenCalledWith({
                purpose: "explain",
                provider: "anthropic",
                model: "small-model",
            }),
        );
        // The saved Anthropic model can change with an override: dependent cards read it again.
        await waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
        window.removeEventListener(BYO_LLM_CONFIG_CHANGED, changed);
    });

    it("requires a model and, for another provider, a key", async () => {
        load.mockResolvedValue({ data: { provider: "anthropic", api_key: "sk-a…1234" } });
        renderIt();
        const buttons = await screen.findAllByRole("button", { name: "Set model" });
        await userEvent.click(buttons[0]);
        await userEvent.click(screen.getByRole("button", { name: "Save" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("Enter a model");
        await userEvent.type(screen.getByLabelText("Model"), "x");
        await userEvent.selectOptions(screen.getByLabelText("Provider"), "openai");
        await userEvent.click(screen.getByRole("button", { name: "Save" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("own API key");
        expect(save).not.toHaveBeenCalled();
    });

    it("removes an override", async () => {
        load.mockResolvedValue({
            data: {
                provider: "anthropic",
                purposes: {
                    investigate: { purpose: "investigate", provider: "anthropic", model: "mid" },
                },
            },
        });
        remove.mockResolvedValue({ data: { deleted: true, purpose: "investigate" } });
        renderIt();
        const changed = vi.fn();
        window.addEventListener(BYO_LLM_CONFIG_CHANGED, changed);
        await userEvent.click(await screen.findByRole("button", { name: "Use default" }));
        await waitFor(() => expect(remove).toHaveBeenCalledWith("investigate"));
        await waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
        window.removeEventListener(BYO_LLM_CONFIG_CHANGED, changed);
    });
});
