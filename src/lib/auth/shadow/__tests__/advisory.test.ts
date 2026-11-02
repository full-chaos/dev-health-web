import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { shadowDecide, type ShadowInput } from "../run";
import { ALLOW, input, recordingTransport } from "./helpers";

const log = () => ({ info: vi.fn() });
const asInput = (over: Record<string, unknown> = {}) => input(over) as ShadowInput;

describe("shadow is advisory", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("resolves when the transport throws", async () => {
        const transport = async () => {
            throw new Error("boom");
        };
        const r = await shadowDecide(asInput(), { transport, log: log() });
        expect(r.status === "ran" && r.record.counts.unavailable).toBe(1);
    });

    it("resolves at the deadline when the transport never answers", async () => {
        const transport = () => new Promise<never>(() => {});
        const pending = shadowDecide(asInput(), { transport, log: log() });
        await vi.advanceTimersByTimeAsync(800);
        const r = await pending;
        expect(r.status === "ran" && r.record.counts.unavailable).toBe(1);
    });

    it("resolves when the logger throws", async () => {
        const { transport } = recordingTransport([ALLOW]);
        const throwing = {
            info: () => {
                throw new Error("log down");
            },
        };
        const r = await shadowDecide(asInput(), { transport, log: throwing });
        expect(r).toEqual({ status: "skipped", reason: "error" });
    });

    it("makes no call without a transport", async () => {
        expect(await shadowDecide(asInput(), { transport: undefined, log: log() })).toEqual({
            status: "skipped",
            reason: "no_transport",
        });
    });

    it.each([
        ["impersonating", { impersonating: true }],
        ["no_scope", { orgId: undefined }],
        ["no_scope", { principalReference: undefined }],
    ])("makes no call when the reason is %s", async (reason, over) => {
        const { transport, calls } = recordingTransport([ALLOW]);
        const r = await shadowDecide(asInput(over), { transport, log: log() });
        expect(r).toEqual({ status: "skipped", reason });
        expect(calls).toHaveLength(0);
    });

    it("never changes its input", async () => {
        const { transport } = recordingTransport([ALLOW]);
        const given = asInput();
        const frozen = JSON.stringify(given);
        Object.freeze(given.viewer);
        Object.freeze(given.surfaceIds);
        Object.freeze(given);
        await shadowDecide(given, { transport, log: log() });
        expect(JSON.stringify(given)).toBe(frozen);
    });
});
