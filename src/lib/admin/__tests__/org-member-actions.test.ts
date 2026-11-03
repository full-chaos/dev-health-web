import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn() }));

import { mockAuth } from "@/test/mocks/auth";
import {
    addOrgMemberByEmail,
    changeOrgMemberRole,
    createOrganization,
    deleteOrganization,
    updateOrgProfile,
    updateOrganization,
} from "../server";
import { ORG_MEMBER_REFUSAL } from "../orgMemberErrors";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const T = ORG_MEMBER_REFUSAL;

describe("org member actions: refusal vocabulary", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.stubEnv("BACKEND_URL", "http://test-ops:8000");
        mockAuth({ user: { id: "u-1", org_id: "org-1", is_superuser: true } });
    });

    it("shows the last-owner text for the legacy 400 of a role change", async () => {
        vi.spyOn(global, "fetch").mockResolvedValue(
            json({ detail: "Cannot remove the last owner of an organization" }, 400),
        );
        const result = await changeOrgMemberRole("org-9", "u-2", "admin");
        expect(result.error).toBe(T.lastOwner);
        expect(result.status).toBe(400);
    });

    it("shows the last-owner text for a 409 last_owner code", async () => {
        vi.spyOn(global, "fetch").mockResolvedValue(
            json({ detail: { error: "last_owner", message: "internal words" } }, 409),
        );
        const result = await changeOrgMemberRole("org-9", "u-2", "admin");
        expect(result.error).toBe(T.lastOwner);
        expect(result.error).not.toContain("internal");
    });

    it("shows the unavailable text for the proxy 503 and does not retry the write", async () => {
        const spy = vi
            .spyOn(global, "fetch")
            .mockResolvedValue(
                json({ detail: { message: "Authentication service unavailable" } }, 503),
            );
        const result = await changeOrgMemberRole("org-9", "u-2", "admin");
        expect(result.error).toBe(T.unavailable);
        expect(spy).toHaveBeenCalledTimes(1);
    });

    it("maps the refusal of an add by email", async () => {
        vi.spyOn(global, "fetch")
            .mockResolvedValueOnce(json([{ id: "u-2", email: "a@b.co" }]))
            .mockResolvedValueOnce(
                json({ detail: "User is already a member of this organization" }, 400),
            );
        const result = await addOrgMemberByEmail("org-9", "a@b.co", "member");
        expect(result.error).toBe(T.alreadyMember);
    });

    it("never echoes the detail of an unknown code", async () => {
        vi.spyOn(global, "fetch").mockResolvedValue(
            json({ detail: { error: "zz_new_code", message: "secret-detail-77" } }, 409),
        );
        const result = await changeOrgMemberRole("org-9", "u-2", "admin");
        expect(result.error).toBe(T.generic);
        expect(result.error).not.toContain("secret-detail-77");
    });

    it("shows the unavailable text for org create, update and delete refusals", async () => {
        vi.spyOn(global, "fetch").mockResolvedValue(
            json({ detail: { message: "Authentication service unavailable" } }, 503),
        );
        expect((await createOrganization({ name: "x", slug: "x" } as never)).error).toBe(
            T.unavailable,
        );
        expect((await updateOrganization("org-9", { is_active: false })).error).toBe(T.unavailable);
        expect((await deleteOrganization("org-9")).error).toBe(T.unavailable);
    });

    it("keeps a local validation answer", async () => {
        const spy = vi.spyOn(global, "fetch").mockResolvedValue(json({}));
        const result = await addOrgMemberByEmail("org-9", "a@b.co", "root");
        expect(result.error).toContain("Unknown role");
        expect(spy).not.toHaveBeenCalled();
    });
});

describe("updateOrgProfile", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.stubEnv("BACKEND_URL", "http://test-ops:8000");
        mockAuth({ user: { id: "u-1", org_id: "org-1", is_superuser: false } });
    });

    it("sends PATCH /orgs/me with the session org", async () => {
        const spy = vi.spyOn(global, "fetch").mockResolvedValue(json({ id: "org-1", name: "N" }));
        const result = await updateOrgProfile({ name: "N" });
        expect(result.error).toBeUndefined();
        const [url, options] = spy.mock.calls[0] as [string, RequestInit];
        expect(url).toBe("http://test-ops:8000/api/v1/orgs/me");
        expect(options.method).toBe("PATCH");
        expect((options.headers as Record<string, string>)["X-Org-Id"]).toBe("org-1");
    });

    it("shows the unavailable text for a 503", async () => {
        vi.spyOn(global, "fetch").mockResolvedValue(
            json({ detail: { message: "Authentication service unavailable" } }, 503),
        );
        const result = await updateOrgProfile({ name: "N" });
        expect(result.error).toBe(T.unavailable);
    });
});
