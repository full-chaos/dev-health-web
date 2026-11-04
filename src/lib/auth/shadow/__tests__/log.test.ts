import { describe, expect, it, vi } from "vitest";
import { shadowDecide, type ShadowInput } from "../run";
import { DENY, input, recordingTransport, ORG, TOKEN, USER } from "./helpers";

describe("shadow log", () => {
    it("writes a closed field set and no token, principal, user or org bytes", async () => {
        const info = vi.fn();
        const { transport } = recordingTransport([DENY]);
        await shadowDecide(input() as ShadowInput, { transport, log: { info } });
        expect(info).toHaveBeenCalledTimes(2);
        const [run, mismatch] = info.mock.calls;
        expect(Object.keys(run[0]).sort()).toEqual(
            ["match", "mismatch", "no_action", "surfaces", "unavailable"].sort(),
        );
        expect(Object.keys(mismatch[0]).sort()).toEqual(
            [
                "action",
                "client_allowed",
                "decision_allowed",
                "decision_id",
                "outcome",
                "reason_code",
                "request_id",
                "surface",
            ].sort(),
        );
        const text = JSON.stringify(info.mock.calls);
        for (const secret of [TOKEN, USER, ORG, "principal_reference", "access_token"]) {
            expect(text).not.toContain(secret);
        }
    });

    it("writes one line for a run with no mismatch", async () => {
        const info = vi.fn();
        await shadowDecide(input({ surfaceIds: ["nav:platform"] }) as ShadowInput, {
            transport: recordingTransport([]).transport,
            log: { info },
        });
        expect(info).toHaveBeenCalledTimes(1);
    });
});
