import type { Session } from "next-auth";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    after: vi.fn(),
    enabled: vi.fn(),
    transport: vi.fn(),
}));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("../config", async (orig) => ({
    ...(await orig<typeof import("../config")>()),
    shadowEnabled: mocks.enabled,
    getShadowTransport: mocks.transport,
}));

import { scheduleShadow } from "../index";

const session = { user: { id: "u", org_id: "org-1", role: "admin" }, access_token: "t" } as Session;

describe("scheduleShadow", () => {
    beforeEach(() => {
        mocks.after.mockReset();
        mocks.enabled.mockReset();
        mocks.transport.mockReset();
    });

    it("does nothing while the switch is off", () => {
        mocks.enabled.mockReturnValue(false);
        mocks.transport.mockReturnValue(async () => ({ status: 200, body: "" }));
        scheduleShadow(session, ["guard:/org/admin"]);
        expect(mocks.after).not.toHaveBeenCalled();
    });

    it("does nothing without a transport", () => {
        mocks.enabled.mockReturnValue(true);
        mocks.transport.mockReturnValue(undefined);
        scheduleShadow(session, ["guard:/org/admin"]);
        expect(mocks.after).not.toHaveBeenCalled();
    });

    it("hands the work to after() and returns nothing", () => {
        mocks.enabled.mockReturnValue(true);
        mocks.transport.mockReturnValue(async () => ({ status: 503, body: "" }));
        expect(scheduleShadow(session, ["guard:/org/admin"])).toBeUndefined();
        expect(mocks.after).toHaveBeenCalledOnce();
    });

    it("never throws when after() throws (outside a request scope)", () => {
        mocks.enabled.mockReturnValue(true);
        mocks.transport.mockReturnValue(async () => ({ status: 503, body: "" }));
        mocks.after.mockImplementation(() => {
            throw new Error("outside request scope");
        });
        expect(() => scheduleShadow(session, ["guard:/org/admin"])).not.toThrow();
    });

    it("never throws when the switch reader throws", () => {
        mocks.enabled.mockImplementation(() => {
            throw new Error("env");
        });
        expect(() => scheduleShadow(session, ["guard:/org/admin"])).not.toThrow();
    });
});
