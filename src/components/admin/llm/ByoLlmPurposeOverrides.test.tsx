import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithToaster, screen, userEvent, waitFor } from "@/test/utils";
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

    it("saves a same-provider override without a key and sends the purpose", async () => {
        load.mockResolvedValue({ data: { provider: "anthropic", api_key: "sk-a…1234" } });
        save.mockResolvedValue({ data: { purpose: "explain", provider: "anthropic", model: "m" } });
        renderIt();
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
        await userEvent.click(await screen.findByRole("button", { name: "Use default" }));
        await waitFor(() => expect(remove).toHaveBeenCalledWith("investigate"));
    });
});
