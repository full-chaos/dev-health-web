import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, userEvent } from "@/test/utils";

import { TokenInput } from "./TokenInput";

function TokenInputHarness({ initial = [] as string[] }) {
    const [value, setValue] = useState<string[]>(initial);
    return <TokenInput value={value} onChangeAction={setValue} ariaLabel="Tags" />;
}

describe("TokenInput", () => {
    it("renders existing tokens as chips with an accessible remove button each", () => {
        render(<TokenInput value={["alpha", "beta"]} onChangeAction={vi.fn()} ariaLabel="Tags" />);

        expect(screen.getByText("alpha")).toBeInTheDocument();
        expect(screen.getByText("beta")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Remove alpha" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Remove beta" })).toBeInTheDocument();
    });

    it("adds a trimmed token on Enter and clears the draft", async () => {
        const user = userEvent.setup();
        render(<TokenInputHarness />);

        await user.type(screen.getByLabelText("Tags"), "  alpha  {Enter}");

        expect(screen.getByText("alpha")).toBeInTheDocument();
        expect(screen.getByLabelText("Tags")).toHaveValue("");
    });

    it("adds a token on comma without requiring Enter", async () => {
        const user = userEvent.setup();
        render(<TokenInputHarness />);

        await user.type(screen.getByLabelText("Tags"), "alpha,");

        expect(screen.getByText("alpha")).toBeInTheDocument();
        expect(screen.getByLabelText("Tags")).toHaveValue("");
    });

    it("rejects a case-insensitive duplicate with visible feedback and no change", async () => {
        const onChangeAction = vi.fn();
        const user = userEvent.setup();
        render(<TokenInput value={["alpha"]} onChangeAction={onChangeAction} ariaLabel="Tags" />);

        await user.type(screen.getByLabelText("Tags"), "ALPHA{Enter}");

        expect(onChangeAction).not.toHaveBeenCalled();
        expect(screen.getByRole("status")).toHaveTextContent("Already added");
    });

    it("rejects an empty/whitespace-only draft on Enter", async () => {
        const onChangeAction = vi.fn();
        const user = userEvent.setup();
        render(<TokenInput value={[]} onChangeAction={onChangeAction} ariaLabel="Tags" />);

        await user.type(screen.getByLabelText("Tags"), "   {Enter}");

        expect(onChangeAction).not.toHaveBeenCalled();
    });

    it("splits pasted text on commas and whitespace into multiple tokens", () => {
        const onChangeAction = vi.fn();
        render(<TokenInput value={[]} onChangeAction={onChangeAction} ariaLabel="Tags" />);

        fireEvent.paste(screen.getByLabelText("Tags"), {
            clipboardData: { getData: () => "alpha, beta  gamma" },
        });

        expect(onChangeAction).toHaveBeenCalledWith(["alpha", "beta", "gamma"]);
    });

    it("drops empty entries produced by a leading/trailing separator paste, keeping valid tokens", () => {
        const onChangeAction = vi.fn();
        render(<TokenInput value={[]} onChangeAction={onChangeAction} ariaLabel="Tags" />);

        fireEvent.paste(screen.getByLabelText("Tags"), {
            clipboardData: { getData: () => ",alpha,beta," },
        });

        expect(onChangeAction).toHaveBeenCalledWith(["alpha", "beta"]);
        expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    it("removes exactly the clicked token via its remove button", async () => {
        const user = userEvent.setup();
        render(<TokenInputHarness initial={["alpha", "beta"]} />);

        await user.click(screen.getByRole("button", { name: "Remove alpha" }));

        expect(screen.queryByText("alpha")).not.toBeInTheDocument();
        expect(screen.getByText("beta")).toBeInTheDocument();
    });

    it("does not commit on Enter or comma while an IME composition is in progress", () => {
        const onChangeAction = vi.fn();
        render(<TokenInput value={[]} onChangeAction={onChangeAction} ariaLabel="Tags" />);
        const input = screen.getByLabelText("Tags");

        fireEvent.change(input, { target: { value: "\u30a2\u30eb\u30d5\u30a1" } });
        fireEvent.compositionStart(input);
        fireEvent.keyDown(input, { key: "Enter", isComposing: true });
        fireEvent.keyDown(input, { key: ",", isComposing: true });

        expect(onChangeAction).not.toHaveBeenCalled();
        expect(input).toHaveValue("\u30a2\u30eb\u30d5\u30a1");
    });

    it("commits normally on Enter once the IME composition has ended", () => {
        const onChangeAction = vi.fn();
        render(<TokenInput value={[]} onChangeAction={onChangeAction} ariaLabel="Tags" />);
        const input = screen.getByLabelText("Tags");

        fireEvent.change(input, { target: { value: "\u30a2\u30eb\u30d5\u30a1" } });
        fireEvent.compositionStart(input);
        fireEvent.compositionEnd(input);
        fireEvent.keyDown(input, { key: "Enter", isComposing: false });

        expect(onChangeAction).toHaveBeenCalledWith(["\u30a2\u30eb\u30d5\u30a1"]);
    });
});
