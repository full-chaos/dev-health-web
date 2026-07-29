import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DeviceApprovalForm } from "./DeviceApprovalForm";

afterEach(() => vi.unstubAllGlobals());

describe("DeviceApprovalForm", () => {
    it.each([
        ["pending", "Approve device access"],
        ["review", "Review device access"],
        ["success", "Approval complete"],
        ["denied", "Request not approved"],
        ["expired", "Code expired"],
    ] as const)("Given a %s state, when rendered, then announces %s", (state, title) => {
        render(<DeviceApprovalForm initialState={state} repositories={["full-chaos/platform"]} />);

        expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    });

    it("Given an approved preview, when confirming, then sends the bounded selected repositories in a fresh request", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(
                new Response(JSON.stringify({ repositoryHints: ["full-chaos/platform"] }), {
                    status: 200,
                }),
            )
            .mockResolvedValueOnce(
                new Response(JSON.stringify({ status: "approved" }), { status: 200 }),
            );
        vi.stubGlobal("fetch", fetchMock);

        render(<DeviceApprovalForm repositories={["full-chaos/platform", "full-chaos/private"]} />);
        const verificationCode = screen.getByLabelText("Verification code");
        fireEvent.change(verificationCode, {
            target: { value: "EP23TUGG" },
        });
        expect(verificationCode).toBeValid();
        expect(verificationCode).not.toHaveAttribute("pattern");
        fireEvent.click(screen.getByRole("button", { name: "Preview request" }));

        await screen.findByRole("heading", { name: "Review device access" });
        expect(screen.getByLabelText("full-chaos/platform")).toBeChecked();
        expect(screen.queryByLabelText("full-chaos/private")).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

        await screen.findByRole("heading", { name: "Approval complete" });
        expect(fetchMock).toHaveBeenNthCalledWith(
            1,
            "/api/acr/device",
            expect.objectContaining({
                body: JSON.stringify({ action: "preview", user_code: "EP23TUGG" }),
                method: "POST",
            }),
        );
        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            "/api/acr/device",
            expect.objectContaining({
                body: JSON.stringify({
                    action: "approve",
                    repository_scopes: ["full-chaos/platform"],
                    user_code: "EP23TUGG",
                }),
                method: "POST",
            }),
        );
    });

    it("Given a preview with no available repositories, when rendered, then prevents an unbounded approval request", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(
                new Response(JSON.stringify({ repositoryHints: [] }), { status: 200 }),
            );
        vi.stubGlobal("fetch", fetchMock);

        render(<DeviceApprovalForm repositories={["full-chaos/platform"]} />);
        fireEvent.change(screen.getByLabelText("Verification code"), {
            target: { value: "ABCD2345" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Preview request" }));

        await screen.findByText("No authorized repositories match this request.");
        expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("Given a malformed eight-character code, when ACR rejects it, then shows the rejection", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 400 }));
        vi.stubGlobal("fetch", fetchMock);

        render(<DeviceApprovalForm repositories={["full-chaos/platform"]} />);
        const verificationCode = screen.getByLabelText("Verification code");
        fireEvent.change(verificationCode, {
            target: { value: "OOOOOOOO" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Preview request" }));

        await screen.findByText("We could not preview this request.");
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/acr/device",
            expect.objectContaining({
                body: JSON.stringify({ action: "preview", user_code: "OOOOOOOO" }),
                method: "POST",
            }),
        );
    });
});
