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

import { AdminApiError } from "../../api";
import {
    ALLOW,
    DENY,
    TOKEN,
    answering,
    recordingTransport,
    session,
} from "@/lib/auth/decide/__tests__/helpers";
import { requireSuperuserToken } from "../_shared";

const refusal = async (p: Promise<unknown>) => {
    const err = await p.then(
        () => undefined,
        (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(AdminApiError);
    return err as AdminApiError;
};

beforeEach(() => {
    mocks.session = undefined;
    mocks.env = {};
    mocks.transport = undefined;
});

describe("A3 switch off: today's behavior", () => {
    it("no token is 401", async () => {
        mocks.session = session({ is_superuser: true }, null);
        const e = await refusal(requireSuperuserToken({ action: "admin.orgs" }));
        expect(e.status).toBe(401);
    });

    it("a non-superuser is 403 Superuser access required", async () => {
        mocks.session = session({ is_superuser: false, role: "owner" });
        const e = await refusal(requireSuperuserToken({ action: "admin.orgs" }));
        expect(e.status).toBe(403);
        expect(e.detail).toBe("Superuser access required");
    });

    it("a superuser gets the token", async () => {
        mocks.session = session({ is_superuser: true });
        await expect(requireSuperuserToken({ action: "admin.orgs" })).resolves.toBe(TOKEN);
    });

    it("an impersonating superuser is 403, unless allowImpersonating", async () => {
        mocks.session = session({ is_superuser: true, is_impersonating: true });
        const e = await refusal(requireSuperuserToken({ action: "admin.orgs" }));
        expect(e.detail).toBe("Not available while impersonating");
        await expect(
            requireSuperuserToken({ action: "admin.impersonate", allowImpersonating: true }),
        ).resolves.toBe(TOKEN);
    });

    it("asks nothing even if a transport exists", async () => {
        const { transport, calls } = answering(DENY);
        mocks.transport = transport;
        mocks.session = session({ is_superuser: true });
        await expect(
            requireSuperuserToken({ action: "admin.users", guard: "platform.users" }),
        ).resolves.toBe(TOKEN);
        expect(calls).toHaveLength(0);
    });
});

describe("A3 switch on: the decision point decides", () => {
    beforeEach(() => {
        mocks.env = { AUTHZ_DECISIONS_ENFORCE: "on" };
    });

    it.each([
        [undefined, "admin.orgs"],
        ["platform.orgs" as const, "admin.orgs"],
        ["platform.users" as const, "admin.users"],
    ])("guard %s asks %s", async (guard, action) => {
        const { transport, calls } = answering(ALLOW);
        mocks.transport = transport;
        mocks.session = session({ is_superuser: false, role: "member" });
        await expect(
            requireSuperuserToken({ action: "admin.orgs", ...(guard ? { guard } : {}) }),
        ).resolves.toBe(TOKEN);
        expect(calls).toHaveLength(1);
        expect(JSON.parse(calls[0]?.body ?? "{}").action).toBe(action);
    });

    it("a superuser the decision point denies is 403 with a safe sentence", async () => {
        mocks.transport = answering(DENY).transport;
        mocks.session = session({ is_superuser: true });
        const e = await refusal(requireSuperuserToken({ action: "admin.orgs" }));
        expect(e.status).toBe(403);
        expect(e.detail).toBe("You do not have access to this.");
        expect(e.detail).not.toMatch(/role_lacks_action|dec_/);
    });

    it("no transport is a deny and the superuser flag does not rescue it", async () => {
        mocks.session = session({ is_superuser: true });
        const e = await refusal(requireSuperuserToken({ action: "admin.orgs" }));
        expect(e.status).toBe(403);
    });

    it("a failing transport is a deny", async () => {
        mocks.transport = recordingTransport(async () => {
            throw new Error("down");
        }).transport;
        mocks.session = session({ is_superuser: true });
        const e = await refusal(
            requireSuperuserToken({ action: "admin.users", guard: "platform.users" }),
        );
        expect(e.status).toBe(403);
    });

    it("the unmapped guard keeps the client rule and asks nothing", async () => {
        const { transport, calls } = answering(DENY);
        mocks.transport = transport;
        mocks.session = session({ is_superuser: true });
        await expect(
            requireSuperuserToken({ action: "admin.impersonate", guard: "unmapped" }),
        ).resolves.toBe(TOKEN);
        mocks.session = session({ is_superuser: false });
        const e = await refusal(
            requireSuperuserToken({ action: "admin.impersonate", guard: "unmapped" }),
        );
        expect(e.status).toBe(403);
        expect(calls).toHaveLength(0);
    });
});

describe("order: token 401, then impersonating 403, then the decision", () => {
    beforeEach(() => {
        mocks.env = { AUTHZ_DECISIONS_ENFORCE: "on" };
    });

    it("no token is 401 and asks nothing", async () => {
        const { transport, calls } = answering(ALLOW);
        mocks.transport = transport;
        mocks.session = session({ is_superuser: true, is_impersonating: true }, null);
        const e = await refusal(requireSuperuserToken({ action: "admin.orgs" }));
        expect(e.status).toBe(401);
        expect(calls).toHaveLength(0);
    });

    it("an impersonating session is 403 before the decision point is asked", async () => {
        const { transport, calls } = answering(ALLOW);
        mocks.transport = transport;
        mocks.session = session({ is_superuser: true, is_impersonating: true });
        const e = await refusal(requireSuperuserToken({ action: "admin.orgs" }));
        expect(e.status).toBe(403);
        expect(e.detail).toBe("Not available while impersonating");
        expect(calls).toHaveLength(0);
    });

    it("the impersonation refusal comes first and does not depend on the superuser flag", async () => {
        const { transport, calls } = answering(ALLOW);
        mocks.transport = transport;
        mocks.session = session({ is_superuser: false, role: "admin", is_impersonating: true });
        const e = await refusal(requireSuperuserToken({ action: "admin.orgs" }));
        expect(e.status).toBe(403);
        expect(e.detail).toBe("Not available while impersonating");
        expect(calls).toHaveLength(0);
    });

    it("allowImpersonating skips the impersonation refusal and then the decision runs", async () => {
        const { transport, calls } = answering(ALLOW);
        mocks.transport = transport;
        mocks.session = session({ is_superuser: true, is_impersonating: true });
        await expect(
            requireSuperuserToken({
                action: "admin.orgs",
                allowImpersonating: true,
                guard: "platform.orgs",
            }),
        ).resolves.toBe(TOKEN);
        expect(calls).toHaveLength(1);
    });

    it("a session that is not impersonating reaches the decision", async () => {
        const { transport, calls } = answering(ALLOW);
        mocks.transport = transport;
        mocks.session = session({ is_superuser: true });
        await requireSuperuserToken({ action: "admin.orgs" });
        expect(calls).toHaveLength(1);
    });
});
