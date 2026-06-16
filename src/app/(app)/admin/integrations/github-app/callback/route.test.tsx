import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { GET } from "@/app/(app)/admin/integrations/github-app/callback/route";
import { auth } from "@/lib/auth";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/origin", () => ({
    getBackendUrl: vi.fn(() => "http://backend.test"),
}));

const mockAuth = vi.mocked(auth);

const ERROR_LOCATION = "http://localhost/admin/integrations/github?github_app=error";

function setSession(user: Record<string, unknown>) {
    mockAuth.mockResolvedValue({ access_token: "tok", user } as never);
}

function authedSession() {
    setSession({ org_id: "org-1", role: "admin" });
}

function makeRequest(query: string) {
    return new NextRequest(`http://localhost/admin/integrations/github-app/callback${query}`);
}

describe("GET /admin/integrations/github-app/callback", () => {
    beforeEach(() => {
        vi.stubGlobal("fetch", vi.fn());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.clearAllMocks();
    });

    it("forwards the callback to the backend and redirects to connected on success", async () => {
        authedSession();
        vi.mocked(fetch).mockResolvedValue(
            new Response(JSON.stringify({ connected: true }), { status: 200 }),
        );

        const response = await GET(
            makeRequest("?installation_id=123&setup_action=install&state=jwt&code=abc"),
        );

        expect(response.status).toBe(307);
        expect(response.headers.get("location")).toBe(
            "http://localhost/admin/integrations/github?github_app=connected",
        );

        const [url, init] = vi.mocked(fetch).mock.calls[0];
        expect(url).toBe("http://backend.test/api/v1/admin/integrations/github/install-callback");
        const headers = init?.headers as Record<string, string>;
        expect(headers.Authorization).toBe("Bearer tok");
        expect(headers["X-Org-Id"]).toBe("org-1");
        expect(JSON.parse(init?.body as string)).toEqual({
            installation_id: 123,
            setup_action: "install",
            state: "jwt",
            code: "abc",
        });
    });

    it("omits X-Org-Id when the session has no org", async () => {
        setSession({ role: "admin" });
        vi.mocked(fetch).mockResolvedValue(
            new Response(JSON.stringify({ connected: true }), { status: 200 }),
        );

        await GET(makeRequest("?installation_id=123&state=jwt"));

        const [, init] = vi.mocked(fetch).mock.calls[0];
        expect((init?.headers as Record<string, string>)["X-Org-Id"]).toBeUndefined();
    });

    it("redirects to error for a non-admin authenticated member", async () => {
        setSession({ org_id: "org-1", role: "member", is_superuser: false });

        const response = await GET(makeRequest("?installation_id=123&state=jwt"));

        expect(response.status).toBe(307);
        expect(response.headers.get("location")).toBe(ERROR_LOCATION);
        expect(fetch).not.toHaveBeenCalled();
    });

    it("redirects to error when installation_id is missing", async () => {
        authedSession();

        const response = await GET(makeRequest("?state=jwt"));

        expect(response.status).toBe(307);
        expect(response.headers.get("location")).toBe(ERROR_LOCATION);
        expect(fetch).not.toHaveBeenCalled();
    });

    it("redirects to error when installation_id is not a positive integer", async () => {
        authedSession();

        const response = await GET(makeRequest("?installation_id=-5&state=jwt"));

        expect(response.status).toBe(307);
        expect(response.headers.get("location")).toBe(ERROR_LOCATION);
        expect(fetch).not.toHaveBeenCalled();
    });

    it("redirects to error when installation_id exceeds MAX_SAFE_INTEGER", async () => {
        authedSession();

        // 9999999999999999999 > Number.MAX_SAFE_INTEGER (9007199254740991).
        const response = await GET(makeRequest("?installation_id=9999999999999999999&state=jwt"));

        expect(response.status).toBe(307);
        expect(response.headers.get("location")).toBe(ERROR_LOCATION);
        expect(fetch).not.toHaveBeenCalled();
    });

    it("redirects to error when state is missing", async () => {
        authedSession();

        const response = await GET(makeRequest("?installation_id=123"));

        expect(response.status).toBe(307);
        expect(response.headers.get("location")).toBe(ERROR_LOCATION);
        expect(fetch).not.toHaveBeenCalled();
    });

    it("redirects to error when there is no session access token", async () => {
        mockAuth.mockResolvedValue(null as never);

        const response = await GET(makeRequest("?installation_id=123&state=jwt"));

        expect(response.status).toBe(307);
        expect(response.headers.get("location")).toBe(ERROR_LOCATION);
        expect(fetch).not.toHaveBeenCalled();
    });

    it("redirects to error when the backend rejects the callback", async () => {
        authedSession();
        vi.mocked(fetch).mockResolvedValue(
            new Response(JSON.stringify({ detail: "org mismatch" }), { status: 403 }),
        );

        const response = await GET(makeRequest("?installation_id=123&state=jwt"));

        expect(response.status).toBe(307);
        expect(response.headers.get("location")).toBe(ERROR_LOCATION);
    });

    it("sends null for absent optional setup_action and code", async () => {
        authedSession();
        vi.mocked(fetch).mockResolvedValue(
            new Response(JSON.stringify({ connected: true }), { status: 200 }),
        );

        await GET(makeRequest("?installation_id=99&state=jwt"));

        const [, init] = vi.mocked(fetch).mock.calls[0];
        expect(JSON.parse(init?.body as string)).toEqual({
            installation_id: 99,
            setup_action: null,
            state: "jwt",
            code: null,
        });
    });
});
