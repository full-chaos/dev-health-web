import type { Session } from "next-auth";
import { describe, expect, it, vi } from "vitest";
import { SAMPLE_WINDOW_MS } from "../config";
import { shadowDecide, shadowInputFrom, type ShadowInput } from "../run";
import type { Surface } from "../catalog";
import { ALLOW, DENY, input, ORG, recordingTransport } from "./helpers";

const extraRow: Surface = {
    id: "extra:ui",
    clientAllowed: () => true,
    request: { action: "integrations.read", resource: "organization" },
};

const session = (id: string) =>
    ({ user: { id, org_id: ORG, role: "admin" }, access_token: "tok-s" }) as Session;

describe("shadow sampling slot", () => {
    it("takes one slot per session for two actionable surface sets", async () => {
        const { transport, calls } = recordingTransport([ALLOW]);
        const now = () => 5_000_000_000_000;
        const a = shadowInputFrom(session("slot-user"), ["guard:/org/admin"]);
        const b = shadowInputFrom(session("slot-user"), ["extra:ui"], { surfaces: [extraRow] });
        await shadowDecide(a, { transport, log: { info: vi.fn() }, nowMs: now });
        const second = await shadowDecide(b, { transport, log: { info: vi.fn() }, nowMs: now });
        expect(calls).toHaveLength(1);
        expect(second).toEqual({ status: "skipped", reason: "sampled" });
    });

    it("does not burn the slot on a call with nothing actionable", async () => {
        const { transport, calls } = recordingTransport([ALLOW]);
        const now = () => 5_100_000_000_000;
        const none = shadowInputFrom(session("idle-user"), ["nav:platform"]);
        const real = shadowInputFrom(session("idle-user"), ["guard:/org/admin"]);
        await shadowDecide(none, { transport, log: { info: vi.fn() }, nowMs: now });
        const ran = await shadowDecide(real, { transport, log: { info: vi.fn() }, nowMs: now });
        expect(ran.status).toBe("ran");
        expect(calls).toHaveLength(1);
    });

    it("keeps live slots when full and skips the new session", async () => {
        const { transport, calls } = recordingTransport([ALLOW]);
        const t0 = 5_200_000_000_000;
        let clock = t0;
        const deps = { transport, log: { info: vi.fn() }, nowMs: () => clock };
        for (let i = 0; i < 1000; i += 1) {
            await shadowDecide(shadowInputFrom(session(`cap-${i}`), ["guard:/org/admin"]), deps);
        }
        expect(calls).toHaveLength(1000);
        const over = await shadowDecide(
            shadowInputFrom(session("cap-1000"), ["guard:/org/admin"]),
            deps,
        );
        expect(over).toEqual({ status: "skipped", reason: "sampled" });
        const again = await shadowDecide(
            shadowInputFrom(session("cap-0"), ["guard:/org/admin"]),
            deps,
        );
        expect(again).toEqual({ status: "skipped", reason: "sampled" });
        expect(calls).toHaveLength(1000);
        clock = t0 + SAMPLE_WINDOW_MS + 1;
        const later = await shadowDecide(
            shadowInputFrom(session("cap-1000"), ["guard:/org/admin"]),
            deps,
        );
        expect(later.status).toBe("ran");
    });

    it("never logs the decision id", async () => {
        const principalLike = "prn_ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        const transport = async () => ({
            status: 200,
            body: JSON.stringify({
                schema_version: "authorization_batch_response.v1",
                decisions: [
                    {
                        index: 0,
                        decision: {
                            schema_version: "authorization_decision.v1",
                            decision_id: principalLike,
                            allowed: DENY.allowed,
                            reason_code: DENY.reason,
                            principal_id: "prn_EXAMPLE0000000000000001",
                            organization_id: ORG,
                            policy_revision: 1,
                            expires_at: "2099-01-01T00:00:00Z",
                        },
                    },
                ],
            }),
        });
        const info = vi.fn();
        await shadowDecide(input() as ShadowInput, { transport, log: { info } });
        expect(info).toHaveBeenCalledTimes(2);
        expect(JSON.stringify(info.mock.calls)).not.toContain(principalLike);
        expect(Object.keys(info.mock.calls[1][0])).not.toContain("decision_id");
    });
});
