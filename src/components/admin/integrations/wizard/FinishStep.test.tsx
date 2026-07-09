import { describe, expect, it, vi } from "vitest";
import { render, screen, userEvent } from "@/test/utils";

import { FinishStep } from "./FinishStep";

function renderFinishStep(overrides: Partial<React.ComponentProps<typeof FinishStep>> = {}) {
    const onFinishAction = vi.fn();
    render(
        <FinishStep
            providerLabel="Linear"
            credentialName="Production"
            authMethodLabel="API key"
            verified={true}
            isPending={false}
            submitted={false}
            onBackAction={vi.fn()}
            onFinishAction={onFinishAction}
            onDoneAction={vi.fn()}
            {...overrides}
        />,
    );
    return { onFinishAction };
}

describe("FinishStep", () => {
    it("disables Finish and shows a prompt when the credential has not been verified (CHAOS-2837 blocker 2)", async () => {
        const { onFinishAction } = renderFinishStep({ verified: false });

        const finishButton = screen.getByRole("button", { name: "Finish" });
        expect(finishButton).toBeDisabled();
        expect(
            screen.getByText(/go back and verify the connection before finishing/i),
        ).toBeInTheDocument();

        // Disabled buttons don't dispatch click handlers — the guard holds even
        // under a forced interaction attempt.
        await userEvent.click(finishButton);
        expect(onFinishAction).not.toHaveBeenCalled();
    });

    it("enables Finish once the credential has been verified", () => {
        renderFinishStep({ verified: true });

        expect(screen.getByRole("button", { name: "Finish" })).not.toBeDisabled();
        expect(
            screen.queryByText(/go back and verify the connection before finishing/i),
        ).not.toBeInTheDocument();
    });

    it("calls onFinishAction when Finish is clicked while verified", async () => {
        const { onFinishAction } = renderFinishStep({ verified: true });

        await userEvent.click(screen.getByRole("button", { name: "Finish" }));
        expect(onFinishAction).toHaveBeenCalledTimes(1);
    });

    it("shows the success state with a Create sync configuration link once submitted", () => {
        renderFinishStep({ submitted: true });

        expect(screen.getByRole("status")).toHaveTextContent(/Linear credential saved/i);
        expect(screen.getByRole("link", { name: "Create sync configuration" })).toHaveAttribute(
            "href",
            "/org/admin/sync/new",
        );
        expect(screen.queryByRole("button", { name: "Finish" })).not.toBeInTheDocument();
    });
});
