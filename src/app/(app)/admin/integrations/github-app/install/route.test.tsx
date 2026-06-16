import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { GET } from "@/app/(app)/admin/integrations/github-app/install/route";
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

function setAdminSession(extra: Record<string, unknown> = {}) {
    setSession({ org_id: "org-1", role: "admin", ...extra });
}

function makeRequest() {
    return new NextRequest("http://localhost/admin/integrations/github-app/install");
}

function installUrlResponse(installUrl: unknown) {
    return new Response(JSON.stringify({ install_url: installUrl }), {
        status: 200,
    });
}

describe("GET /admin/integrations/github-app/install", () => {
    beforeEach(() => {
        vi.stubGlobal("fetch", vi.fn());
    });

    afterEach(() => {
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
