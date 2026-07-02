import { describe, expect, it, vi } from "vitest";
import { render, screen, userEvent } from "@/test/utils";
import { TokenRevealPanel } from "./TokenRevealPanel";

describe("TokenRevealPanel", () => {
    it("shows the plaintext token exactly once with the never-shown-again warning (D9)", () => {
        render(
            <TokenRevealPanel
                token="fcpush_abc123"
                name="CI runner"
                scopes={["schema:read", "ingest:write"]}
                examplesHref="/examples"
                onDismiss={vi.fn()}
            />,
        );
        expect(screen.getByText("fcpush_abc123")).toBeInTheDocument();
        expect(screen.getByText(/will not show it again/i)).toBeInTheDocument();
        expect(screen.getByText("schema:read")).toBeInTheDocument();
        expect(screen.getByText("ingest:write")).toBeInTheDocument();
    });

    it("copies the token to the clipboard on click", async () => {
        const user = userEvent.setup();
        const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
        render(
            <TokenRevealPanel
                token="fcpush_abc123"
                name="CI runner"
                scopes={["schema:read"]}
                examplesHref="/examples"
                onDismiss={vi.fn()}
            />,
        );
        await user.click(screen.getByRole("button", { name: "Copy" }));
        expect(writeText).toHaveBeenCalledWith("fcpush_abc123");
    });

    it("calls onDismiss when Done is clicked", async () => {
        const onDismiss = vi.fn();
        const user = userEvent.setup();
        render(
            <TokenRevealPanel
                token="fcpush_abc123"
                name="CI runner"
                scopes={["schema:read"]}
                examplesHref="/examples"
                onDismiss={onDismiss}
            />,
        );
        await user.click(screen.getByRole("button", { name: "Done" }));
        expect(onDismiss).toHaveBeenCalledOnce();
    });

    it("never logs the token to the console", () => {
        const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        render(
            <TokenRevealPanel
                token="fcpush_secret-value"
                name="CI runner"
                scopes={["schema:read"]}
                examplesHref="/examples"
                onDismiss={vi.fn()}
            />,
        );
        const allLoggedArgs = [...consoleSpy.mock.calls, ...errorSpy.mock.calls].flat();
        expect(allLoggedArgs.join(" ")).not.toContain("fcpush_secret-value");
        consoleSpy.mockRestore();
        errorSpy.mockRestore();
    });
});
