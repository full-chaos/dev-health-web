import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    session: undefined as unknown,
    env: {} as Record<string, string | undefined>,
    transport: undefined as unknown,
}));
vi.mock("@/lib/auth", () => ({
    auth: async () => mocks.session,
    forgetOwnImpersonationStatus: vi.fn(),
}));
vi.mock("@/lib/config", async (orig) => ({
    ...(await orig<typeof import("@/lib/config")>()),
    getServerEnv: () => mocks.env,
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/auth/decide/config", async (orig) => ({
    ...(await orig<typeof import("@/lib/auth/decide/config")>()),
    getDecideTransport: () => mocks.transport,
}));
vi.mock("@/lib/auth/shadow", () => ({
    scheduleShadow: () => {
        throw new Error("shadow exploded");
    },
}));

import { AdminApiError } from "../../api";
import { ALLOW, DENY, TOKEN, answering, session } from "@/lib/auth/decide/__tests__/helpers";
import { requireSuperuserToken } from "../_shared";

beforeEach(() => {
    mocks.env = { AUTHZ_DECISIONS_ENFORCE: "on", AUTHZ_PLATFORM_UI: "shadow" };
    mocks.session = session({ is_superuser: true });
});

describe("the shadow call never gates the enforced guard", () => {
    it("a deny stays a 403 AdminApiError when the shadow call throws", async () => {
        mocks.transport = answering(DENY).transport;
        const err = await requireSuperuserToken({ action: "admin.orgs" }).then(
            () => undefined,
            (e: unknown) => e,
        );
        expect(err).toBeInstanceOf(AdminApiError);
        expect((err as AdminApiError).status).toBe(403);
    });

    it("an allow stays the token when the shadow call throws", async () => {
        mocks.transport = answering(ALLOW).transport;
        await expect(requireSuperuserToken({ action: "admin.orgs" })).resolves.toBe(TOKEN);
    });
});
