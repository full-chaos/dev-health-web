import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ transport: undefined as unknown }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/origin", () => ({ getBackendUrl: vi.fn(() => "http://backend.test") }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/auth/decide/config", async (orig) => ({
    ...(await orig<typeof import("@/lib/auth/decide/config")>()),
    getDecideTransport: () => mocks.transport,
}));

import { GET } from "@/app/(app)/org/admin/integrations/github-app/install/route";
import { auth } from "@/lib/auth";
import { ALLOW, DENY, answering, recordingTransport } from "@/lib/auth/decide/__tests__/helpers";

const mockAuth = vi.mocked(auth);
const ERROR = "github_app=error";

function setSession(user: Record<string, unknown>) {
    mockAuth.mockResolvedValue({ access_token: "tok-SECRETSECRETSECRET.abc.def", user } as never);
}
const request = () => new NextRequest("http://localhost/org/admin/integrations/github-app/install");
const backendOk = () =>
    vi.mocked(fetch).mockResolvedValue(
        new Response(
            JSON.stringify({
                install_url: "https://github.com/apps/dev-health/installations/new?state=jwt",
            }),
            { status: 200 },
        ),
    );

describe("A4 install route with AUTHZ_DECISIONS_ENFORCE on", () => {
    beforeEach(() => {
        process.env.AUTHZ_DECISIONS_ENFORCE = "on";
        mocks.transport = undefined;
        vi.stubGlobal("fetch", vi.fn());
    });
    afterEach(() => {
        delete process.env.AUTHZ_DECISIONS_ENFORCE;
        vi.unstubAllGlobals();
        vi.clearAllMocks();
    });

    it("a decision deny for an admin redirects to error and makes no backend call", async () => {
        const { transport, calls } = answering(DENY);
        mocks.transport = transport;
        setSession({ org_id: "org-1", role: "admin", is_superuser: true });
        backendOk();
        const response = await GET(request());
        expect(response.headers.get("location")).toContain(ERROR);
        expect(calls).toHaveLength(1);
        expect(JSON.parse(calls[0]?.body ?? "{}").action).toBe("integrations.write");
        expect(fetch).not.toHaveBeenCalled();
    });

    it("a decision allow for a member proceeds", async () => {
        const { transport } = answering(ALLOW);
        mocks.transport = transport;
        setSession({ org_id: "org-1", role: "member", is_superuser: false });
        backendOk();
        const response = await GET(request());
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(response.headers.get("location") ?? "").toContain("github.com/apps/dev-health");
    });

    it("no transport denies an admin and makes no backend call", async () => {
        setSession({ org_id: "org-1", role: "admin", is_superuser: true });
        backendOk();
        const response = await GET(request());
        expect(response.headers.get("location")).toContain(ERROR);
        expect(fetch).not.toHaveBeenCalled();
    });

    it("a failing transport denies an admin and makes no backend call", async () => {
        mocks.transport = recordingTransport(async () => {
            throw new Error("down");
        }).transport;
        setSession({ org_id: "org-1", role: "owner", is_superuser: true });
        backendOk();
        const response = await GET(request());
        expect(response.headers.get("location")).toContain(ERROR);
        expect(fetch).not.toHaveBeenCalled();
    });

    it("a session with no org denies and asks nothing", async () => {
        const { transport, calls } = answering(ALLOW);
        mocks.transport = transport;
        setSession({ role: "admin", is_superuser: true });
        backendOk();
        const response = await GET(request());
        expect(response.headers.get("location")).toContain(ERROR);
        expect(calls).toHaveLength(0);
        expect(fetch).not.toHaveBeenCalled();
    });
});

describe("A4 install route with the switch off", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.clearAllMocks();
    });

    it("keeps the role rule and asks nothing", async () => {
        const { transport, calls } = answering(ALLOW);
        mocks.transport = transport;
        vi.stubGlobal("fetch", vi.fn());
        setSession({ org_id: "org-1", role: "member", is_superuser: false });
        backendOk();
        const response = await GET(request());
        expect(response.headers.get("location")).toContain(ERROR);
        expect(calls).toHaveLength(0);
        expect(fetch).not.toHaveBeenCalled();
    });
});
