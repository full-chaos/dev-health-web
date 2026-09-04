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

    it("Given a malformed eight-character code, when ACR rejects it, then shows the rejection", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 400 }));
        vi.stubGlobal("fetch", fetchMock);

        render(<DeviceApprovalForm />);
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
