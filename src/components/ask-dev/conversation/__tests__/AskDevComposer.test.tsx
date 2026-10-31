import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AskDevComposer, COMPOSER_COPY } from "../AskDevComposer";

function renderComposer(props: Partial<Parameters<typeof AskDevComposer>[0]> = {}) {
    const onSubmit = vi.fn<(question: string) => boolean>(() => true);
    const onCancel = vi.fn();
    render(
        <AskDevComposer
            inFlight={false}
            ready
            onSubmit={onSubmit}
            onCancel={onCancel}
            {...props}
        />,
    );
    return {
        onSubmit: (props.onSubmit as typeof onSubmit | undefined) ?? onSubmit,
        onCancel,
        input: screen.getByRole("textbox", { name: COMPOSER_COPY.label }),
    };
}

describe("AskDevComposer", () => {
    it("sends on Enter and clears the draft once the store took it", async () => {
        const { onSubmit, input } = renderComposer();
        await userEvent.type(input, "Which projects are at risk?{Enter}");
        expect(onSubmit).toHaveBeenCalledExactlyOnceWith("Which projects are at risk?");
        expect(input).toHaveValue("");
    });

    it("starts a new line on Shift+Enter and sends nothing", async () => {
        const { onSubmit, input } = renderComposer();
        await userEvent.type(input, "First line{Shift>}{Enter}{/Shift}second");
        expect(onSubmit).not.toHaveBeenCalled();
        expect(input).toHaveValue("First line\nsecond");
    });

    it("keeps the draft when the store refused it", async () => {
        const onSubmit = vi.fn(() => false);
        const { input } = renderComposer({ onSubmit });
        await userEvent.type(input, "Which projects are at risk?{Enter}");
        expect(onSubmit).toHaveBeenCalledOnce();
        expect(input).toHaveValue("Which projects are at risk?");
    });

    it("cannot send a blank question", async () => {
        const { input } = renderComposer();
        expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
        await userEvent.type(input, "   ");
        expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    });

    it("while a run is in flight keeps Send in place, disabled, and offers Stop beside it", async () => {
        const { onCancel } = renderComposer({ inFlight: true });
        expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
        await userEvent.click(screen.getByRole("button", { name: "Stop" }));
        expect(onCancel).toHaveBeenCalledOnce();
    });

    it("sends nothing while signed out, and says so", () => {
        const { input } = renderComposer({ ready: false });
        expect(input).toBeDisabled();
        expect(screen.getByText(COMPOSER_COPY.signedOut)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    });
});
