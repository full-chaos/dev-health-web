import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/origin", () => ({ getBackendUrl: () => "http://ops.example.test" }));

import { auth } from "@/lib/auth";
import { GET } from "../route";

const ORG = {
    id: "org-a",
    slug: "a",
    name: "Org A",
    tier: "team",
    role: "admin",
    joined_at: "2026-01-01T00:00:00Z",
    has_data: true,
    last_metrics_at: "2026-05-02T00:00:00Z",
};

function backend(status: number, body: unknown) {
    const fetchMock = vi.fn().mockResolvedValue(
        new Response(typeof body === "string" ? body : JSON.stringify(body), {
            status,
            headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
}

describe("GET /api/auth/organizations (CHAOS-12088: no backend body as it came)", () => {
    beforeEach(() => {
        vi.unstubAllGlobals();
        vi.mocked(auth).mockResolvedValue({
            access_token: "session-access",
            user: { id: "user-1" },
            expires: "2026-12-31T00:00:00.000Z",
        } as never);
    });

    it("refuses an anonymous caller before any backend call", async () => {
        vi.mocked(auth).mockResolvedValue(null as never);
        const fetchMock = backend(200, { organizations: [] });
        expect((await GET()).status).toBe(401);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("serves the named organization fields only, with the bearer sent to the backend", async () => {
        const fetchMock = backend(200, {
            active_org_id: "org-a",
            access_token: "top-level-access",
            organizations: [{ ...ORG, access_token: "nested-access", secret: "s" }, null, 7],
        });
        const response = await GET();
        expect(response.status).toBe(200);
        const text = await response.text();
        expect(JSON.parse(text)).toEqual({ active_org_id: "org-a", organizations: [ORG] });
        expect(text).not.toContain("access");
        const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect((init.headers as Record<string, string>).Authorization).toBe(
            "Bearer session-access",
        );
    });

    it("serves null for a missing or non-string active org", async () => {
        backend(200, { active_org_id: 5, organizations: [] });
        expect(await (await GET()).json()).toEqual({ active_org_id: null, organizations: [] });
    });

    it.each([401, 403, 429, 500, 502])(
        "answers a %s refusal with a fixed body, never the backend body",
        async (status) => {
            backend(status, { detail: "lookup failed", access_token: "refusal-access" });
            const response = await GET();
            expect(response.status).toBe(status);
            expect(await response.json()).toEqual({ error: "Organization lookup failed" });
        },
    );

    it.each([
        ["not JSON", "refusal-access"],
        ["no organizations array", { active_org_id: "org-a", access_token: "x-access" }],
        ["organizations not an array", { organizations: { access_token: "x-access" } }],
    ])("answers a fixed 502 for a 2xx with %s", async (_label, body) => {
        backend(200, body);
        const response = await GET();
        expect(response.status).toBe(502);
        expect(await response.text()).not.toContain("access");
    });

    it("answers a fixed 502 when the backend call fails", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
        const response = await GET();
        expect(response.status).toBe(502);
        expect(await response.json()).toEqual({ error: "Organization lookup failed" });
    });
});
