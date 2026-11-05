import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn() }));

import { mockAuth } from "@/test/mocks/auth";
import * as actions from "../server";
import { ORG_MEMBER_REFUSAL } from "../orgMemberErrors";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const T = ORG_MEMBER_REFUSAL;

function lastCall(spy: ReturnType<typeof vi.spyOn>) {
    const [url, options] = spy.mock.calls[0] as [string, RequestInit];
    return {
        url,
        method: options.method,
        body: options.body ? JSON.parse(options.body as string) : undefined,
        headers: options.headers as Record<string, string>,
    };
}

describe("org member UI actions: superuser", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.stubEnv("BACKEND_URL", "http://test-ops:8000");
        mockAuth({ user: { id: "u-1", org_id: "org-1", is_superuser: true } });
    });

    it("removes a member with DELETE /admin/orgs/:org/members/:user", async () => {
        const spy = vi
            .spyOn(global, "fetch")
            .mockResolvedValue(new Response(null, { status: 204 }));
        const result = await actions.removeOrgMember("org-9", "u-2");
        expect(result.error).toBeUndefined();
        const call = lastCall(spy);
        expect(call.url).toBe("http://test-ops:8000/api/v1/admin/orgs/org-9/members/u-2");
        expect(call.method).toBe("DELETE");
    });

    it("transfers ownership with POST /admin/orgs/:org/transfer-ownership", async () => {
        const spy = vi
            .spyOn(global, "fetch")
            .mockResolvedValue(new Response(null, { status: 204 }));
        const result = await actions.transferOrgOwnership("org-9", "u-3");
        expect(result.error).toBeUndefined();
        const call = lastCall(spy);
        expect(call.url).toBe("http://test-ops:8000/api/v1/admin/orgs/org-9/transfer-ownership");
        expect(call.method).toBe("POST");
        expect(call.body).toEqual({ new_owner_user_id: "u-3" });
    });

    it("creates an invite with a trimmed lower-case email", async () => {
        const spy = vi.spyOn(global, "fetch").mockResolvedValue(json({ id: "i-1" }, 201));
        const result = await actions.inviteOrgMember("org-9", "  New@Example.COM ", "admin");
        expect(result.error).toBeUndefined();
        const call = lastCall(spy);
        expect(call.url).toBe("http://test-ops:8000/api/v1/admin/orgs/org-9/invites");
        expect(call.method).toBe("POST");
        expect(call.body).toEqual({ email: "new@example.com", role: "admin" });
    });

    it("refuses an invite for owner, an unknown role or an empty email before any call", async () => {
        const spy = vi.spyOn(global, "fetch").mockResolvedValue(json({}));
        expect((await actions.inviteOrgMember("org-9", "a@b.co", "owner")).error).toBeDefined();
        expect((await actions.inviteOrgMember("org-9", "a@b.co", "root")).error).toBeDefined();
        expect((await actions.inviteOrgMember("org-9", "   ", "member")).error).toBeDefined();
        expect(spy).not.toHaveBeenCalled();
    });

    it("maps the refusals of remove, transfer and invite", async () => {
        vi.spyOn(global, "fetch").mockResolvedValueOnce(
            json({ detail: { error: "last_owner", message: "internal" } }, 409),
        );
        expect((await actions.removeOrgMember("org-9", "u-2")).error).toBe(T.lastOwner);
        vi.spyOn(global, "fetch").mockResolvedValueOnce(
            json({ detail: { error: "not_owner", message: "internal" } }, 409),
        );
        expect((await actions.transferOrgOwnership("org-9", "u-3")).error).toBe(T.notOwner);
        vi.spyOn(global, "fetch").mockResolvedValueOnce(
            json({ detail: { error: "invite_pending", message: "internal" } }, 409),
        );
        expect((await actions.inviteOrgMember("org-9", "a@b.co", "member")).error).toBe(
            T.invitePending,
        );
    });

    it("shows the unavailable text for a 503 and sends the write once", async () => {
        const spy = vi
            .spyOn(global, "fetch")
            .mockResolvedValue(
                json({ detail: { message: "Authentication service unavailable" } }, 503),
            );
        expect((await actions.transferOrgOwnership("org-9", "u-3")).error).toBe(T.unavailable);
        expect(spy).toHaveBeenCalledTimes(1);
    });

    it("shows the forbidden text for the impersonation 403 without a local check", async () => {
        const spy = vi
            .spyOn(global, "fetch")
            .mockResolvedValue(
                json({ detail: "Impersonated sessions cannot change members" }, 403),
            );
        const result = await actions.removeOrgMember("org-9", "u-2");
        expect(result.error).toBe(T.forbidden);
        expect(spy).toHaveBeenCalledTimes(1);
    });

    it("rejects a caller that is not a superuser before any call", async () => {
        mockAuth({ user: { id: "u-1", org_id: "org-1", is_superuser: false } });
        const spy = vi.spyOn(global, "fetch").mockResolvedValue(json({}));
        expect((await actions.removeOrgMember("org-9", "u-2")).error).toBeDefined();
        expect((await actions.transferOrgOwnership("org-9", "u-3")).error).toBeDefined();
        expect((await actions.inviteOrgMember("org-9", "a@b.co", "member")).error).toBeDefined();
        expect(spy).not.toHaveBeenCalled();
    });
});

describe("org member UI actions: org admin invite", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.stubEnv("BACKEND_URL", "http://test-ops:8000");
        mockAuth({ user: { id: "u-1", org_id: "org-1", is_superuser: false } });
    });

    it("invites into the session org and takes no org id from the caller", async () => {
        const spy = vi.spyOn(global, "fetch").mockResolvedValue(json({ id: "i-1" }, 201));
        const result = await actions.inviteCurrentOrgMember("New@Example.com", "viewer");
        expect(result.error).toBeUndefined();
        const call = lastCall(spy);
        expect(call.url).toBe("http://test-ops:8000/api/v1/admin/orgs/org-1/invites");
        expect(call.method).toBe("POST");
        expect(call.body).toEqual({ email: "new@example.com", role: "viewer" });
        expect(call.headers["X-Org-Id"]).toBe("org-1");
        expect(actions.inviteCurrentOrgMember.length).toBe(2);
    });

    it("refuses owner and an unknown role before any call", async () => {
        const spy = vi.spyOn(global, "fetch").mockResolvedValue(json({}));
        expect((await actions.inviteCurrentOrgMember("a@b.co", "owner")).error).toBeDefined();
        expect((await actions.inviteCurrentOrgMember("a@b.co", "root")).error).toBeDefined();
        expect(spy).not.toHaveBeenCalled();
    });

    it("fails when the session has no org", async () => {
        mockAuth({ user: { id: "u-1", org_id: "", is_superuser: false } });
        const spy = vi.spyOn(global, "fetch").mockResolvedValue(json({}));
        expect((await actions.inviteCurrentOrgMember("a@b.co", "member")).error).toBeDefined();
        expect(spy).not.toHaveBeenCalled();
    });

    it("maps a refusal and a 503", async () => {
        vi.spyOn(global, "fetch").mockResolvedValueOnce(
            json({ detail: { error: "already_member", message: "x" } }, 409),
        );
        expect((await actions.inviteCurrentOrgMember("a@b.co", "member")).error).toBe(
            T.alreadyMember,
        );
        vi.spyOn(global, "fetch").mockResolvedValueOnce(
            json({ detail: { message: "Authentication service unavailable" } }, 503),
        );
        expect((await actions.inviteCurrentOrgMember("a@b.co", "member")).error).toBe(
            T.unavailable,
        );
    });

    it("has no org-scoped createUser action any more", () => {
        expect("createUser" in actions).toBe(false);
        expect("createPlatformUser" in actions).toBe(true);
    });
});
