import { beforeEach, describe, expect, it, vi } from "vitest";

const { auth } = vi.hoisted(() => ({ auth: vi.fn() }));

vi.mock("@/lib/auth", () => ({ auth }));
vi.mock("@/lib/origin", () => ({ getBackendUrl: () => "http://backend.test" }));

import { getAuditLog } from "./actions";

const fetchMock = vi.fn();

describe("getAuditLog request (CHAOS-9275)", () => {
    beforeEach(() => {
        fetchMock.mockReset();
        fetchMock.mockResolvedValue(
            new Response(JSON.stringify({ items: [], total: 0, limit: 50, offset: 0 }), {
                status: 200,
            }),
        );
        vi.stubGlobal("fetch", fetchMock);
    });

    it("sends the org of a platform admin on the default load", async () => {
        auth.mockResolvedValue({
            access_token: "t",
            user: { is_superuser: true, org_id: "11111111-1111-4111-8111-111111111111" },
        });
        const result = await getAuditLog({ limit: 50, offset: 0 });
        expect(result.error).toBeUndefined();
        const url = new URL(String(fetchMock.mock.calls[0][0]));
        expect(url.pathname).toBe("/api/v1/billing/audit");
        expect(url.searchParams.get("org_id")).toBe("11111111-1111-4111-8111-111111111111");
        expect(url.searchParams.get("limit")).toBe("50");
    });

    it("drops empty filter values and lets a chosen org win", async () => {
        auth.mockResolvedValue({
            access_token: "t",
            user: { is_superuser: true, org_id: "11111111-1111-4111-8111-111111111111" },
        });
        await getAuditLog({ org_id: "22222222-2222-4222-8222-222222222222", action: "" });
        const url = new URL(String(fetchMock.mock.calls[0][0]));
        expect(url.searchParams.get("org_id")).toBe("22222222-2222-4222-8222-222222222222");
        expect(url.searchParams.has("action")).toBe(false);
    });

    it("makes no call that the backend would refuse when no org is known", async () => {
        auth.mockResolvedValue({ access_token: "t", user: { is_superuser: true } });
        const result = await getAuditLog({ limit: 50, offset: 0 });
        expect(result.error).toBeTruthy();
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
