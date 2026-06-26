import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { GET } from "@/app/(app)/org/admin/integrations/github-app/callback/route";
import { auth } from "@/lib/auth";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/origin", () => ({
    getBackendUrl: vi.fn(() => "http://backend.test"),
}));

const mockAuth = vi.mocked(auth);

const ERROR_LOCATION = "http://localhost/org/admin/integrations/github?github_app=error";
const ORIGINAL_AUTH_URL = process.env.AUTH_URL;
const ORIGINAL_NEXTAUTH_URL = process.env.NEXTAUTH_URL;
const ORIGINAL_TRUST_PROXY = process.env.TRUST_PROXY;

function setSession(user: Record<string, unknown>) {
    mockAuth.mockResolvedValue({ access_token: "tok", user } as never);
}

function authedSession() {
    setSession({ org_id: "org-1", role: "admin" });
}

function makeRequest(query: string) {
    return new NextRequest(`http://localhost/org/admin/integrations/github-app/callback${query}`);
}

function makeForwardedRequest(query: string) {
    return new NextRequest(`http://[::]:3000/org/admin/integrations/github-app/callback${query}`, {
        headers: {
            "x-forwarded-host": "app.example.test",
            "x-forwarded-proto": "https",
        },
    });
}

describe("GET /org/admin/integrations/github-app/callback", () => {
    beforeEach(() => {
        delete process.env.AUTH_URL;
        delete process.env.NEXTAUTH_URL;
        delete process.env.TRUST_PROXY;
        vi.stubGlobal("fetch", vi.fn());
    });

    afterEach(() => {
        if (ORIGINAL_AUTH_URL === undefined) {
            delete process.env.AUTH_URL;
        } else {
            process.env.AUTH_URL = ORIGINAL_AUTH_URL;
        }
        if (ORIGINAL_NEXTAUTH_URL === undefined) {
            delete process.env.NEXTAUTH_URL;
        } else {
            process.env.NEXTAUTH_URL = ORIGINAL_NEXTAUTH_URL;
        }
        if (ORIGINAL_TRUST_PROXY === undefined) {
            delete process.env.TRUST_PROXY;
        } else {
            process.env.TRUST_PROXY = ORIGINAL_TRUST_PROXY;
        }
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
            "http://localhost/org/admin/integrations/github?github_app=connected",
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

    it("uses configured public origin for the final connected redirect", async () => {
        process.env.AUTH_URL = "https://app.example.test";
        authedSession();
        vi.mocked(fetch).mockResolvedValue(
            new Response(JSON.stringify({ connected: true }), { status: 200 }),
        );

        const response = await GET(
            makeForwardedRequest("?installation_id=123&setup_action=install&state=jwt&code=abc"),
        );

        expect(response.status).toBe(307);
        expect(response.headers.get("location")).toBe(
            "https://app.example.test/org/admin/integrations/github?github_app=connected",
        );
    });

    it("uses forwarded public origin when proxy trust is enabled", async () => {
        process.env.TRUST_PROXY = "true";
        authedSession();
        vi.mocked(fetch).mockResolvedValue(
            new Response(JSON.stringify({ connected: true }), { status: 200 }),
        );

        const response = await GET(
            makeForwardedRequest("?installation_id=123&setup_action=install&state=jwt&code=abc"),
        );

        expect(response.status).toBe(307);
        expect(response.headers.get("location")).toBe(
            "https://app.example.test/org/admin/integrations/github?github_app=connected",
        );
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

    it("redirects to the backend-validated return_to on success (CHAOS-2676)", async () => {
        authedSession();
        vi.mocked(fetch).mockResolvedValue(
            new Response(
                JSON.stringify({
                    connected: true,
                    return_to: "/org/admin/integrations/github/sync",
                }),
                { status: 200 },
            ),
        );

        const response = await GET(makeRequest("?installation_id=123&state=jwt"));

        expect(response.status).toBe(307);
        expect(response.headers.get("location")).toBe(
            "http://localhost/org/admin/integrations/github/sync?github_app=connected",
        );
    });

    it("honors the backend return_to on an error result", async () => {
        authedSession();
        vi.mocked(fetch).mockResolvedValue(
            new Response(
                JSON.stringify({ return_to: "/org/admin/integrations/github/sync" }),
                { status: 422 },
            ),
        );

        const response = await GET(makeRequest("?installation_id=123&state=jwt"));

        expect(response.status).toBe(307);
        expect(response.headers.get("location")).toBe(
            "http://localhost/org/admin/integrations/github/sync?github_app=error",
        );
    });

    it("ignores an unsafe (absolute-URL) return_to and falls back to the admin path", async () => {
        authedSession();
        vi.mocked(fetch).mockResolvedValue(
            new Response(
                JSON.stringify({ connected: true, return_to: "https://evil.example/phish" }),
                { status: 200 },
            ),
        );

        const response = await GET(makeRequest("?installation_id=123&state=jwt"));

        expect(response.status).toBe(307);
        expect(response.headers.get("location")).toBe(
            "http://localhost/org/admin/integrations/github?github_app=connected",
        );
    });

    it("falls back to the admin path when the backend omits return_to", async () => {
        authedSession();
        vi.mocked(fetch).mockResolvedValue(
            new Response(JSON.stringify({ connected: true }), { status: 200 }),
        );

        const response = await GET(makeRequest("?installation_id=123&state=jwt"));

        expect(response.status).toBe(307);
        expect(response.headers.get("location")).toBe(
            "http://localhost/org/admin/integrations/github?github_app=connected",
        );
    });
});
