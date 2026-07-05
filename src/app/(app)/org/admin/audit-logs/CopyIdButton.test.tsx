import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, userEvent } from "@/test/utils";
import { CopyIdButton } from "./CopyIdButton";

let user: ReturnType<typeof userEvent.setup>;
let writeText: ReturnType<typeof vi.spyOn>;

describe("CopyIdButton", () => {
    beforeEach(() => {
        // userEvent.setup() installs its own jsdom-friendly clipboard stub
        // (navigator.clipboard) the first time it runs, so the spy must be
        // attached to that stub afterwards rather than pre-defining the
        // property ourselves.
        user = userEvent.setup();
        writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    });
    afterEach(() => cleanup());
    it("renders the copy affordance using the CTA registry label", () => {
        render(<CopyIdButton value="entity-123" label="resource ID" />);
        expect(screen.getByRole("button", { name: /copy resource id/i })).toBeInTheDocument();
    });

    it("copies the given value to the clipboard on click", async () => {
        render(<CopyIdButton value="entity-123" label="resource ID" />);
        await user.click(screen.getByRole("button", { name: /copy resource id/i }));

        expect(writeText).toHaveBeenCalledWith("entity-123");
    });

    it("shows a copied acknowledgement after a successful copy", async () => {
        render(<CopyIdButton value="entity-123" label="actor ID" />);
        const button = screen.getByRole("button", { name: /copy actor id/i });
        await user.click(button);

        expect(button).toHaveAttribute("title", "Copied to clipboard");
    });

    it("stops the click from bubbling to a parent row handler", async () => {
        const onRowClick = vi.fn();

        render(
            <div onClick={onRowClick}>
                <CopyIdButton value="entity-123" label="resource ID" />
            </div>,
        );
        await user.click(screen.getByRole("button", { name: /copy resource id/i }));

        expect(onRowClick).not.toHaveBeenCalled();
    });
});
