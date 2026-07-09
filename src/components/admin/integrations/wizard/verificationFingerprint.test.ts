import { describe, expect, it } from "vitest";

import { fingerprintVerificationInputs, type VerificationInputs } from "./verificationFingerprint";

function makeInputs(overrides: Partial<VerificationInputs> = {}): VerificationInputs {
    return {
        provider: "linear",
        method: "manual",
        credentialName: "default",
        fieldValues: { apiKey: "lin_api_test" },
        ...overrides,
    };
}

describe("fingerprintVerificationInputs", () => {
    it("produces the same fingerprint for identical inputs", () => {
        expect(fingerprintVerificationInputs(makeInputs())).toBe(
            fingerprintVerificationInputs(makeInputs()),
        );
    });

    it("is insensitive to field insertion order (sorted keys)", () => {
        const a = fingerprintVerificationInputs(
            makeInputs({ fieldValues: { apiKey: "x", teams: "y" } }),
        );
        const b = fingerprintVerificationInputs(
            makeInputs({ fieldValues: { teams: "y", apiKey: "x" } }),
        );
        expect(a).toBe(b);
    });

    it("differs when any field value changes", () => {
        const a = fingerprintVerificationInputs(makeInputs({ fieldValues: { apiKey: "old" } }));
        const b = fingerprintVerificationInputs(makeInputs({ fieldValues: { apiKey: "new" } }));
        expect(a).not.toBe(b);
    });

    it("differs when a field is added or removed", () => {
        const a = fingerprintVerificationInputs(makeInputs({ fieldValues: { apiKey: "x" } }));
        const b = fingerprintVerificationInputs(
            makeInputs({ fieldValues: { apiKey: "x", teams: "y" } }),
        );
        expect(a).not.toBe(b);
    });

    it("differs when provider changes", () => {
        const a = fingerprintVerificationInputs(makeInputs({ provider: "linear" }));
        const b = fingerprintVerificationInputs(makeInputs({ provider: "github" }));
        expect(a).not.toBe(b);
    });

    it("differs when method changes", () => {
        const a = fingerprintVerificationInputs(makeInputs({ method: "manual" }));
        const b = fingerprintVerificationInputs(makeInputs({ method: "github_app" }));
        expect(a).not.toBe(b);
    });

    it("differs when method is null vs a string", () => {
        const a = fingerprintVerificationInputs(makeInputs({ method: null }));
        const b = fingerprintVerificationInputs(makeInputs({ method: "manual" }));
        expect(a).not.toBe(b);
    });

    it("differs when credentialName changes", () => {
        const a = fingerprintVerificationInputs(makeInputs({ credentialName: "prod" }));
        const b = fingerprintVerificationInputs(makeInputs({ credentialName: "staging" }));
        expect(a).not.toBe(b);
    });
});
