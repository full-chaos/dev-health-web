import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/origin", () => ({ getBackendUrl: () => "http://ops.example.test" }));

import { auth } from "@/lib/auth";
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
            expires: "2026-12-31T00:00:00.000Z",
        } as never);
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

    it("forwards the bearer and both passwords, and returns the fresh pair uncached", async () => {
        const fetchMock = backend(200, { access_token: "a2", refresh_token: "r2", user: {} });
        const response = await call({ current_password: SECRET_CURRENT, new_password: SECRET_NEW });
        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(await response.json()).toMatchObject({ access_token: "a2", refresh_token: "r2" });
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

    it("answers a generic 502 when the backend is unreachable", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error(`boom ${SECRET_NEW}`)));
        const response = await call({ current_password: SECRET_CURRENT, new_password: SECRET_NEW });
        expect(response.status).toBe(502);
        expect(await response.text()).not.toContain(SECRET_NEW);
    });
});
