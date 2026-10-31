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

    it("offers only clef and clef-flash for the categorize model", async () => {
        load.mockResolvedValue({
            data: { provider: "anthropic", api_key: "sk-a…1234", categorize_byo: true },
        });
        renderIt();
        const buttons = await screen.findAllByRole("button", { name: "Set model" });
        await userEvent.click(buttons[2]);
        const select = screen.getByLabelText("Model") as HTMLSelectElement;
        expect(select.tagName).toBe("SELECT");
        expect(Array.from(select.options).map((o) => o.value)).toEqual(["clef", "clef-flash"]);
        expect(screen.queryByRole("option", { name: "OpenAI" })).toBeNull();
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
    ])("shows a fixed message for the refusal %s", async (code, text) => {
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
