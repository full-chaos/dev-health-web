import type { Session } from "next-auth";
import { describe, expect, it, vi } from "vitest";
import { shadowDecide, shadowInputFrom } from "../run";
import type { Surface } from "../catalog";
import { ALLOW, ORG, recordingTransport, TOKEN } from "./helpers";

const extraRow: Surface = {
    id: "extra:ui",
    clientAllowed: () => true,
    request: { action: "integrations.read", resource: "organization" },
};

const session = (id: string) =>
    ({ user: { id, org_id: ORG, role: "admin" }, access_token: TOKEN }) as Session;

const logger = () => ({ info: vi.fn(), debug: vi.fn() });

describe("shadow sampling key", () => {
    it("lets two renders with different surface sets both reach the decision", async () => {
        const { transport, calls } = recordingTransport([ALLOW]);
        const now = () => 6_000_000_000_000;
        const nav = shadowInputFrom(session("key-a"), ["guard:/org/admin"]);
        const page = shadowInputFrom(session("key-a"), ["extra:ui"], { surfaces: [extraRow] });
        const first = await shadowDecide(nav, { transport, log: logger(), nowMs: now });
        const second = await shadowDecide(page, { transport, log: logger(), nowMs: now });
        expect(first.status).toBe("ran");
        expect(second.status).toBe("ran");
        expect(calls).toHaveLength(2);
    });

    it("samples the same surface set again inside the window", async () => {
        const { transport, calls } = recordingTransport([ALLOW]);
        const now = () => 6_100_000_000_000;
        const a = shadowInputFrom(session("key-b"), ["guard:/org/admin"]);
        const b = shadowInputFrom(session("key-b"), ["guard:/org/admin"]);
        await shadowDecide(a, { transport, log: logger(), nowMs: now });
        const again = await shadowDecide(b, { transport, log: logger(), nowMs: now });
        expect(again).toEqual({ status: "skipped", reason: "sampled" });
        expect(calls).toHaveLength(1);
    });

    it("samples the same surface set in another order and with repeats", async () => {
        const { transport, calls } = recordingTransport([ALLOW, ALLOW]);
        const now = () => 6_200_000_000_000;
        const opts = { surfaces: [extraRow] };
        const a = shadowInputFrom(session("key-c"), ["guard:/org/admin", "extra:ui"], opts);
        const b = shadowInputFrom(
            session("key-c"),
            ["extra:ui", "guard:/org/admin", "extra:ui"],
            opts,
        );
        expect(b.sampleKey).toBe(a.sampleKey);
        await shadowDecide(a, { transport, log: logger(), nowMs: now });
        const again = await shadowDecide(b, { transport, log: logger(), nowMs: now });
        expect(again).toEqual({ status: "skipped", reason: "sampled" });
        expect(calls).toHaveLength(1);
    });

    it("writes one Debug line with the surface set and the reason on a sampled skip", async () => {
        const { transport } = recordingTransport([ALLOW, ALLOW]);
        const now = () => 6_300_000_000_000;
        const opts = { surfaces: [extraRow] };
        const log = logger();
        const a = shadowInputFrom(session("key-d"), ["guard:/org/admin", "extra:ui"], opts);
        const b = shadowInputFrom(session("key-d"), ["extra:ui", "guard:/org/admin"], opts);
        await shadowDecide(a, { transport, log, nowMs: now });
        log.info.mockClear();
        await shadowDecide(b, { transport, log, nowMs: now });
        expect(log.info).not.toHaveBeenCalled();
        expect(log.debug).toHaveBeenCalledTimes(1);
        const [fields, message] = log.debug.mock.calls[0];
        expect(Object.keys(fields).sort()).toEqual(["reason", "surfaces"]);
        expect(fields).toEqual({ surfaces: "extra:ui,guard:/org/admin", reason: "sampled" });
        expect(message).toBe("authz_shadow_skip");
        const text = JSON.stringify(log.debug.mock.calls);
        for (const secret of [TOKEN, "key-d", ORG, "principal_reference", "access_token"]) {
            expect(text).not.toContain(secret);
        }
    });

    it("writes one Debug line when the memo is full and a new key is refused", async () => {
        const { transport } = recordingTransport([ALLOW]);
        const now = () => 6_400_000_000_000;
        const log = logger();
        for (let i = 0; i < 1000; i += 1) {
            await shadowDecide(shadowInputFrom(session(`full-${i}`), ["guard:/org/admin"]), {
                transport,
                log: logger(),
                nowMs: now,
            });
        }
        const over = await shadowDecide(shadowInputFrom(session("full-x"), ["guard:/org/admin"]), {
            transport,
            log,
            nowMs: now,
        });
        expect(over).toEqual({ status: "skipped", reason: "sampled" });
        expect(log.debug).toHaveBeenCalledTimes(1);
    });
});
