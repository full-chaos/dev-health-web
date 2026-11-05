import type { Session } from "next-auth";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    env: {} as Record<string, string | undefined>,
    status: vi.fn(),
    info: vi.fn(),
}));
vi.mock("@/lib/config", async (orig) => ({
    ...(await orig<typeof import("@/lib/config")>()),
    getServerEnv: () => mocks.env,
}));
vi.mock("@/lib/impersonationStatusMemo", () => ({ readImpersonationStatus: mocks.status }));
vi.mock("@/lib/logger", () => ({
    logger: { info: mocks.info, warn: vi.fn(), error: vi.fn() },
}));

import { ORG_IMPERSONATION_DENIED_ACTIONS } from "../actionTable";
import {
    IMPERSONATION_DENY_PATH,
    IMPERSONATION_LIMIT_MESSAGE,
    impersonationLimit,
    impersonationLimited,
    refuseOrgWrite,
} from "../limits";

function session(over: Record<string, unknown> = {}, token: string | null = "tok-1"): Session {
    return {
        user: {
            id: "admin-1",
            org_id: "org-1",
            role: "member",
            is_superuser: true,
            is_impersonating: false,
            ...over,
        },
        access_token: token ?? undefined,
        expires: "2099-01-01",
    } as unknown as Session;
}

beforeEach(() => {
    mocks.env = {};
    mocks.status.mockReset();
    mocks.info.mockReset();
});

describe("C3/C4 off and shadow: no limit, no status read", () => {
    it.each([undefined, "off", "shadow", "Enforce", " enforce"])(
        "AUTHZ_PLATFORM_UI=%j",
        async (value) => {
            mocks.env = { AUTHZ_PLATFORM_UI: value };
            mocks.status.mockRejectedValue(new Error("down"));
            const s = session({ is_impersonating: true });
            expect(await impersonationLimit(s)).toBeNull();
            expect(await impersonationLimited(s)).toBe(false);
            expect(await refuseOrgWrite(s, "org.write")).toBe(false);
            expect(mocks.status).not.toHaveBeenCalled();
            expect(mocks.info).not.toHaveBeenCalled();
        },
    );
});

describe("C6 enforce: an impersonating session is limited", () => {
    beforeEach(() => {
        mocks.env = { AUTHZ_PLATFORM_UI: "enforce" };
    });

    it("the session flag alone limits it", async () => {
        mocks.status.mockResolvedValue({ is_impersonating: false });
        expect(await impersonationLimit(session({ is_impersonating: true }))).toBe("impersonating");
    });

    it("a superuser that is not impersonating is not limited", async () => {
        mocks.status.mockResolvedValue({ is_impersonating: false });
        expect(await impersonationLimit(session())).toBeNull();
        expect(mocks.status).toHaveBeenCalledWith(
            expect.objectContaining({ userId: "admin-1", accessToken: "tok-1", force: false }),
        );
    });

    it("a user that is not a superuser cannot impersonate: no status read", async () => {
        expect(await impersonationLimit(session({ is_superuser: false }))).toBeNull();
        expect(mocks.status).not.toHaveBeenCalled();
    });
});

describe("C10 the server status decides, not a client flag", () => {
    it("a session that says not impersonating is limited when the status says impersonating", async () => {
        mocks.env = { AUTHZ_PLATFORM_UI: "enforce" };
        mocks.status.mockResolvedValue({ is_impersonating: true });
        expect(await impersonationLimit(session({ is_impersonating: false }))).toBe(
            "impersonating",
        );
    });
});

describe("C11 enforce fails closed", () => {
    beforeEach(() => {
        mocks.env = { AUTHZ_PLATFORM_UI: "enforce" };
    });

    it("no status (read failed or in its wait) is a limit", async () => {
        mocks.status.mockResolvedValue(undefined);
        expect(await impersonationLimit(session())).toBe("status_unknown");
        expect(await impersonationLimited(session())).toBe(true);
    });

    it("a status read that throws is a limit", async () => {
        mocks.status.mockRejectedValue(new Error("down"));
        expect(await impersonationLimit(session())).toBe("status_unknown");
    });

    it("a superuser session with no token is a limit", async () => {
        expect(await impersonationLimit(session({}, null))).toBe("status_unknown");
        expect(mocks.status).not.toHaveBeenCalled();
    });
});

describe("C7 org writes while impersonating in enforce", () => {
    beforeEach(() => {
        mocks.env = { AUTHZ_PLATFORM_UI: "enforce" };
    });

    it.each(ORG_IMPERSONATION_DENIED_ACTIONS)("%s is refused with one log line", async (action) => {
        mocks.status.mockResolvedValue({ is_impersonating: true });
        expect(await refuseOrgWrite(session({ is_impersonating: true }), action)).toBe(true);
        expect(mocks.info).toHaveBeenCalledTimes(1);
        expect(mocks.info).toHaveBeenCalledWith(
            { action, cause: "impersonating", surface: "org_write" },
            "impersonation_limit",
        );
    });

    it("the log line has no token, user id or organization id", async () => {
        await refuseOrgWrite(session({ is_impersonating: true }), "org.write");
        const line = JSON.stringify(mocks.info.mock.calls);
        expect(line).not.toMatch(/tok-1|admin-1|org-1/);
    });

    it("a superuser that is not impersonating writes", async () => {
        mocks.status.mockResolvedValue({ is_impersonating: false });
        expect(await refuseOrgWrite(session(), "org.write")).toBe(false);
        expect(mocks.info).not.toHaveBeenCalled();
    });

    it("an org owner that is not a superuser writes", async () => {
        expect(
            await refuseOrgWrite(session({ is_superuser: false, role: "owner" }), "org.delete"),
        ).toBe(false);
    });
});

describe("constants", () => {
    it("deny page path and message", () => {
        expect(IMPERSONATION_DENY_PATH).toBe("/impersonation-restricted");
        expect(IMPERSONATION_LIMIT_MESSAGE).toBe("Not available while impersonating");
    });
});
