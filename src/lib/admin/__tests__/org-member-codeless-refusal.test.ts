import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn() }));

import { mockAuth } from "@/test/mocks/auth";
import * as actions from "../server";
import { ORG_MEMBER_REFUSAL } from "../orgMemberErrors";

const SERVED = "served-detail-text-from-backend";
const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status });

const calls: Record<string, () => Promise<{ error?: string }>> = {
    removeOrgMember: () => actions.removeOrgMember("org-9", "u-2"),
    transferOrgOwnership: () => actions.transferOrgOwnership("org-9", "u-3"),
    inviteOrgMember: () => actions.inviteOrgMember("org-9", "a@b.co", "member"),
    inviteCurrentOrgMember: () => actions.inviteCurrentOrgMember("a@b.co", "member"),
};

describe("org member actions: a code-less unmapped 4xx shows the generic sentence", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.stubEnv("BACKEND_URL", "http://test-ops:8000");
        mockAuth({ user: { id: "u-1", org_id: "org-1", is_superuser: true } });
    });

    for (const [name, run] of Object.entries(calls)) {
        for (const status of [409, 422]) {
            it(`${name} ${status}`, async () => {
                const spy = vi
                    .spyOn(global, "fetch")
                    .mockResolvedValue(json({ detail: SERVED }, status));
                const result = await run();
                expect(result.error).toBe(ORG_MEMBER_REFUSAL.generic);
                expect(result.error).not.toContain(SERVED);
                expect(spy).toHaveBeenCalledTimes(1);
            });
        }
    }
});
