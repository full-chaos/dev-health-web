import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn(), sealSessionHandoff: vi.fn() }));
vi.mock("@/lib/origin", () => ({ getBackendUrl: () => "http://ops.example.test" }));

import { auth, sealSessionHandoff } from "@/lib/auth";
import { POST } from "../route";

const SECRET_CURRENT = "current-secret-value-1";
const SECRET_NEW = "brand-new-secret-value-2";

function call(body: unknown) {
    return POST(
        new Request("http://web.example.test/api/auth/change-password", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: typeof body === "string" ? body : JSON.stringify(body),
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

describe("POST /api/auth/change-password", () => {
    beforeEach(() => {
        vi.unstubAllGlobals();
        vi.mocked(auth).mockResolvedValue({
            access_token: "session-access",
            user: { id: "u" },
            expires: "2026-12-31T00:00:00.000Z",
        } as never);
        vi.mocked(sealSessionHandoff).mockReset();
        vi.mocked(sealSessionHandoff).mockResolvedValue("sealed-handoff");
    });

    it("refuses an anonymous caller before any backend call", async () => {
        vi.mocked(auth).mockResolvedValue(null as never);
        const fetchMock = backend(200, {});
        const response = await call({ current_password: SECRET_CURRENT, new_password: SECRET_NEW });
        expect(response.status).toBe(401);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("requires both fields", async () => {
        const fetchMock = backend(200, {});
        const response = await call({ new_password: SECRET_NEW });
        expect(response.status).toBe(400);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("forwards the bearer and both passwords, and answers a sealed handoff of the fresh pair", async () => {
        const pair = {
            access_token: "a2",
            refresh_token: "r2",
            expires_in: 60,
            user: { org_id: "o" },
        };
        const fetchMock = backend(200, pair);
        const response = await call({ current_password: SECRET_CURRENT, new_password: SECRET_NEW });
        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("no-store");
        // CHAOS-12088: the page gets a sealed handoff, never the pair in clear.
        expect(sealSessionHandoff).toHaveBeenCalledWith(
            "activeOrg",
            {
                access_token: "a2",
                refresh_token: "r2",
                expires_in: 60,
                user: { org_id: "o", role: undefined, is_superuser: undefined },
            },
            "u",
        );
        const text = await response.text();
        expect(JSON.parse(text)).toEqual({ ok: true, sessionHandoff: "sealed-handoff" });
        expect(text).not.toContain("a2");
        expect(text).not.toContain("r2");
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe("http://ops.example.test/api/v1/auth/change-password");
        expect((init.headers as Record<string, string>).Authorization).toBe(
            "Bearer session-access",
        );
        expect(JSON.parse(init.body as string)).toEqual({
            current_password: SECRET_CURRENT,
            new_password: SECRET_NEW,
        });
    });

    it("repeats only the known refusal texts", async () => {
        backend(403, { detail: "Current password verification failed" });
        const response = await call({ current_password: SECRET_CURRENT, new_password: SECRET_NEW });
        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({ error: "Current password verification failed" });
    });

    it("never echoes a backend detail it does not know, nor any submitted value", async () => {
        backend(422, {
            detail: [{ loc: ["body", "new_password"], msg: "bad", input: SECRET_NEW }],
        });
        const response = await call({ current_password: SECRET_CURRENT, new_password: SECRET_NEW });
        const text = await response.text();
        expect(response.status).toBe(422);
        expect(text).not.toContain(SECRET_NEW);
        expect(text).not.toContain(SECRET_CURRENT);
        expect(text).not.toContain("loc");
    });

    it("passes policy rule names through as strings only", async () => {
        backend(422, { detail: { violations: ["Password must include at least one letter", 7] } });
        const response = await call({ current_password: SECRET_CURRENT, new_password: SECRET_NEW });
        expect(await response.json()).toEqual({
            error: "The new password was not accepted.",
            violations: ["Password must include at least one letter"],
        });
    });

    it.each([
        ["the seal fails", () => vi.mocked(sealSessionHandoff).mockRejectedValue(new Error("x"))],
        ["the answer has no pair", () => backend(200, { user: {} })],
    ])("answers 502 without the pair when %s", async (_label, arrange) => {
        backend(200, { access_token: "a2", refresh_token: "r2", user: {} });
        arrange();
        const response = await call({ current_password: SECRET_CURRENT, new_password: SECRET_NEW });
        expect(response.status).toBe(502);
        const text = await response.text();
        expect(JSON.parse(text)).toEqual({ error: "Password changed. Sign in again to continue." });
        expect(text).not.toContain("a2");
    });

    it("answers a generic 502 when the backend is unreachable", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error(`boom ${SECRET_NEW}`)));
        const response = await call({ current_password: SECRET_CURRENT, new_password: SECRET_NEW });
        expect(response.status).toBe(502);
        expect(await response.text()).not.toContain(SECRET_NEW);
    });
});
