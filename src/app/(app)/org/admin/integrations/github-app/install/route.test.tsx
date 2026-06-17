import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { GET } from "@/app/(app)/org/admin/integrations/github-app/install/route";
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

function setAdminSession(extra: Record<string, unknown> = {}) {
    setSession({ org_id: "org-1", role: "admin", ...extra });
}

function makeRequest() {
    return new NextRequest("http://localhost/org/admin/integrations/github-app/install");
}

function makeForwardedRequest() {
    return new NextRequest("http://[::]:3000/org/admin/integrations/github-app/install", {
        headers: {
            "x-forwarded-host": "app.example.test",
            "x-forwarded-proto": "https",
        },
    });
}

function installUrlResponse(installUrl: unknown) {
    return new Response(JSON.stringify({ install_url: installUrl }), {
        status: 200,
    });
}

describe("GET /org/admin/integrations/github-app/install", () => {
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

    it("redirects to the backend-minted install URL on success", async () => {
        setAdminSession();
        vi.mocked(fetch).mockResolvedValue(
            installUrlResponse("https://github.com/apps/dev-health/installations/new?state=jwt"),
        );

        const response = await GET(makeRequest());

        expect(response.status).toBe(307);
        expect(response.headers.get("location")).toBe(
            "https://github.com/apps/dev-health/installations/new?state=jwt",
        );
        // Forwarded the session token + effective org to the backend.
        const [, init] = vi.mocked(fetch).mock.calls[0];
        const headers = init?.headers as Record<string, string>;
        expect(headers.Authorization).toBe("Bearer tok");
        expect(headers["X-Org-Id"]).toBe("org-1");
    });

    it("proceeds for a superuser session without an org role", async () => {
        setSession({ is_superuser: true });
        vi.mocked(fetch).mockResolvedValue(
            installUrlResponse("https://github.com/apps/dev-health/installations/new"),
        );

        const response = await GET(makeRequest());

        expect(response.status).toBe(307);
        expect(response.headers.get("location")).toBe(
            "https://github.com/apps/dev-health/installations/new",
        );
    });

    it("redirects to error for a non-admin authenticated member", async () => {
        setSession({ org_id: "org-1", role: "member", is_superuser: false });

        const response = await GET(makeRequest());

        expect(response.status).toBe(307);
        expect(response.headers.get("location")).toBe(ERROR_LOCATION);
        expect(fetch).not.toHaveBeenCalled();
    });

    it("uses configured public origin for install error redirects", async () => {
        process.env.AUTH_URL = "https://app.example.test";
        setSession({ org_id: "org-1", role: "member", is_superuser: false });

        const response = await GET(makeForwardedRequest());

        expect(response.status).toBe(307);
        expect(response.headers.get("location")).toBe(
            "https://app.example.test/org/admin/integrations/github?github_app=error",
        );
        expect(fetch).not.toHaveBeenCalled();
    });

    it("uses forwarded public origin for install error redirects when proxy trust is enabled", async () => {
        process.env.TRUST_PROXY = "true";
        setSession({ org_id: "org-1", role: "member", is_superuser: false });

        const response = await GET(makeForwardedRequest());

        expect(response.status).toBe(307);
        expect(response.headers.get("location")).toBe(
            "https://app.example.test/org/admin/integrations/github?github_app=error",
        );
        expect(fetch).not.toHaveBeenCalled();
    });

    it("omits X-Org-Id when the session has no org", async () => {
        setSession({ role: "admin" });
        vi.mocked(fetch).mockResolvedValue(
            installUrlResponse("https://github.com/apps/dev-health/installations/new"),
        );

        await GET(makeRequest());

        const [, init] = vi.mocked(fetch).mock.calls[0];
        expect((init?.headers as Record<string, string>)["X-Org-Id"]).toBeUndefined();
    });

    it("redirects to error when there is no session access token", async () => {
        mockAuth.mockResolvedValue(null as never);

        const response = await GET(makeRequest());

        expect(response.status).toBe(307);
        expect(response.headers.get("location")).toBe(ERROR_LOCATION);
        expect(fetch).not.toHaveBeenCalled();
    });

    it("redirects to the integration page with an error when the backend fails", async () => {
        setAdminSession();
        vi.mocked(fetch).mockResolvedValue(new Response("nope", { status: 500 }));

        const response = await GET(makeRequest());

        expect(response.status).toBe(307);
        expect(response.headers.get("location")).toBe(ERROR_LOCATION);
    });

    it("redirects to error when the backend returns a non-URL install_url", async () => {
        setAdminSession();
        vi.mocked(fetch).mockResolvedValue(installUrlResponse("not a url"));

        const response = await GET(makeRequest());

        expect(response.status).toBe(307);
        expect(response.headers.get("location")).toBe(ERROR_LOCATION);
    });

    it("redirects to error for a non-https (http) github.com install_url", async () => {
        setAdminSession();
        vi.mocked(fetch).mockResolvedValue(
            installUrlResponse("http://github.com/apps/dev-health/installations/new"),
        );

        const response = await GET(makeRequest());

        expect(response.status).toBe(307);
        expect(response.headers.get("location")).toBe(ERROR_LOCATION);
    });

    it("redirects to error for an https install_url on a non-github host", async () => {
        setAdminSession();
        vi.mocked(fetch).mockResolvedValue(
            installUrlResponse("https://evil.example/apps/dev-health/installations/new"),
        );

        const response = await GET(makeRequest());

        expect(response.status).toBe(307);
        expect(response.headers.get("location")).toBe(ERROR_LOCATION);
    });

    it("redirects to error when fetch throws", async () => {
        setAdminSession();
        vi.mocked(fetch).mockRejectedValue(new Error("network"));

        const response = await GET(makeRequest());

        expect(response.status).toBe(307);
        expect(response.headers.get("location")).toBe(ERROR_LOCATION);
    });
});
