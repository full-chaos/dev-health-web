import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DeviceApprovalForm } from "./DeviceApprovalForm";

afterEach(() => vi.unstubAllGlobals());

describe("DeviceApprovalForm", () => {
    it.each([
        ["pending", "Approve device access"],
        ["success", "Approval complete"],
        ["denied", "Request not approved"],
        ["expired", "Code expired"],
    ] as const)("Given a %s state, when rendered, then announces %s", (state, title) => {
        render(<DeviceApprovalForm initialState={state} repositories={["full-chaos/platform"]} />);

        expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    });

    it("Given no selected repository, when confirming, then prevents an unbounded approval request", () => {
        render(<DeviceApprovalForm repositories={["full-chaos/platform"]} />);
        fireEvent.change(screen.getByLabelText("Verification code"), {
            target: { value: "ABCD2345" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

        expect(screen.getByRole("status")).toHaveTextContent("Select at least one repository");
    });
});
