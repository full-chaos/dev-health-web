import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithToaster, screen, userEvent, waitFor } from "@/test/utils";
import { BYO_LLM_CONFIG_CHANGED } from "@/lib/admin/byoLlmConfigChanges";
import {
    ByoLlmCategorizeOptIn,
    CATEGORIZE_OPT_IN_DESCRIPTION,
    CATEGORIZE_OPT_IN_TITLE,
    type ByoLlmCategorizeOptInProps,
} from "./ByoLlmCategorizeOptIn";

const load = vi.fn<ByoLlmCategorizeOptInProps["loadSettingsAction"]>();
const save = vi.fn<ByoLlmCategorizeOptInProps["saveAction"]>();

function renderIt() {
    return renderWithToaster(<ByoLlmCategorizeOptIn loadSettingsAction={load} saveAction={save} />);
}

const saved = { provider: "anthropic", model: "claude-x", api_key: "sk-a…1234" };

describe("ByoLlmCategorizeOptIn", () => {
    beforeEach(() => {
        load.mockReset();
        save.mockReset();
    });

    it("reads the opt-in from the settings (absent means off)", async () => {
        load.mockResolvedValue({ data: saved });
        renderIt();
        const toggle = await screen.findByRole("switch", { name: CATEGORIZE_OPT_IN_TITLE });
        expect(toggle).toHaveAttribute("aria-checked", "false");
    });

    it("shows on when the settings carry categorize_byo true", async () => {
        load.mockResolvedValue({ data: { ...saved, categorize_byo: true } });
        renderIt();
        const toggle = await screen.findByRole("switch", { name: CATEGORIZE_OPT_IN_TITLE });
        expect(toggle).toHaveAttribute("aria-checked", "true");
    });

    it("explains the platform model default and the own-provider billing", async () => {
        load.mockResolvedValue({ data: saved });
        renderIt();
        await screen.findByRole("switch", { name: CATEGORIZE_OPT_IN_TITLE });
        expect(CATEGORIZE_OPT_IN_DESCRIPTION).toMatch(/platform model/);
        expect(CATEGORIZE_OPT_IN_DESCRIPTION).toMatch(/own provider/);
        expect(screen.getByText(CATEGORIZE_OPT_IN_DESCRIPTION)).toBeInTheDocument();
    });

    it("turns on with the saved provider and model, without a key", async () => {
        load.mockResolvedValue({ data: saved });
        save.mockResolvedValue({ data: { ...saved, categorize_byo: true } });
        renderIt();
        const changed = vi.fn();
        window.addEventListener(BYO_LLM_CONFIG_CHANGED, changed);
        await userEvent.click(await screen.findByRole("switch", { name: CATEGORIZE_OPT_IN_TITLE }));
        await waitFor(() =>
            expect(save).toHaveBeenCalledWith({
                provider: "anthropic",
                model: "claude-x",
                categorize_byo: true,
            }),
        );
        await waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
        window.removeEventListener(BYO_LLM_CONFIG_CHANGED, changed);
    });

    it("turns off by sending categorize_byo false", async () => {
        load.mockResolvedValue({ data: { ...saved, categorize_byo: true } });
        save.mockResolvedValue({ data: { ...saved, categorize_byo: false } });
        renderIt();
        await userEvent.click(await screen.findByRole("switch", { name: CATEGORIZE_OPT_IN_TITLE }));
        await waitFor(() =>
            expect(save).toHaveBeenCalledWith({
                provider: "anthropic",
                model: "claude-x",
                categorize_byo: false,
            }),
        );
    });

    it("disables the switch until a default configuration is saved", async () => {
        load.mockResolvedValue({ data: {} });
        renderIt();
        const toggle = await screen.findByRole("switch", { name: CATEGORIZE_OPT_IN_TITLE });
        expect(toggle).toBeDisabled();
        expect(screen.getByText(/Save a default model first/)).toBeInTheDocument();
    });

    it("shows a fixed message and keeps the state when the save is refused", async () => {
        load.mockResolvedValue({ data: saved });
        save.mockResolvedValue({
            error: "served text",
            status: 400,
            code: "categorize_byo_unavailable",
        });
        renderIt();
        await userEvent.click(await screen.findByRole("switch", { name: CATEGORIZE_OPT_IN_TITLE }));
        const alert = await screen.findByRole("alert");
        expect(alert).not.toHaveTextContent("served text");
        expect(alert).toHaveTextContent(/not available/i);
        expect(screen.getByRole("switch", { name: CATEGORIZE_OPT_IN_TITLE })).toHaveAttribute(
            "aria-checked",
            "false",
        );
    });

    it("renders nothing when the org is gated", async () => {
        load.mockResolvedValue({ error: "x", status: 402 });
        renderIt();
        await waitFor(() => expect(load).toHaveBeenCalled());
        expect(screen.queryByText(CATEGORIZE_OPT_IN_TITLE)).toBeNull();
    });
});
