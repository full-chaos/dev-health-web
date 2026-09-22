import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
});
const authMock = vi.fn();
const previewOAuthConsentMock = vi.fn();

vi.mock("next/navigation", () => ({
    redirect: (url: string) => redirectMock(url),
}));
vi.mock("@/lib/auth", () => ({ auth: () => authMock() }));
vi.mock("@/lib/acr/service", () => ({
    previewOAuthConsent: (input: unknown) => previewOAuthConsentMock(input),
}));
vi.mock("@/components/acr/OAuthConsentForm", () => ({
    OAuthConsentForm: (props: {
        readonly handle?: string;
        readonly initialState?: string;
        readonly preview?: { readonly clientName: string };
    }) => (
        <div
            data-handle={props.handle}
            data-initial-state={props.initialState}
            data-preview-client={props.preview?.clientName}
            data-testid="oauth-consent-form"
        />
    ),
}));

import { AcrRuntimeError, acrRuntimeErrorCodes } from "@/lib/acr/errors";
import OAuthAuthorizePage from "./page";

const HANDLE = "A".repeat(43);

function searchParams(handle?: string): Promise<{ handle?: string }> {
    return Promise.resolve(handle === undefined ? {} : { handle });
}

describe("OAuthAuthorizePage", () => {
    beforeEach(() => {
        authMock.mockResolvedValue({
            access_token: "ops-token",
            user: { id: "user-1", org_id: "org-1", real_org_id: "org-1" },
        });
        previewOAuthConsentMock.mockResolvedValue({
            clientKind: "dynamic",
            clientName: "Claude Code",
            clientSelfAsserted: true,
            expiresAt: "2026-09-22T12:40:00Z",
            redirectOrigin: "http://localhost:53141",
            resource: "https://mcp.fullchaos.dev/mcp",
            scopes: ["context:read", "evidence:read"],
        });
    });

    afterEach(() => vi.clearAllMocks());

    it("renders the invalid state and skips auth entirely when the handle is missing", async () => {
        render(await OAuthAuthorizePage({ searchParams: searchParams(undefined) }));

        expect(screen.getByTestId("oauth-consent-form")).toHaveAttribute(
            "data-initial-state",
            "invalid",
        );
        expect(authMock).not.toHaveBeenCalled();
    });

    it("renders the invalid state when the handle does not match the expected shape", async () => {
        render(await OAuthAuthorizePage({ searchParams: searchParams("not-a-handle") }));

        expect(screen.getByTestId("oauth-consent-form")).toHaveAttribute(
            "data-initial-state",
            "invalid",
        );
        expect(authMock).not.toHaveBeenCalled();
    });

    it("redirects a signed-out user back to authorize with the handle preserved", async () => {
        authMock.mockResolvedValue(null);

        await expect(OAuthAuthorizePage({ searchParams: searchParams(HANDLE) })).rejects.toThrow(
            `NEXT_REDIRECT:/auth/signin?callbackUrl=${encodeURIComponent(`/acr/authorize?handle=${HANDLE}`)}`,
        );
        expect(previewOAuthConsentMock).not.toHaveBeenCalled();
    });

    it("renders the denied state while impersonating, without previewing", async () => {
        authMock.mockResolvedValue({
            access_token: "ops-token",
            user: { id: "user-1", org_id: "org-impersonated", real_org_id: "org-1" },
        });

        render(await OAuthAuthorizePage({ searchParams: searchParams(HANDLE) }));

        expect(screen.getByTestId("oauth-consent-form")).toHaveAttribute(
            "data-initial-state",
            "denied",
        );
        expect(previewOAuthConsentMock).not.toHaveBeenCalled();
    });

    it("renders the preview once signed in with a matching org", async () => {
        render(await OAuthAuthorizePage({ searchParams: searchParams(HANDLE) }));

        const form = screen.getByTestId("oauth-consent-form");
        expect(form).toHaveAttribute("data-handle", HANDLE);
        expect(form).toHaveAttribute("data-preview-client", "Claude Code");
        expect(form).not.toHaveAttribute("data-initial-state");
    });

    it.each([
        [acrRuntimeErrorCodes.expired, "expired"],
        [acrRuntimeErrorCodes.alreadyCompleted, "completed"],
        [acrRuntimeErrorCodes.invalidRequest, "invalid"],
        [acrRuntimeErrorCodes.unavailable, "unavailable"],
    ] as const)("renders the matching state when ACR reports %s", async (code, expectedState) => {
        previewOAuthConsentMock.mockRejectedValue(new AcrRuntimeError(code, "redacted"));

        render(await OAuthAuthorizePage({ searchParams: searchParams(HANDLE) }));

        expect(screen.getByTestId("oauth-consent-form")).toHaveAttribute(
            "data-initial-state",
            expectedState,
        );
    });
});
