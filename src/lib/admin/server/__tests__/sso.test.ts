import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/origin", () => ({ getBackendUrl: () => "http://backend.test" }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const sessionContext = vi.hoisted(() => vi.fn());
vi.mock("../_shared", () => ({
    getSessionContext: sessionContext,
    withErrorHandling: vi.fn(),
}));
const fetchMock = vi.fn();
vi.mock("@/lib/serverDeadline", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/serverDeadline")>()),
    fetchWithDeadline: (...args: unknown[]) => fetchMock(...args),
}));

import {
    activateSsoProvider,
    createSsoProvider,
    deactivateSsoProvider,
    deleteSsoProvider,
    listSsoProviders,
    updateSsoProvider,
} from "../sso";

const GATE = "This feature requires the enterprise plan (current plan: community).";
const BASE = "http://backend.test/api/v1/auth/sso/providers";

const ok = (body: unknown, status = 200) => ({
    ok: true,
    status,
    statusText: "OK",
    json: async () => body,
});
const refused = (status: number, statusText: string, detail: unknown) => ({
    ok: false,
    status,
    statusText,
    json: async () => ({ detail }),
});

function call() {
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    return { url, options, headers: options.headers as Record<string, string> };
}

beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(ok({}));
    sessionContext.mockReset();
    sessionContext.mockResolvedValue({ token: "tok", orgId: "org-1" });
});

describe("SSO provider server actions call the go-api routes under /api/v1/auth/sso", () => {
    it("lists with GET and the page bounds, never under /admin, with the token and org", async () => {
        await listSsoProviders(25, 50);
        const { url, options, headers } = call();
        expect(url).toBe(`${BASE}?limit=25&offset=50`);
        expect(url).not.toContain("/admin");
        expect((options.method ?? "GET").toUpperCase()).toBe("GET");
        expect(headers.Authorization).toBe("Bearer tok");
        expect(headers["X-Org-Id"]).toBe("org-1");
    });

    it("creates with POST and the exact body", async () => {
        const body = {
            name: "Okta",
            protocol: "oidc" as const,
            oidc_config: { client_id: "cid", client_secret: "s3", issuer: "https://idp.test" },
        };
        await createSsoProvider(body);
        const { url, options } = call();
        expect(url).toBe(BASE);
        expect(options.method).toBe("POST");
        expect(JSON.parse(options.body as string)).toEqual(body);
    });

    it("updates with PATCH and sends only the members given", async () => {
        await updateSsoProvider("p-1", { name: "New" });
        const { url, options } = call();
        expect(url).toBe(`${BASE}/p-1`);
        expect(options.method).toBe("PATCH");
        expect(JSON.parse(options.body as string)).toEqual({ name: "New" });
    });

    it("deletes with DELETE and reads a 204 as success with no body", async () => {
        fetchMock.mockResolvedValue({ ok: true, status: 204, statusText: "No Content" });
        const result = await deleteSsoProvider("p-1");
        expect(result.error).toBeUndefined();
        const { url, options } = call();
        expect(url).toBe(`${BASE}/p-1`);
        expect(options.method).toBe("DELETE");
    });

    it("activates and deactivates with POST on their own paths", async () => {
        await activateSsoProvider("p-1");
        expect(call().url).toBe(`${BASE}/p-1/activate`);
        expect(call().options.method).toBe("POST");
        fetchMock.mockClear();
        await deactivateSsoProvider("p-1");
        expect(call().url).toBe(`${BASE}/p-1/deactivate`);
        expect(call().options.method).toBe("POST");
    });
});

describe("a provider id is one path segment", () => {
    it.each([
        ["update", (id: string) => updateSsoProvider(id, { name: "n" }), ""],
        ["delete", (id: string) => deleteSsoProvider(id), ""],
        ["activate", (id: string) => activateSsoProvider(id), "/activate"],
        ["deactivate", (id: string) => deactivateSsoProvider(id), "/deactivate"],
    ])(
        "encodes the id of %s, so an id with a slash cannot reach another route",
        async (_n, act, tail) => {
            await act("../x/y?z");
            expect(call().url).toBe(`${BASE}/..%2Fx%2Fy%3Fz${tail}`);
        },
    );
});

describe("the ops action sso.write", () => {
    it("is named by every write, so an impersonating session is refused", async () => {
        await createSsoProvider({ name: "x", protocol: "saml" });
        await updateSsoProvider("p", { name: "y" });
        await deleteSsoProvider("p");
        await activateSsoProvider("p");
        await deactivateSsoProvider("p");
        expect(sessionContext.mock.calls).toEqual(Array(5).fill([{ write: "sso.write" }]));
    });

    it("is not named by the read", async () => {
        await listSsoProviders();
        expect(sessionContext).toHaveBeenCalledWith();
    });

    it("stops a refused write before any request", async () => {
        sessionContext.mockRejectedValue(
            Object.assign(new Error("Not available while impersonating"), {
                name: "AdminApiError",
                status: 403,
            }),
        );
        const result = await deactivateSsoProvider("p");
        expect(result.status).toBe(403);
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe("failures keep the status the page keys on", () => {
    it("keeps the plan-gate sentence and the 402 status of a read", async () => {
        fetchMock.mockResolvedValue(
            refused(402, "Payment Required", {
                error: "feature_not_licensed",
                required_tier: "enterprise",
                current_tier: "community",
            }),
        );
        expect(await listSsoProviders()).toEqual({ error: GATE, status: 402 });
    });

    it("keeps status 503 and 403 of a read, with the generic sentence", async () => {
        fetchMock.mockResolvedValue(
            refused(503, "Service Unavailable", { message: "SSO provider service unavailable" }),
        );
        const unavailable = await listSsoProviders();
        expect(unavailable.status).toBe(503);
        expect(JSON.stringify(unavailable)).not.toContain("SSO provider service unavailable");
        fetchMock.mockResolvedValue(refused(403, "Forbidden", "Admin access required"));
        expect((await listSsoProviders()).status).toBe(403);
    });

    it("keeps the served text of a 422 on a write and the status of a 403 write", async () => {
        fetchMock.mockResolvedValue(refused(422, "Unprocessable", "issuer: Field required"));
        expect(await createSsoProvider({ name: "x", protocol: "oidc" })).toEqual({
            error: "issuer: Field required",
            status: 422,
        });
        fetchMock.mockResolvedValue(refused(403, "Forbidden", "Admin access required"));
        const forbidden = await deactivateSsoProvider("p");
        expect(forbidden.status).toBe(403);
        expect(JSON.stringify(forbidden)).not.toContain("Admin access required");
    });
});
