import { describe, expect, it } from "vitest";

import {
    CREDENTIAL_STATUS_META,
    CREDENTIAL_STATUS_PRIORITY,
    deriveCredentialStatus,
} from "./credentialStatus";
import type { IntegrationCredential } from "@/lib/admin/types";

function makeCredential(overrides: Partial<IntegrationCredential> = {}): IntegrationCredential {
    return {
        id: "cred-1",
        provider: "github",
        name: "default",
        is_active: true,
        config: {},
        last_test_at: null,
        last_test_success: null,
        last_test_error: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        ...overrides,
    };
}

describe("deriveCredentialStatus", () => {
    it('returns "connected" when active and the last test succeeded', () => {
        const credential = makeCredential({ is_active: true, last_test_success: true });

        expect(deriveCredentialStatus(credential)).toBe("connected");
    });

    it('returns "failing" when active and the last test failed', () => {
        const credential = makeCredential({ is_active: true, last_test_success: false });

        expect(deriveCredentialStatus(credential)).toBe("failing");
    });

    it('returns "untested" when active and last_test_success is null (never tested)', () => {
        const credential = makeCredential({ is_active: true, last_test_success: null });

        expect(deriveCredentialStatus(credential)).toBe("untested");
    });

    it('returns "untested" when active and last_test_success is undefined, never "connected"', () => {
        const credential = makeCredential({
            is_active: true,
            last_test_success: undefined as unknown as null,
        });

        expect(deriveCredentialStatus(credential)).toBe("untested");
        expect(deriveCredentialStatus(credential)).not.toBe("connected");
    });

    it('returns "inactive" when is_active is false, regardless of last test result', () => {
        expect(deriveCredentialStatus(makeCredential({ is_active: false, last_test_success: true }))).toBe(
            "inactive",
        );
        expect(
            deriveCredentialStatus(makeCredential({ is_active: false, last_test_success: false })),
        ).toBe("inactive");
        expect(
            deriveCredentialStatus(makeCredential({ is_active: false, last_test_success: null })),
        ).toBe("inactive");
    });
});

describe("CREDENTIAL_STATUS_META", () => {
    it("provides a customer-safe label and tone for every status", () => {
        expect(CREDENTIAL_STATUS_META).toEqual({
            connected: { label: "Connected", tone: "positive" },
            failing: { label: "Connection failing", tone: "negative" },
            untested: { label: "Needs verification", tone: "caution" },
            inactive: { label: "Inactive", tone: "neutral" },
        });
    });

    it("never uses the word \"connected\" in the untested label", () => {
        expect(CREDENTIAL_STATUS_META.untested.label.toLowerCase()).not.toContain("connected");
    });
});

describe("CREDENTIAL_STATUS_PRIORITY", () => {
    it("ranks failing above untested above connected above inactive", () => {
        expect(CREDENTIAL_STATUS_PRIORITY).toEqual(["failing", "untested", "connected", "inactive"]);
    });

    it("contains exactly the four credential statuses", () => {
        expect(new Set(CREDENTIAL_STATUS_PRIORITY)).toEqual(
            new Set(Object.keys(CREDENTIAL_STATUS_META)),
        );
    });
});
