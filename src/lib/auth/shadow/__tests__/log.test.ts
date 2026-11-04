import { describe, expect, it, vi } from "vitest";
import { logSkip } from "../log";
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

    it("writes a closed Debug field set for a skip", () => {
        const debug = vi.fn();
        logSkip("guard:/org/admin", "sampled", { info: vi.fn(), debug });
        expect(debug).toHaveBeenCalledTimes(1);
        expect(Object.keys(debug.mock.calls[0][0]).sort()).toEqual(["reason", "surfaces"]);
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
