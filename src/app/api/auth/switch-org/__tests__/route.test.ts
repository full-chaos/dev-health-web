import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn(), sealSessionHandoff: vi.fn() }));
vi.mock("@/lib/origin", () => ({ getBackendUrl: () => "http://ops.example.test" }));

import { auth, sealSessionHandoff } from "@/lib/auth";
import { POST } from "../route";

const PAIR = {
    access_token: "switched-access",
    refresh_token: "switched-refresh",
    expires_in: 3600,
    user: { org_id: "org-b", role: "admin", is_superuser: false },
};

function call(body: unknown) {
    return POST(
        new Request("http://web.example.test/api/auth/switch-org", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        }),
    );
}

function backend(status: number, body: unknown) {
    const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(body), {
            status,
            headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
}

describe("POST /api/auth/switch-org", () => {
    beforeEach(() => {
        vi.unstubAllGlobals();
        vi.mocked(auth).mockResolvedValue({
            access_token: "session-access",
            user: { id: "user-1" },
            expires: "2026-12-31T00:00:00.000Z",
        } as never);
        vi.mocked(sealSessionHandoff).mockReset();
        vi.mocked(sealSessionHandoff).mockResolvedValue("sealed-handoff");
    });

    it("refuses an anonymous caller before any backend call", async () => {
        vi.mocked(auth).mockResolvedValue(null as never);
        const fetchMock = backend(200, PAIR);
        const response = await call({ org_id: "org-b" });
        expect(response.status).toBe(401);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("seals the new pair for the signed-in user and answers the org and the handoff only", async () => {
        const fetchMock = backend(200, PAIR);
        const response = await call({ org_id: "org-b" });

        expect(response.status).toBe(200);
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe("http://ops.example.test/api/v1/auth/switch-org");
        expect((init.headers as Record<string, string>).Authorization).toBe(
            "Bearer session-access",
        );
        expect(sealSessionHandoff).toHaveBeenCalledWith(
            "activeOrg",
            {
                access_token: "switched-access",
                refresh_token: "switched-refresh",
                expires_in: 3600,
                user: { org_id: "org-b", role: "admin", is_superuser: false },
            },
            "user-1",
        );
        // CHAOS-12088: the page gets the org and the sealed handoff, never a token in clear.
        const text = await response.text();
        expect(JSON.parse(text)).toEqual({ org_id: "org-b", sessionHandoff: "sealed-handoff" });
        expect(text).not.toContain("switched-access");
        expect(text).not.toContain("switched-refresh");
        expect(response.headers.get("cache-control")).toBe("no-store");
    });

    it.each([400, 401, 403, 404, 409, 429, 500, 503])(
        "answers a %s refusal with its status and a fixed body, never the backend body",
        async (status) => {
            backend(status, {
                detail: "Not a member",
                access_token: "refusal-access",
                refresh_token: "refusal-refresh",
            });
            const response = await call({ org_id: "org-b" });
            expect(response.status).toBe(status);
            expect(await response.json()).toEqual({ error: "Organization switch failed" });
            expect(sealSessionHandoff).not.toHaveBeenCalled();
        },
    );

    it("answers a fixed 502 when the backend call fails", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
        const response = await call({ org_id: "org-b" });
        expect(response.status).toBe(502);
        expect(await response.json()).toEqual({ error: "Organization switch failed" });
    });

    it("answers a fixed 502 when a 2xx is not JSON", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(new Response("switched-access", { status: 200 })),
        );
        const response = await call({ org_id: "org-b" });
        expect(response.status).toBe(502);
        expect(await response.text()).not.toContain("switched-access");
    });

    it("answers 502 when a 2xx carries no token pair", async () => {
        backend(200, { user: { org_id: "org-b" } });
        const response = await call({ org_id: "org-b" });
        expect(response.status).toBe(502);
        expect(sealSessionHandoff).not.toHaveBeenCalled();
    });

    it("answers 502 without the pair when the seal fails", async () => {
        vi.mocked(sealSessionHandoff).mockRejectedValue(new Error("no auth secret"));
        backend(200, PAIR);
        const response = await call({ org_id: "org-b" });
        expect(response.status).toBe(502);
        expect(await response.text()).not.toContain("switched-access");
    });
});
