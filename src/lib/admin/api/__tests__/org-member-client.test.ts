import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/origin", () => ({ getBackendUrl: () => "http://backend.test" }));
const fetchMock = vi.fn();
vi.mock("@/lib/serverDeadline", () => ({
    fetchWithDeadline: (...args: unknown[]) => fetchMock(...args),
}));

import { orgsApi } from "../orgs";

const ok = (body: unknown, status = 200) => ({
    ok: true,
    status,
    statusText: "OK",
    json: async () => body,
});

beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(ok({}));
});

describe("orgsApi org member client", () => {
    it("creates an invite with POST /admin/orgs/:org/invites", async () => {
        await orgsApi.invites.create("org-1", { email: "a@b.co", role: "member" }, "tok", "org-1");
        const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe("http://backend.test/api/v1/admin/orgs/org-1/invites");
        expect(options.method).toBe("POST");
        expect(JSON.parse(options.body as string)).toEqual({ email: "a@b.co", role: "member" });
        const headers = options.headers as Record<string, string>;
        expect(headers.Authorization).toBe("Bearer tok");
        expect(headers["X-Org-Id"]).toBe("org-1");
    });

    it("updates the own org profile with PATCH /orgs/me through the client", async () => {
        await orgsApi.updateProfile({ name: "New", description: null }, "tok", "org-1");
        const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe("http://backend.test/api/v1/orgs/me");
        expect(options.method).toBe("PATCH");
        expect(JSON.parse(options.body as string)).toEqual({ name: "New", description: null });
        const headers = options.headers as Record<string, string>;
        expect(headers.Authorization).toBe("Bearer tok");
        expect(headers["X-Org-Id"]).toBe("org-1");
    });

    it("carries the status and code of a refused profile update", async () => {
        fetchMock.mockResolvedValue({
            ok: false,
            status: 409,
            statusText: "Conflict",
            json: async () => ({ detail: { error: "state_changed", message: "x" } }),
        });
        const error = await orgsApi
            .updateProfile({ name: "N" }, "tok", "org-1")
            .catch((e: unknown) => e as { status: number; code?: string });
        expect(error).toMatchObject({ status: 409, code: "state_changed" });
    });
});
