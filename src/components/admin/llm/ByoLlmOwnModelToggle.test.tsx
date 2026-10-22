import { beforeEach, describe, expect, it, vi } from "vitest";
import { SAVE_FAILED_MESSAGE } from "@/lib/readFailure";
import { renderWithToaster, screen, userEvent, waitFor } from "@/test/utils";
import type { OwnModelSetting } from "@/lib/admin/api/llm-settings";
import {
    ByoLlmOwnModelToggle,
    OWN_MODEL_DESCRIPTION,
    OWN_MODEL_DIAGNOSTICS_NOTE,
    OWN_MODEL_TITLE,
    type ByoLlmOwnModelToggleProps,
} from "./ByoLlmOwnModelToggle";

const load = vi.fn<ByoLlmOwnModelToggleProps["loadAction"]>();
const save = vi.fn<ByoLlmOwnModelToggleProps["saveAction"]>();

function setting(overrides: Partial<OwnModelSetting> = {}): OwnModelSetting {
    return { enabled: true, configured: true, ...overrides };
}

function renderIt() {
    return renderWithToaster(<ByoLlmOwnModelToggle loadAction={load} saveAction={save} />);
}

describe("ByoLlmOwnModelToggle", () => {
    beforeEach(() => {
        load.mockReset();
        save.mockReset();
    });

    it("renders nothing when no BYO configuration is saved", async () => {
        load.mockResolvedValue({ data: setting({ configured: false }) });
        renderIt();
        await waitFor(() => expect(load).toHaveBeenCalled());
        expect(screen.queryByText(OWN_MODEL_TITLE)).toBeNull();
    });

    it("renders nothing when the plan gate refuses the read", async () => {
        load.mockResolvedValue({ error: "Not licensed", status: 402 });
        renderIt();
        await waitFor(() => expect(load).toHaveBeenCalled());
        expect(screen.queryByText(OWN_MODEL_TITLE)).toBeNull();
    });

    it("renders no card, no retry and makes no further read when the member is refused with 403", async () => {
        load.mockResolvedValue({ error: "Forbidden", status: 403 });
        renderIt();
        await waitFor(() => expect(load).toHaveBeenCalled());
        await Promise.resolve();
        expect(screen.queryByText(OWN_MODEL_TITLE)).toBeNull();
        expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();
        expect(load).toHaveBeenCalledTimes(1);
    });

    it("shows a failed read with a retry that loads again", async () => {
        load.mockResolvedValueOnce({ error: "boom", status: 500 });
        load.mockResolvedValueOnce({ data: setting() });
        renderIt();
        await userEvent.click(await screen.findByRole("button", { name: /retry/i }));
        expect(await screen.findByTestId("own-model-state")).toHaveTextContent("On");
        expect(load).toHaveBeenCalledTimes(2);
    });

    it("says the saved config is kept and that the setup checks still use the saved key", async () => {
        load.mockResolvedValue({ data: setting() });
        renderIt();
        expect(await screen.findByText(OWN_MODEL_DESCRIPTION)).toBeInTheDocument();
        expect(screen.getByText(OWN_MODEL_DIAGNOSTICS_NOTE)).toBeInTheDocument();
        expect(OWN_MODEL_DESCRIPTION).toMatch(/without deleting it/);
        expect(OWN_MODEL_DESCRIPTION).toMatch(/platform model fallback/);
        expect(screen.getByTestId("ai-panel-own-model")).toHaveTextContent(
            "other than categorization",
        );
        expect(screen.getByTestId("ai-panel-own-model")).toHaveTextContent(
            "otherwise they are refused",
        );
        expect(OWN_MODEL_DIAGNOSTICS_NOTE).toMatch(/readiness check and the model list/);
        expect(screen.getByTestId("own-model-state")).toHaveTextContent("On");
    });

    it("shows a switch, not a Turn off button, reflecting the saved state", async () => {
        load.mockResolvedValue({ data: setting() });
        renderIt();
        expect(await screen.findByRole("switch", { name: OWN_MODEL_TITLE })).toHaveAttribute(
            "aria-checked",
            "true",
        );
        expect(screen.queryByRole("button", { name: /Turn (on|off)/ })).toBeNull();
    });

    it("turns it off, then on, sending an explicit value each time", async () => {
        load.mockResolvedValue({ data: setting() });
        save.mockResolvedValueOnce({ data: setting({ enabled: false }) });
        save.mockResolvedValueOnce({ data: setting({ enabled: true }) });
        renderIt();
        await userEvent.click(await screen.findByRole("switch", { name: OWN_MODEL_TITLE }));
        expect(save).toHaveBeenLastCalledWith(false);
        expect(await screen.findByText("Own model turned off")).toBeInTheDocument();
        await waitFor(() => expect(screen.getByTestId("own-model-state")).toHaveTextContent("Off"));

        await userEvent.click(screen.getByRole("switch", { name: OWN_MODEL_TITLE }));
        expect(save).toHaveBeenLastCalledWith(true);
        await waitFor(() => expect(screen.getByTestId("own-model-state")).toHaveTextContent("On"));
    });

    it("keeps the shown state and names the error when the save fails", async () => {
        load.mockResolvedValue({ data: setting() });
        save.mockResolvedValue({ error: "Backend: key vault exploded", status: 500 });
        renderIt();
        await userEvent.click(await screen.findByRole("switch", { name: OWN_MODEL_TITLE }));
        expect(await screen.findByRole("alert")).toHaveTextContent(SAVE_FAILED_MESSAGE);
        expect(screen.queryByText(/key vault exploded/)).toBeNull();
        expect(screen.getByTestId("own-model-state")).toHaveTextContent("On");
    });

    it("reloads when a save is refused with 409", async () => {
        load.mockResolvedValue({ data: setting() });
        save.mockResolvedValue({ error: "Nothing saved to turn off", status: 409 });
        renderIt();
        await userEvent.click(await screen.findByRole("switch", { name: OWN_MODEL_TITLE }));
        await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    });
});
