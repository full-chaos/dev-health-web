import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderWithToaster, screen, userEvent, waitFor } from "@/test/utils";
import type { PromptCacheSetting } from "@/lib/admin/api/llm-settings";
import { notifyByoLlmConfigChanged } from "@/lib/admin/byoLlmConfigChanges";
import {
    ByoLlmPromptCacheToggle,
    PROMPT_CACHE_COST_NOTE,
    PROMPT_CACHE_DESCRIPTION,
    PROMPT_CACHE_TITLE,
    type ByoLlmPromptCacheToggleProps,
} from "./ByoLlmPromptCacheToggle";

const load = vi.fn<ByoLlmPromptCacheToggleProps["loadAction"]>();
const save = vi.fn<ByoLlmPromptCacheToggleProps["saveAction"]>();

function setting(overrides: Partial<PromptCacheSetting> = {}): PromptCacheSetting {
    return { enabled: false, configured: true, anthropic: true, ...overrides };
}

function renderIt() {
    return renderWithToaster(<ByoLlmPromptCacheToggle loadAction={load} saveAction={save} />);
}

describe("ByoLlmPromptCacheToggle", () => {
    beforeEach(() => {
        load.mockReset();
        save.mockReset();
    });

    it("renders nothing when no BYO configuration is saved", async () => {
        load.mockResolvedValue({ data: setting({ configured: false }) });
        renderIt();
        await waitFor(() => expect(load).toHaveBeenCalled());
        expect(screen.queryByText(PROMPT_CACHE_TITLE)).toBeNull();
    });

    it("renders nothing when the saved model is not on the anthropic provider", async () => {
        load.mockResolvedValue({ data: setting({ anthropic: false }) });
        renderIt();
        await waitFor(() => expect(load).toHaveBeenCalled());
        expect(screen.queryByText(PROMPT_CACHE_TITLE)).toBeNull();
    });

    it("renders nothing when the plan gate refuses the read", async () => {
        load.mockResolvedValue({ error: "Not licensed", status: 402 });
        renderIt();
        await waitFor(() => expect(load).toHaveBeenCalled());
        expect(screen.queryByText(PROMPT_CACHE_TITLE)).toBeNull();
    });

    it("shows a failed read with a retry that loads again", async () => {
        load.mockResolvedValueOnce({ error: "boom", status: 500 });
        load.mockResolvedValueOnce({ data: setting() });
        renderIt();
        await userEvent.click(await screen.findByRole("button", { name: /retry/i }));
        expect(await screen.findByTestId("prompt-cache-state")).toHaveTextContent("Off");
        expect(load).toHaveBeenCalledTimes(2);
    });

    it("reads off by default and names the Anthropic-only scope and the cost", async () => {
        load.mockResolvedValue({ data: setting() });
        renderIt();
        expect(await screen.findByText(PROMPT_CACHE_DESCRIPTION)).toBeInTheDocument();
        expect(screen.getByText(PROMPT_CACHE_COST_NOTE)).toBeInTheDocument();
        expect(PROMPT_CACHE_DESCRIPTION).toMatch(/Anthropic models only/);
        expect(PROMPT_CACHE_COST_NOTE).toMatch(/25% more/);
        expect(screen.getByTestId("prompt-cache-state")).toHaveTextContent("Off");
        expect(screen.getByRole("button", { name: "Turn on" })).toBeInTheDocument();
    });

    it("turns it on, then off, sending an explicit value each time", async () => {
        load.mockResolvedValue({ data: setting() });
        save.mockResolvedValueOnce({ data: setting({ enabled: true }) });
        save.mockResolvedValueOnce({ data: setting({ enabled: false }) });
        renderIt();
        await userEvent.click(await screen.findByRole("button", { name: "Turn on" }));
        expect(save).toHaveBeenLastCalledWith(true);
        expect(await screen.findByText("Prompt cache turned on")).toBeInTheDocument();
        await waitFor(() =>
            expect(screen.getByTestId("prompt-cache-state")).toHaveTextContent("On"),
        );

        await userEvent.click(screen.getByRole("button", { name: "Turn off" }));
        expect(save).toHaveBeenLastCalledWith(false);
        await waitFor(() =>
            expect(screen.getByTestId("prompt-cache-state")).toHaveTextContent("Off"),
        );
    });

    it("keeps the shown state and names the error when the save fails", async () => {
        load.mockResolvedValue({ data: setting() });
        save.mockResolvedValue({ error: "Could not save", status: 500 });
        renderIt();
        await userEvent.click(await screen.findByRole("button", { name: "Turn on" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("Could not save");
        expect(screen.getByTestId("prompt-cache-state")).toHaveTextContent("Off");
    });

    it("shows the reloaded state when a save is refused with 409", async () => {
        load.mockResolvedValueOnce({ data: setting() });
        load.mockResolvedValueOnce({ data: setting({ enabled: true }) });
        save.mockResolvedValue({ error: "The setting changed while saving", status: 409 });
        renderIt();
        await userEvent.click(await screen.findByRole("button", { name: "Turn on" }));
        await waitFor(() =>
            expect(screen.getByTestId("prompt-cache-state")).toHaveTextContent("On"),
        );
        expect(screen.getByRole("button", { name: "Turn off" })).toBeInTheDocument();
    });

    it("follows the saved config: it appears when an Anthropic model is saved and goes when the provider changes", async () => {
        load.mockResolvedValueOnce({ data: setting({ configured: false, anthropic: false }) });
        renderIt();
        await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
        expect(screen.queryByText(PROMPT_CACHE_TITLE)).toBeNull();

        load.mockResolvedValueOnce({ data: setting() });
        act(() => notifyByoLlmConfigChanged());
        expect(await screen.findByText(PROMPT_CACHE_TITLE)).toBeInTheDocument();

        load.mockResolvedValueOnce({ data: setting({ anthropic: false }) });
        act(() => notifyByoLlmConfigChanged());
        await waitFor(() => expect(screen.queryByText(PROMPT_CACHE_TITLE)).toBeNull());
        expect(load).toHaveBeenCalledTimes(3);
    });

    it("stops listening when it unmounts", async () => {
        load.mockResolvedValue({ data: setting() });
        const view = renderIt();
        await screen.findByText(PROMPT_CACHE_TITLE);
        view.unmount();
        notifyByoLlmConfigChanged();
        expect(load).toHaveBeenCalledTimes(1);
    });
});
