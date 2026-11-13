import { describe, expect, it } from "vitest";
import { classifySyncTrigger, describeSyncFailure } from "./sync-types";

const PREFIX = "scheduled sync occurrence quarantined: ";
const GENERIC = "Sync failed. Check the integration's status and try again.";

describe("describeSyncFailure", () => {
    it.each([
        ["invalid_plan", "the window is too large to plan. Choose a narrower window"],
        ["identity_conflict", "the sync configuration changed"],
        ["retry_exhausted", "planning kept failing"],
    ])("maps %s to plain words and keeps the code out of the text", (code, text) => {
        const out = describeSyncFailure(`${PREFIX}${code}`);
        expect(out.message).toContain(text);
        expect(out.message).not.toContain(code);
        expect(out.reasonCode).toBe(code);
    });

    it.each([`${PREFIX}unknown`, `${PREFIX}a_new_code`, `${PREFIX}__proto__`])(
        "falls back to the generic text for %s",
        (reason) => {
            expect(describeSyncFailure(reason).message).toBe(GENERIC);
        },
    );

    it.each([undefined, "", PREFIX, "boom", "invalid_plan"])(
        "falls back to the generic text with no code (%j)",
        (reason) => {
            const out = describeSyncFailure(reason);
            expect(out.message).toBe(GENERIC);
            expect(out.reasonCode).toBeUndefined();
        },
    );

    it("classifySyncTrigger uses it for a failed status", () => {
        expect(
            classifySyncTrigger({ status: "failed", reason: `${PREFIX}invalid_plan` }, "c1"),
        ).toMatchObject({ kind: "failed", reasonCode: "invalid_plan" });
    });
});
