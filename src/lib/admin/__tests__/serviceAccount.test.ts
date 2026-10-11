import { describe, expect, it } from "vitest";
import { serviceAccountEmail, validateServiceAccountName } from "../serviceAccount";

describe("service account name (CHAOS-8966)", () => {
    it.each(["ci", "ci-reporter", "a.b_c-1", "x".repeat(64)])("accepts %s", (n) => {
        expect(validateServiceAccountName(n)).toBeNull();
    });
    it.each(["", "  ", "-a", "a-", "A", "a b", "a@b", "a..b", "x".repeat(65), "é"])(
        "refuses %j",
        (n) => {
            expect(validateServiceAccountName(n)).not.toBeNull();
        },
    );
    it("makes the address", () => {
        expect(serviceAccountEmail(" ci ")).toBe("ci@service.dev-health.invalid");
    });
});
