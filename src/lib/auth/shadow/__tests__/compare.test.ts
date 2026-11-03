import { describe, expect, it, vi } from "vitest";
import { shadowDecide } from "../run";
import { ALLOW, DENY, input, recordingTransport } from "./helpers";

const log = () => ({ info: vi.fn() });

async function run(over: Record<string, unknown>, verdict = ALLOW) {
    const { transport, calls } = recordingTransport([verdict]);
    const r = await shadowDecide(input(over) as never, { transport, log: log() });
    return { r, calls };
}

describe("shadow compare", () => {
    it("pdp allow with a client allow is a match", async () => {
        const { r } = await run({}, ALLOW);
        expect(r.status === "ran" && r.record.counts).toEqual({
            match: 1,
            mismatch: 0,
            unavailable: 0,
            no_action: 0,
        });
    });

    it("pdp deny with a client deny is a match", async () => {
        const { r } = await run(
            { viewer: { isPlatformAdmin: false, role: "viewer", isImpersonating: false } },
            DENY,
        );
        expect(r.status === "ran" && r.record.counts.match).toBe(1);
    });

    it("pdp deny against a client allow is a mismatch with the reason and ids", async () => {
        const { r } = await run({}, DENY);
        expect(r.status).toBe("ran");
        if (r.status !== "ran") return;
        expect(r.record.counts.mismatch).toBe(1);
        expect(r.record.mismatches).toHaveLength(1);
        expect(r.record.mismatches[0]).toMatchObject({
            surface: "guard:/org/admin",
            action: "integrations.read",
            clientAllowed: true,
            decisionAllowed: false,
            reasonCode: "role_lacks_action",
        });
    });

    it("pdp allow against a client deny is a mismatch", async () => {
        const { r } = await run(
            { viewer: { isPlatformAdmin: false, role: "member", isImpersonating: false } },
            ALLOW,
        );
        expect(r.status === "ran" && r.record.counts.mismatch).toBe(1);
    });

    it("a platform admin passes the client guard for any role", async () => {
        const { r } = await run(
            { viewer: { isPlatformAdmin: true, role: "viewer", isImpersonating: false } },
            DENY,
        );
        expect(r.status === "ran" && r.record.mismatches[0].clientAllowed).toBe(true);
    });

    it("a client-source deny is unavailable, never a mismatch", async () => {
        const transport = async () => ({ status: 503, body: "" });
        const r = await shadowDecide(input() as never, { transport, log: log() });
        expect(r.status === "ran" && r.record.counts).toEqual({
            match: 0,
            mismatch: 0,
            unavailable: 1,
            no_action: 0,
        });
    });

    it("an unmapped row is counted and never sent", async () => {
        const { r, calls } = await run({
            surfaceIds: [
                "nav:platform",
                "nav:platform-billing",
                "guard:/superadmin",
                "guard:/data-health",
            ],
        });
        expect(calls).toHaveLength(0);
        expect(r.status === "ran" && r.record.counts.no_action).toBe(4);
    });

    it("sends only the mapped row, with the catalog action on the organization", async () => {
        const { calls } = await run({ surfaceIds: ["nav:platform", "guard:/org/admin"] });
        expect(calls).toHaveLength(1);
        const body = JSON.parse(calls[0].body) as {
            requests: { action: string; resource: { type: string; key: string } }[];
        };
        expect(body.requests).toHaveLength(1);
        expect(body.requests[0].action).toBe("integrations.read");
        expect(body.requests[0].resource).toEqual({
            type: "organization",
            key: "org-1",
            organization_id: "org-1",
        });
    });

    it("skips an unknown surface id", async () => {
        const { r, calls } = await run({ surfaceIds: ["guard:/nowhere"] });
        expect(calls).toHaveLength(0);
        expect(r.status === "ran" && r.record.surfaces).toEqual([]);
    });
});

describe("shadow sampling", () => {
    it("asks once per key in five minutes, then again", async () => {
        const { transport, calls } = recordingTransport([ALLOW]);
        const same = input();
        let t = 1_000_000;
        const deps = { transport, log: log(), nowMs: () => t };
        expect((await shadowDecide({ ...same }, deps)).status).toBe("ran");
        expect(await shadowDecide({ ...same }, deps)).toEqual({
            status: "skipped",
            reason: "sampled",
        });
        t += 5 * 60 * 1000 + 1;
        expect((await shadowDecide({ ...same }, deps)).status).toBe("ran");
        expect(calls).toHaveLength(2);
    });
});
