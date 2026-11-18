// CHAOS-14134: the device approval and consent pages state the repositories the credential will hold. A named reader
// sees the count and the keys, never the organization-wide text; `*` keeps it. A scope change between preview and
// approve is refused by the server (scope_changed_review_again) and the page shows the new set.
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DeviceApprovalForm } from "./DeviceApprovalForm";
import { OAuthConsentForm } from "./OAuthConsentForm";

const NAMED = ["acme/alpha", "acme/beta", "acme/gamma"] as const;
const NAMED_STATEMENT = {
    grantedRepositories: { kind: "repositories", repositories: NAMED },
    scopeFingerprint: "sha256:" + "a".repeat(64),
} as const;
const ORG_STATEMENT = {
    grantedRepositories: { kind: "organization" },
    scopeFingerprint: "organization",
} as const;
const ORG_TEXT = /all current and future repositories/i;
const HANDLE = "A".repeat(43);
const PREVIEW = {
    clientKind: "dynamic",
    clientName: "Claude Code",
    clientSelfAsserted: true,
    expiresAt: "2026-11-18T23:00:00Z",
    redirectOrigin: "http://localhost:53141",
    resource: "https://mcp.example.test/mcp",
    scopes: ["context:read", "evidence:read"],
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const scopeChanged = () =>
    json(
        {
            error: {
                code: "scope_changed_review_again",
                message: "redacted",
                retryable: false,
            },
        },
        409,
    );

async function previewDevice(): Promise<void> {
    render(<DeviceApprovalForm />);
    fireEvent.change(screen.getByLabelText("Verification code"), {
        target: { value: "EP23TUGG" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview request" }));
    await screen.findByRole("heading", { name: "Review device access" });
}

function bodyOf(fetchMock: ReturnType<typeof vi.fn>, call: number): Record<string, unknown> {
    return JSON.parse(String((fetchMock.mock.calls[call]?.[1] as RequestInit).body)) as Record<
        string,
        unknown
    >;
}

afterEach(() => vi.unstubAllGlobals());

describe("DeviceApprovalForm states the issued repositories", () => {
    it("Given a named reader's preview (3 keys), when reviewing, then the page shows 3 repositories and their keys, not the organization text", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValueOnce(json({ ...NAMED_STATEMENT, repositoryHints: [] })),
        );
        await previewDevice();

        expect(screen.getByRole("heading", { name: "3 repositories" })).toBeInTheDocument();
        expect(screen.queryByText("All organization repositories")).toBeNull();
        expect(screen.queryByText(ORG_TEXT)).toBeNull();
        expect(screen.getByText(/these 3 repositories in your organization only/i)).toBeVisible();
        const list = screen.getByRole("list", { name: "Granted repositories" });
        expect(
            within(list)
                .getAllByRole("listitem")
                .map((item) => item.textContent),
        ).toEqual([...NAMED]);
        expect(screen.getByText("Review the access requested for this device.")).toBeVisible();
    });

    it("Given a named reader, when confirming, then the fingerprint is sent and the result states the approved count, not the organization text", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(json({ ...NAMED_STATEMENT, repositoryHints: [] }))
            .mockResolvedValueOnce(
                json({
                    status: "approved",
                    grantedRepositories: NAMED_STATEMENT.grantedRepositories,
                }),
            );
        vi.stubGlobal("fetch", fetchMock);
        await previewDevice();
        fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

        expect(await screen.findByRole("heading", { name: "Approval complete" })).toBeVisible();
        expect(
            screen.getByText(/Access to 3 repositories in your organization is approved/),
        ).toBeVisible();
        expect(screen.queryByText(ORG_TEXT)).toBeNull();
        expect(bodyOf(fetchMock, 1)).toEqual({
            action: "approve",
            repository_scopes: ["*"],
            scope_fingerprint: NAMED_STATEMENT.scopeFingerprint,
            user_code: "EP23TUGG",
        });
    });

    it("Given an org-wide reader, when reviewing and confirming, then the organization text shows", async () => {
        vi.stubGlobal(
            "fetch",
            vi
                .fn()
                .mockResolvedValueOnce(json({ ...ORG_STATEMENT, repositoryHints: [] }))
                .mockResolvedValueOnce(
                    json({ status: "approved", grantedRepositories: { kind: "organization" } }),
                ),
        );
        await previewDevice();
        expect(
            screen.getByRole("heading", { name: "All organization repositories" }),
        ).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
        expect(await screen.findByRole("heading", { name: "Approval complete" })).toBeVisible();
        expect(screen.getByText(ORG_TEXT)).toBeVisible();
    });

    it("Given the server refuses scope_changed_review_again, when confirming, then the page previews again and shows the new set with the reason", async () => {
        const changed = {
            grantedRepositories: { kind: "repositories", repositories: ["acme/alpha"] },
            scopeFingerprint: "sha256:" + "b".repeat(64),
        };
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(json({ ...NAMED_STATEMENT, repositoryHints: [] }))
            .mockResolvedValueOnce(scopeChanged())
            .mockResolvedValueOnce(json({ ...changed, repositoryHints: [] }));
        vi.stubGlobal("fetch", fetchMock);
        await previewDevice();
        fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

        expect(await screen.findByRole("heading", { name: "1 repository" })).toBeInTheDocument();
        expect(screen.getByText(/repositories this approval covers changed/i)).toBeVisible();
        expect(screen.getByRole("heading", { name: "Review device access" })).toBeVisible();
        expect(bodyOf(fetchMock, 2)).toEqual({ action: "preview", user_code: "EP23TUGG" });
    });

    it("Given a preview answer with no repository statement, when previewing, then the page does not claim any scope", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json({ repositoryHints: [] })));
        render(<DeviceApprovalForm />);
        fireEvent.change(screen.getByLabelText("Verification code"), {
            target: { value: "EP23TUGG" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Preview request" }));

        expect(await screen.findByText("We could not preview this request.")).toBeVisible();
        expect(screen.queryByText("All organization repositories")).toBeNull();
        expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull();
    });
});

describe("OAuthConsentForm states the issued repositories", () => {
    const locationAssign = vi.fn();
    beforeEach(() => {
        Object.defineProperty(window, "location", {
            configurable: true,
            value: { ...window.location, assign: locationAssign },
        });
        locationAssign.mockReset();
    });

    it("Given a named reader, when reviewing, then the page shows 3 repositories and their keys, not the organization text", () => {
        render(<OAuthConsentForm {...NAMED_STATEMENT} handle={HANDLE} preview={PREVIEW} />);

        expect(screen.getByRole("heading", { name: "3 repositories" })).toBeInTheDocument();
        expect(screen.queryByText("All organization repositories")).toBeNull();
        expect(screen.queryByText(ORG_TEXT)).toBeNull();
        const list = screen.getByRole("list", { name: "Granted repositories" });
        expect(
            within(list)
                .getAllByRole("listitem")
                .map((item) => item.textContent),
        ).toEqual([...NAMED]);
    });

    it("Given an org-wide reader, when reviewing, then the organization text shows", () => {
        render(<OAuthConsentForm {...ORG_STATEMENT} handle={HANDLE} preview={PREVIEW} />);

        expect(
            screen.getByRole("heading", { name: "All organization repositories" }),
        ).toBeInTheDocument();
        expect(screen.getByText(ORG_TEXT)).toBeVisible();
    });

    it("Given a named reader, when approving, then the fingerprint is sent", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(json({ redirect_url: "http://localhost:53141/cb?code=c" }));
        vi.stubGlobal("fetch", fetchMock);
        render(<OAuthConsentForm {...NAMED_STATEMENT} handle={HANDLE} preview={PREVIEW} />);
        fireEvent.click(screen.getByRole("button", { name: "Approve" }));

        await vi.waitFor(() => expect(locationAssign).toHaveBeenCalled());
        expect(bodyOf(fetchMock, 0)).toEqual({
            action: "approve",
            handle: HANDLE,
            repository_scopes: ["*"],
            scope_fingerprint: NAMED_STATEMENT.scopeFingerprint,
        });
    });

    it("Given the server refuses scope_changed_review_again, when approving, then the page previews again and shows the new set with the reason", async () => {
        const changed = {
            ...PREVIEW,
            grantedRepositories: { kind: "repositories", repositories: NAMED.slice(0, 2) },
            scopeFingerprint: "sha256:" + "c".repeat(64),
        };
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(scopeChanged())
            .mockResolvedValueOnce(json(changed));
        vi.stubGlobal("fetch", fetchMock);
        render(<OAuthConsentForm {...NAMED_STATEMENT} handle={HANDLE} preview={PREVIEW} />);
        fireEvent.click(screen.getByRole("button", { name: "Approve" }));

        expect(await screen.findByRole("heading", { name: "2 repositories" })).toBeInTheDocument();
        expect(screen.getByText(/repositories this approval covers changed/i)).toBeVisible();
        expect(screen.getByRole("button", { name: "Approve" })).toBeEnabled();
        expect(bodyOf(fetchMock, 1)).toEqual({ action: "preview", handle: HANDLE });
        expect(locationAssign).not.toHaveBeenCalled();
    });
});
