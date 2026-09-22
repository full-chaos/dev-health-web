import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OAuthConsentForm } from "./OAuthConsentForm";

const HANDLE = "A".repeat(43);
const PREVIEW = {
    clientKind: "dynamic",
    clientName: "Claude Code",
    clientSelfAsserted: true,
    expiresAt: "2026-09-22T12:40:00Z",
    redirectOrigin: "http://localhost:53141",
    resource: "https://mcp.fullchaos.dev/mcp",
    scopes: ["context:read", "evidence:read"],
};

const locationAssign = vi.fn();

describe("OAuthConsentForm", () => {
    beforeEach(() => {
        Object.defineProperty(window, "location", {
            configurable: true,
            value: { ...window.location, assign: locationAssign },
            writable: true,
        });
    });

    afterEach(() => {
        locationAssign.mockReset();
        vi.unstubAllGlobals();
    });

    it.each([
        ["denied", "Request not approved"],
        ["expired", "Link expired"],
        ["completed", "Already completed"],
        ["invalid", "Invalid request"],
        ["unavailable", "Temporarily unavailable"],
    ] as const)("Given a %s state, when rendered, then announces %s", (state, title) => {
        render(<OAuthConsentForm initialState={state} />);

        expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    });

    it("Given a preview, when rendered, then shows the client, redirect origin and requested access", () => {
        render(<OAuthConsentForm handle={HANDLE} preview={PREVIEW} />);

        expect(screen.getByRole("heading", { name: "Authorize application" })).toBeInTheDocument();
        expect(screen.getByText("Claude Code")).toBeVisible();
        expect(screen.getByText(/started this sign-in/i)).toBeVisible();
        expect(screen.getByText(/http:\/\/localhost:53141/)).toBeVisible();
        expect(screen.getByText("Read agent context")).toBeVisible();
        expect(screen.getByText("Read source evidence")).toBeVisible();
    });

    it("Given approval succeeds, when the server returns a safe redirect_url, then navigates to it unchanged", async () => {
        const redirectUrl = "http://localhost:53141/callback?code=abc&state=xyz&iss=acr";
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(
                new Response(JSON.stringify({ redirect_url: redirectUrl }), { status: 200 }),
            );
        vi.stubGlobal("fetch", fetchMock);

        render(<OAuthConsentForm handle={HANDLE} preview={PREVIEW} />);
        fireEvent.click(screen.getByRole("button", { name: "Approve" }));

        await screen.findByRole("heading", { name: "Returning to the application" });
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/acr/authorize",
            expect.objectContaining({
                body: JSON.stringify({
                    action: "approve",
                    handle: HANDLE,
                    repository_scopes: ["*"],
                }),
                method: "POST",
            }),
        );
        expect(locationAssign).toHaveBeenCalledWith(redirectUrl);
    });

    it("Given a deny click, when submitted, then sends deny without a repository grant", async () => {
        const fetchMock = vi.fn().mockResolvedValueOnce(
            new Response(
                JSON.stringify({
                    redirect_url: "http://localhost:53141/callback?error=access_denied",
                }),
                { status: 200 },
            ),
        );
        vi.stubGlobal("fetch", fetchMock);

        render(<OAuthConsentForm handle={HANDLE} preview={PREVIEW} />);
        fireEvent.click(screen.getByRole("button", { name: "Deny" }));

        await screen.findByRole("heading", { name: "Returning to the application" });
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/acr/authorize",
            expect.objectContaining({
                body: JSON.stringify({ action: "deny", handle: HANDLE }),
                method: "POST",
            }),
        );
    });

    it("Given a non-http redirect_url, when the server responds 200, then refuses to navigate and shows an error", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({ redirect_url: "javascript:alert(document.cookie)" }),
                    { status: 200 },
                ),
            );
        vi.stubGlobal("fetch", fetchMock);

        render(<OAuthConsentForm handle={HANDLE} preview={PREVIEW} />);
        fireEvent.click(screen.getByRole("button", { name: "Approve" }));

        await screen.findByRole("heading", { name: "Something went wrong" });
        expect(locationAssign).not.toHaveBeenCalled();
    });

    it("Given ACR reports the handle expired, when approving, then shows the expired state", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 410 }));
        vi.stubGlobal("fetch", fetchMock);

        render(<OAuthConsentForm handle={HANDLE} preview={PREVIEW} />);
        fireEvent.click(screen.getByRole("button", { name: "Approve" }));

        await screen.findByRole("heading", { name: "Link expired" });
        expect(locationAssign).not.toHaveBeenCalled();
    });

    it("Given ACR throttles the handle (429, Retry-After), when approving, then shows the wait time and keeps the buttons usable", async () => {
        const fetchMock = vi.fn().mockResolvedValueOnce(
            new Response(
                JSON.stringify({
                    error: { code: "rate_limited", message: "redacted", retryable: true },
                }),
                { headers: { "Retry-After": "42" }, status: 429 },
            ),
        );
        vi.stubGlobal("fetch", fetchMock);

        render(<OAuthConsentForm handle={HANDLE} preview={PREVIEW} />);
        fireEvent.click(screen.getByRole("button", { name: "Approve" }));

        await screen.findByRole("heading", { name: "Too many attempts" });
        expect(screen.getByText(/wait 42 seconds/i)).toBeVisible();
        expect(locationAssign).not.toHaveBeenCalled();
        // Stays interactive: this is a hiccup on submission, not a verdict.
        const approveButton = screen.getByRole("button", { name: "Approve" });
        const denyButton = screen.getByRole("button", { name: "Deny" });
        expect(approveButton).toBeEnabled();
        expect(denyButton).toBeEnabled();

        // And a retry can succeed without re-rendering the form.
        fetchMock.mockResolvedValueOnce(
            new Response(
                JSON.stringify({ redirect_url: "http://localhost:53141/callback?code=abc" }),
                { status: 200 },
            ),
        );
        fireEvent.click(approveButton);
        await screen.findByRole("heading", { name: "Returning to the application" });
    });

    it("Given ACR throttles with no Retry-After header, when approving, then falls back to a generic wait message", async () => {
        const fetchMock = vi.fn().mockResolvedValueOnce(
            new Response(JSON.stringify({ error: { code: "rate_limited", message: "redacted" } }), {
                status: 429,
            }),
        );
        vi.stubGlobal("fetch", fetchMock);

        render(<OAuthConsentForm handle={HANDLE} preview={PREVIEW} />);
        fireEvent.click(screen.getByRole("button", { name: "Approve" }));

        await screen.findByRole("heading", { name: "Too many attempts" });
        expect(screen.getByText("Too many attempts. Please wait, then try again.")).toBeVisible();
        expect(screen.getByRole("button", { name: "Approve" })).toBeEnabled();
    });

    it("Given ACR is temporarily unavailable (503), when approving, then shows a retryable state and keeps the buttons usable", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({ error: { code: "unavailable", message: "redacted" } }),
                    { status: 503 },
                ),
            );
        vi.stubGlobal("fetch", fetchMock);

        render(<OAuthConsentForm handle={HANDLE} preview={PREVIEW} />);
        fireEvent.click(screen.getByRole("button", { name: "Deny" }));

        await screen.findByRole("heading", { name: "Temporarily unavailable" });
        expect(
            screen.getByText("We could not reach the authorization service. You can try again."),
        ).toBeVisible();
        expect(locationAssign).not.toHaveBeenCalled();
        expect(screen.getByRole("button", { name: "Approve" })).toBeEnabled();
        expect(screen.getByRole("button", { name: "Deny" })).toBeEnabled();
    });
});
