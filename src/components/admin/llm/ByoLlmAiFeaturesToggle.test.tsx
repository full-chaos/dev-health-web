import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithToaster, screen, userEvent, waitFor } from "@/test/utils";
import { SAVE_FAILED_MESSAGE } from "@/lib/readFailure";
import type { ServiceModelSetting } from "@/lib/admin/api/llm-settings";
import {
    AI_FEATURES_DESCRIPTION,
    AI_FEATURES_MANAGED_NOTE,
    AI_FEATURES_TITLE,
    ByoLlmAiFeaturesToggle,
    type ByoLlmAiFeaturesToggleProps,
} from "./ByoLlmAiFeaturesToggle";

const load = vi.fn<ByoLlmAiFeaturesToggleProps["loadAction"]>();
const save = vi.fn<ByoLlmAiFeaturesToggleProps["saveAction"]>();

function setting(overrides: Partial<ServiceModelSetting> = {}): ServiceModelSetting {
    return {
        feature: "acr_service_model",
        enabled: false,
        eligible: true,
        ineligible_reason: null,
        control: "none",
        override: null,
        required_tier: "team",
        current_tier: "team",
        ...overrides,
    };
}

function renderIt() {
    return renderWithToaster(<ByoLlmAiFeaturesToggle loadAction={load} saveAction={save} />);
}

describe("ByoLlmAiFeaturesToggle", () => {
    beforeEach(() => {
        load.mockReset();
        save.mockReset();
    });

    it("renders nothing for an org that is not eligible", async () => {
        load.mockResolvedValue({
            data: setting({ eligible: false, ineligible_reason: "tier_required" }),
        });
        renderIt();
        await waitFor(() => expect(load).toHaveBeenCalled());
        expect(screen.queryByText("ACR AI features")).toBeNull();
    });

    it("renders nothing when the plan gate refuses the read", async () => {
        load.mockResolvedValue({ error: "Not licensed", status: 402 });
        renderIt();
        await waitFor(() => expect(load).toHaveBeenCalled());
        expect(screen.queryByText("ACR AI features")).toBeNull();
    });

    it("explains what off and on mean and never promises the platform LLM", async () => {
        load.mockResolvedValue({ data: setting() });
        renderIt();
        expect(await screen.findByText(AI_FEATURES_DESCRIPTION)).toBeInTheDocument();
        expect(screen.getByText(/run on your saved BYO model/)).toBeInTheDocument();
        expect(screen.queryByText(/platform (LLM|model) (when|if) no/i)).toBeNull();
        expect(screen.getByTestId("ai-features-state")).toHaveTextContent("Off");
    });

    it("turns it on, then off, sending an explicit value each time", async () => {
        load.mockResolvedValue({ data: setting() });
        save.mockResolvedValueOnce({
            data: setting({ enabled: true, control: "self_service", override: true }),
        });
        save.mockResolvedValueOnce({
            data: setting({ enabled: false, control: "self_service", override: false }),
        });
        renderIt();
        await userEvent.click(await screen.findByRole("switch", { name: AI_FEATURES_TITLE }));
        expect(save).toHaveBeenLastCalledWith(true);
        expect(await screen.findByTestId("ai-features-state")).toHaveTextContent("On");

        await userEvent.click(screen.getByRole("switch", { name: AI_FEATURES_TITLE }));
        expect(save).toHaveBeenLastCalledWith(false);
        await waitFor(() =>
            expect(screen.getByTestId("ai-features-state")).toHaveTextContent("Off"),
        );
    });

    it("shows a managed setting read-only, with no toggle", async () => {
        load.mockResolvedValue({
            data: setting({ enabled: true, control: "managed", override: true }),
        });
        renderIt();
        expect(await screen.findByText(AI_FEATURES_MANAGED_NOTE)).toBeInTheDocument();
        expect(screen.getByTestId("ai-features-state")).toHaveTextContent("On");
        expect(screen.queryByRole("switch")).toBeNull();
    });

    it("shows the refusal and reloads when billing took the setting over (409)", async () => {
        load.mockResolvedValueOnce({ data: setting({ enabled: true, control: "self_service" }) });
        load.mockResolvedValueOnce({ data: setting({ enabled: true, control: "managed" }) });
        save.mockResolvedValue({ error: AI_FEATURES_MANAGED_NOTE, status: 409 });
        renderIt();
        await userEvent.click(await screen.findByRole("switch", { name: AI_FEATURES_TITLE }));
        expect(await screen.findByRole("alert")).toHaveTextContent(AI_FEATURES_MANAGED_NOTE);
        await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
        expect(screen.queryByRole("switch")).toBeNull();
    });

    it("renders the fixed message, never backend text, when a save fails", async () => {
        load.mockResolvedValue({ data: setting({ enabled: true, control: "self_service" }) });
        save.mockResolvedValue({ error: "Backend: key vault exploded", status: 500 });
        renderIt();
        await userEvent.click(await screen.findByRole("switch", { name: AI_FEATURES_TITLE }));
        expect(await screen.findByRole("alert")).toHaveTextContent(SAVE_FAILED_MESSAGE);
        expect(screen.queryByText(/key vault exploded/)).toBeNull();
    });

    it("offers a retry when the read fails", async () => {
        load.mockResolvedValue({ error: "boom", status: 500 });
        renderIt();
        expect(await screen.findByRole("button", { name: "Retry" })).toBeInTheDocument();
    });
});
