import { describe, expect, it } from "vitest";
import type { IntegrationCredential } from "../types";
import { resolvePagerDutySyncConfigPreselection } from "../syncConfigPreselection";

const pagerDutyCredential: IntegrationCredential = {
    id: "credential-production",
    provider: "pagerduty",
    name: "production",
    is_active: true,
    config: {},
    last_test_at: null,
    last_test_success: true,
    last_test_error: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
};

describe("resolvePagerDutySyncConfigPreselection", () => {
    it("resolves only an allow-listed PagerDuty provider and known credential", () => {
        expect(
            resolvePagerDutySyncConfigPreselection(
                { provider: "pagerduty", credential_name: "production" },
                [pagerDutyCredential],
                true,
            ),
        ).toEqual({ provider: "pagerduty", credentialId: "credential-production" });
    });

    it("fails safely to the normal New Sync Config state for malformed or unknown preselection", () => {
        const malformed = [
            { provider: ["pagerduty"], credential_name: "production" },
            { provider: "pagerduty", credential_name: ["production"] },
            { provider: "github", credential_name: "production" },
            { provider: "pagerduty", credential_name: "missing" },
        ];

        for (const query of malformed) {
            expect(
                resolvePagerDutySyncConfigPreselection(query, [pagerDutyCredential], true),
            ).toBeNull();
        }
    });

    it("does not preselect PagerDuty while its creation gate is off", () => {
        expect(
            resolvePagerDutySyncConfigPreselection(
                { provider: "pagerduty", credential_name: "production" },
                [pagerDutyCredential],
                false,
            ),
        ).toBeNull();
    });
});
