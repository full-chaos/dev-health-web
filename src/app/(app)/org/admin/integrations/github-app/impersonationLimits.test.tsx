import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ status: vi.fn(), info: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/origin", () => ({ getBackendUrl: vi.fn(() => "http://backend.test") }));
vi.mock("@/lib/logger", () => ({
    logger: { info: mocks.info, warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/impersonationStatusMemo", () => ({ readImpersonationStatus: mocks.status }));

import { GET as installGET } from "@/app/(app)/org/admin/integrations/github-app/install/route";
import { GET as callbackGET } from "@/app/(app)/org/admin/integrations/github-app/callback/route";
import { auth } from "@/lib/auth";

const mockAuth = vi.mocked(auth);
const ERROR = "github_app=error";

function setSession(user: Record<string, unknown>) {
    mockAuth.mockResolvedValue({
        access_token: "tok-1",
        user: { id: "admin-1", org_id: "org-1", ...user },
    } as never);
}

const routes = [
    {
        name: "install",
        call: () =>
            installGET(
                new NextRequest("http://localhost/org/admin/integrations/github-app/install"),
            ),
        body: { install_url: "https://github.com/apps/dev-health/installations/new?state=jwt" },
    },
    {
        name: "callback",
        call: () =>
            callbackGET(
                new NextRequest(
                    "http://localhost/org/admin/integrations/github-app/callback?installation_id=42&state=s&setup_action=install",
                ),
            ),
        body: {},
    },
] as const;

describe.each(routes)("github-app $name route, impersonation limits", ({ call, body }) => {
    beforeEach(() => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })),
        );
        mocks.status.mockResolvedValue({ is_impersonating: true });
    });
    afterEach(() => {
        delete process.env.AUTHZ_PLATFORM_UI;
        vi.unstubAllGlobals();
        vi.clearAllMocks();
    });

    it.each([undefined, "off", "shadow"])(
        "C3/C4 AUTHZ_PLATFORM_UI=%j: an impersonating superuser keeps today's path",
        async (value) => {
            if (value !== undefined) process.env.AUTHZ_PLATFORM_UI = value;
            setSession({ role: "member", is_superuser: true, is_impersonating: true });
            const response = await call();
            expect(fetch).toHaveBeenCalledTimes(1);
            expect(response.headers.get("location") ?? "").not.toContain(ERROR);
            expect(mocks.status).not.toHaveBeenCalled();
        },
    );

    it("C7 enforce: an impersonating superuser is refused with no backend call and one log line", async () => {
        process.env.AUTHZ_PLATFORM_UI = "enforce";
        setSession({ role: "member", is_superuser: true, is_impersonating: true });
        const response = await call();
        expect(response.headers.get("location")).toContain(ERROR);
        expect(fetch).not.toHaveBeenCalled();
        expect(mocks.info).toHaveBeenCalledWith(
            { action: "integrations.write", cause: "impersonating", surface: "org_write" },
            "impersonation_limit",
        );
    });

    it("C7 enforce: an impersonating admin role does not pass either", async () => {
        process.env.AUTHZ_PLATFORM_UI = "enforce";
        setSession({ role: "admin", is_superuser: true, is_impersonating: true });
        const response = await call();
        expect(response.headers.get("location")).toContain(ERROR);
        expect(fetch).not.toHaveBeenCalled();
    });

    it("C10 enforce: the server status decides when the session flag says not impersonating", async () => {
        process.env.AUTHZ_PLATFORM_UI = "enforce";
        setSession({ role: "member", is_superuser: true, is_impersonating: false });
        const response = await call();
        expect(response.headers.get("location")).toContain(ERROR);
        expect(fetch).not.toHaveBeenCalled();
    });

    it("C9 enforce: a superuser that is not impersonating keeps the bypass", async () => {
        process.env.AUTHZ_PLATFORM_UI = "enforce";
        mocks.status.mockResolvedValue({ is_impersonating: false });
        setSession({ role: "member", is_superuser: true, is_impersonating: false });
        await call();
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("C9 enforce: an org admin that is not a superuser writes", async () => {
        process.env.AUTHZ_PLATFORM_UI = "enforce";
        setSession({ role: "admin", is_superuser: false, is_impersonating: false });
        await call();
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(mocks.status).not.toHaveBeenCalled();
    });
});
