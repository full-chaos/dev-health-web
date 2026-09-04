import { describe, expect, it } from "vitest";
import { testConnectionFailureMessage } from "../testConnection";

describe("testConnectionFailureMessage", () => {
    it("prefers the transport error, then the endpoint error, then the provider's reason", () => {
        expect(testConnectionFailureMessage({ error: "Unauthorized" } as never)).toBe(
            "Unauthorized",
        );
        expect(
            testConnectionFailureMessage({
                data: { success: false, error: "Unknown provider: acme", details: null },
            }),
        ).toBe("Unknown provider: acme");
        expect(
            testConnectionFailureMessage({
                data: {
                    success: false,
                    error: null,
                    details: { status: 401, error: "Bad credentials" },
                },
            }),
        ).toBe("Bad credentials");
    });

    it("keeps looking past a blank reason rather than rendering nothing", () => {
        expect(
            testConnectionFailureMessage({
                data: { success: false, error: "   ", details: { error: "Bad credentials" } },
            }),
        ).toBe("Bad credentials");
    });

    it("falls back when no reason is a usable string", () => {
        expect(
            testConnectionFailureMessage({
                data: { success: false, error: null, details: { status: 500 } },
            }),
        ).toBe("Connection test failed");
        expect(
            testConnectionFailureMessage({
                data: { success: false, error: null, details: null },
            }),
        ).toBe("Connection test failed");
    });
});
