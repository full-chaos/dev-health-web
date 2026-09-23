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
        ["invalid", "Code no longer valid"],
    ] as const)("Given a %s state, when rendered, then announces %s", (state, title) => {
        render(<DeviceApprovalForm initialState={state} />);

        expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    });

    it("Given an approved preview, when confirming, then approves all current and future organization repositories", async () => {
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

        render(<DeviceApprovalForm />);
        const verificationCode = screen.getByLabelText("Verification code");
        fireEvent.change(verificationCode, {
            target: { value: "EP23TUGG" },
        });
        expect(verificationCode).toBeValid();
        expect(verificationCode).not.toHaveAttribute("pattern");
        fireEvent.click(screen.getByRole("button", { name: "Preview request" }));

        await screen.findByRole("heading", { name: "Review device access" });
        expect(
            screen.getByText(/all current and future repositories in your organization/i),
        ).toBeVisible();

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
                    repository_scopes: ["*"],
                    user_code: "EP23TUGG",
                }),
                method: "POST",
            }),
        );
    });

    it("Given repository hints, when confirming, then does not narrow the organization-wide grant to analytics inventory", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({ repositoryHints: ["full-chaos/cataloged-repository"] }),
                    { status: 200 },
                ),
            )
            .mockResolvedValueOnce(
                new Response(JSON.stringify({ status: "approved" }), { status: 200 }),
            );
        vi.stubGlobal("fetch", fetchMock);

        render(<DeviceApprovalForm />);
        fireEvent.change(screen.getByLabelText("Verification code"), {
            target: { value: "EP23TUGG" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Preview request" }));

        await screen.findByRole("heading", { name: "Review device access" });
        expect(screen.queryByText("full-chaos/cataloged-repository")).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

        await screen.findByRole("heading", { name: "Approval complete" });
        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            "/api/acr/device",
            expect.objectContaining({
                body: JSON.stringify({
                    action: "approve",
                    repository_scopes: ["*"],
                    user_code: "EP23TUGG",
                }),
                method: "POST",
            }),
        );
    });

    it("Given a valid initialUserCode, when rendered, then prefills the verification code without sending any request", () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        render(<DeviceApprovalForm initialUserCode="EP23TUGG" />);

        const verificationCode = screen.getByLabelText("Verification code");
        expect(verificationCode).toHaveValue("EP23TUGG");
        expect(screen.getByRole("button", { name: "Preview request" })).toBeEnabled();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("Given a valid initialUserCode, when the typed fallback overwrites it and the form is submitted, then previews using the EDITED code, not the prefill", async () => {
        const fetchMock = vi.fn().mockResolvedValueOnce(
            new Response(JSON.stringify({ repositoryHints: ["full-chaos/platform"] }), {
                status: 200,
            }),
        );
        vi.stubGlobal("fetch", fetchMock);

        render(<DeviceApprovalForm initialUserCode="EP23TUGG" />);
        const verificationCode = screen.getByLabelText("Verification code");

        fireEvent.change(verificationCode, { target: { value: "ZZ234567" } });
        expect(verificationCode).toHaveValue("ZZ234567");

        fireEvent.click(screen.getByRole("button", { name: "Preview request" }));

        await screen.findByRole("heading", { name: "Review device access" });
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/acr/device",
            expect.objectContaining({
                body: JSON.stringify({ action: "preview", user_code: "ZZ234567" }),
                method: "POST",
            }),
        );
    });

    it("Given no initialUserCode, when rendered, then the verification code starts empty and the button starts disabled", () => {
        render(<DeviceApprovalForm />);

        const verificationCode = screen.getByLabelText("Verification code");
        expect(verificationCode).toHaveValue("");
        expect(screen.getByRole("button", { name: "Preview request" })).toBeDisabled();
    });

    it("Given a device code ACR no longer recognizes (invalid_request, e.g. never issued), when previewing, then shows a no-longer-valid state, not a silent reset", async () => {
        // acr's device-approval endpoint returns HTTP 400 invalid_request for
        // "no such device authorization", wrong-flow, AND expired alike (it
        // never emits 410) -- so a real unrecognized/expired code arrives at
        // the web layer as a bare 400, and the copy must not assert
        // "expired" as fact since the web layer cannot tell which one
        // actually happened.
        const fetchMock = vi.fn().mockResolvedValueOnce(
            new Response(JSON.stringify({ error: { code: "invalid_request", message: "" } }), {
                status: 400,
            }),
        );
        vi.stubGlobal("fetch", fetchMock);

        render(<DeviceApprovalForm />);
        const verificationCode = screen.getByLabelText("Verification code");
        fireEvent.change(verificationCode, {
            target: { value: "OOOOOOOO" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Preview request" }));

        await screen.findByRole("heading", { name: "Code no longer valid" });
        expect(
            screen.getByText(
                "This code is no longer valid — it may have expired or already been used. Return to your terminal and start again.",
            ),
        ).toBeVisible();
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/acr/device",
            expect.objectContaining({
                body: JSON.stringify({ action: "preview", user_code: "OOOOOOOO" }),
                method: "POST",
            }),
        );
    });

    it("Given a device code that expires BETWEEN a successful preview and Approve, when approving, then shows a no-longer-valid state, not a silent reset (CHAOS-6317)", async () => {
        // The reported prod shape: the code was still valid when the review
        // screen loaded (preview 200'd), but expired before the user clicked
        // Confirm -- acr's Approve call then 400s the same way Preview would.
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(
                new Response(JSON.stringify({ repositoryHints: ["full-chaos/platform"] }), {
                    status: 200,
                }),
            )
            .mockResolvedValueOnce(
                new Response(JSON.stringify({ error: { code: "invalid_request", message: "" } }), {
                    status: 400,
                }),
            );
        vi.stubGlobal("fetch", fetchMock);

        render(<DeviceApprovalForm initialUserCode="EP23TUGG" />);
        fireEvent.click(screen.getByRole("button", { name: "Preview request" }));
        await screen.findByRole("heading", { name: "Review device access" });

        fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

        await screen.findByRole("heading", { name: "Code no longer valid" });
        expect(
            screen.getByText(
                "This code is no longer valid — it may have expired or already been used. Return to your terminal and start again.",
            ),
        ).toBeVisible();
    });
});
