import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
    auth: vi.fn(),
    updateServerSession: vi.fn(),
    forgetOwnImpersonationStatus: vi.fn(),
}));
vi.mock("@/lib/origin", () => ({ getBackendUrl: () => "http://ops.example.test" }));

import { auth, updateServerSession } from "@/lib/auth";
import { createWorkspace, skipIntegrationStep } from "../actions";

function backend(status: number, body: unknown, contentType = "application/json") {
    const fetchMock = vi.fn().mockResolvedValue(
        new Response(typeof body === "string" ? body : JSON.stringify(body), {
            status,
            headers: { "content-type": contentType },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
}

const ONBOARDED = {
    access_token: "onboard-access",
    refresh_token: "onboard-refresh",
    org_id: "org-new",
    role: "owner",
    expires_in: 3600,
};

describe("onboarding server actions (CHAOS-12088)", () => {
    beforeEach(() => {
        vi.unstubAllGlobals();
        vi.mocked(auth).mockResolvedValue({
            access_token: "session-access",
            user: { id: "user-1" },
            expires: "2026-12-31T00:00:00.000Z",
        } as never);
        vi.mocked(updateServerSession).mockReset();
        vi.mocked(updateServerSession).mockResolvedValue({ user: { id: "user-1" } } as never);
    });

    describe("createWorkspace", () => {
        it("refuses without a session and calls no backend", async () => {
            vi.mocked(auth).mockResolvedValue(null as never);
            const fetchMock = backend(200, ONBOARDED);
            expect(await createWorkspace("Acme")).toEqual({ ok: false, status: 401 });
            expect(fetchMock).not.toHaveBeenCalled();
        });

        it("creates the workspace with the session token and keeps the new pair server-side", async () => {
            const fetchMock = backend(200, ONBOARDED);
            const result = await createWorkspace("Acme");

            expect(result).toEqual({ ok: true, orgId: "org-new" });
            expect(JSON.stringify(result)).not.toContain("onboard-access");
            const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
            expect(url).toBe("http://ops.example.test/api/v1/auth/onboard");
            expect(init.method).toBe("POST");
            expect((init.headers as Record<string, string>).Authorization).toBe(
                "Bearer session-access",
            );
            expect(JSON.parse(init.body as string)).toEqual({
                action: "create_org",
                org_name: "Acme",
            });
            expect(updateServerSession).toHaveBeenCalledWith({ onboardComplete: ONBOARDED });
        });

        it("sends no org_name for a blank name", async () => {
            const fetchMock = backend(200, ONBOARDED);
            await createWorkspace("");
            const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
            expect(JSON.parse(init.body as string)).toEqual({ action: "create_org" });
        });

        it("returns the detail of a validation refusal only", async () => {
            backend(400, { detail: "Org limit reached" });
            expect(await createWorkspace("Acme")).toEqual({
                ok: false,
                status: 400,
                detail: "Org limit reached",
            });
            backend(500, { detail: "internal stack" });
            expect(await createWorkspace("Acme")).toEqual({ ok: false, status: 500 });
            backend(429, "Rate limit exceeded", "text/plain");
            expect(await createWorkspace("Acme")).toEqual({ ok: false, status: 429 });
            expect(updateServerSession).not.toHaveBeenCalled();
        });

        it("reports no answer when the call fails", async () => {
            vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
            expect(await createWorkspace("Acme")).toEqual({ ok: false, status: null });
        });

        it("refuses a 2xx without a token pair and leaves the session alone", async () => {
            backend(200, { org_id: "org-new" });
            expect(await createWorkspace("Acme")).toEqual({ ok: false, status: 502 });
            expect(updateServerSession).not.toHaveBeenCalled();
        });

        it("still reports the created workspace when the session write fails", async () => {
            vi.mocked(updateServerSession).mockRejectedValue(new Error("cookie"));
            backend(200, ONBOARDED);
            expect(await createWorkspace("Acme")).toEqual({ ok: true, orgId: "org-new" });
        });
    });

    describe("skipIntegrationStep", () => {
        it("refuses without a session and calls no backend", async () => {
            vi.mocked(auth).mockResolvedValue(null as never);
            const fetchMock = backend(200, {});
            expect(await skipIntegrationStep()).toEqual({ ok: false, status: 401 });
            expect(fetchMock).not.toHaveBeenCalled();
        });

        it("records the skip with the session token", async () => {
            const fetchMock = backend(200, {});
            expect(await skipIntegrationStep()).toEqual({ ok: true });
            const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
            expect(url).toBe("http://ops.example.test/api/v1/auth/onboarding/skip-integration");
            expect(init.method).toBe("POST");
            expect((init.headers as Record<string, string>).Authorization).toBe(
                "Bearer session-access",
            );
        });

        it("reports a refusal and a failed call", async () => {
            backend(500, "nope", "text/plain");
            expect(await skipIntegrationStep()).toEqual({ ok: false, status: 500 });
            vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
            expect(await skipIntegrationStep()).toEqual({ ok: false, status: null });
        });
    });
});
