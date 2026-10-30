import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn(), updateServerSession: vi.fn() }));
vi.mock("@/lib/origin", () => ({ getBackendUrl: () => "http://ops.example.test" }));

import { auth, updateServerSession } from "@/lib/auth";
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
        vi.mocked(updateServerSession).mockReset();
        vi.mocked(updateServerSession).mockResolvedValue({ user: { id: "user-1" } } as never);
    });

    it("refuses an anonymous caller before any backend call", async () => {
        vi.mocked(auth).mockResolvedValue(null as never);
        const fetchMock = backend(200, PAIR);
        const response = await call({ org_id: "org-b" });
        expect(response.status).toBe(401);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("writes the new pair into the session on the server and answers the org only", async () => {
        const fetchMock = backend(200, PAIR);
        const response = await call({ org_id: "org-b" });

        expect(response.status).toBe(200);
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe("http://ops.example.test/api/v1/auth/switch-org");
        expect((init.headers as Record<string, string>).Authorization).toBe(
            "Bearer session-access",
        );
        expect(updateServerSession).toHaveBeenCalledWith({ activeOrg: PAIR });
        // CHAOS-12088: the page gets the org, never a token.
        const text = await response.text();
        expect(JSON.parse(text)).toEqual({ org_id: "org-b" });
        expect(text).not.toContain("switched-access");
        expect(text).not.toContain("switched-refresh");
        expect(response.headers.get("cache-control")).toBe("no-store");
    });

    it("passes a refusal through and leaves the session alone", async () => {
        backend(403, { detail: "Not a member" });
        const response = await call({ org_id: "org-b" });
        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({ detail: "Not a member" });
        expect(updateServerSession).not.toHaveBeenCalled();
    });

    it("answers 502 when a 2xx carries no token pair", async () => {
        backend(200, { user: { org_id: "org-b" } });
        const response = await call({ org_id: "org-b" });
        expect(response.status).toBe(502);
        expect(updateServerSession).not.toHaveBeenCalled();
    });

    it.each([
        ["throws", () => vi.mocked(updateServerSession).mockRejectedValue(new Error("cookie"))],
        ["finds no session", () => vi.mocked(updateServerSession).mockResolvedValue(null)],
    ])("answers 502 without the pair when the session write %s", async (_label, arrange) => {
        arrange();
        backend(200, PAIR);
        const response = await call({ org_id: "org-b" });
        expect(response.status).toBe(502);
        expect(await response.text()).not.toContain("switched-access");
    });
});
