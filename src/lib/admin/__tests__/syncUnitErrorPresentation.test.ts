import { describe, expect, it } from "vitest";
import { getSyncUnitErrorPresentation } from "../syncUnitErrorPresentation";

describe("getSyncUnitErrorPresentation", () => {
    it.each([
        ["provider_unit_exhausted", "Provider retries exhausted"],
        ["provider_unit_retryable", "Provider request will retry"],
        ["provider_budget_contention", "Waiting for provider capacity"],
        ["budget_deferred", "Waiting for sync budget"],
        ["budget_deferral_exhausted", "Sync budget wait limit reached"],
        ["deferral_exhausted", "Sync deferral limit reached"],
        ["effect_recovery_ambiguous", "Previous sync result could not be verified"],
    ])("translates %s without exposing the machine code", (code, title) => {
        const presentation = getSyncUnitErrorPresentation(code, code);

        expect(presentation.title).toBe(title);
        expect(presentation.detail).not.toContain(code);
    });

    it("keeps a detailed human-readable backend explanation under the translated title", () => {
        expect(
            getSyncUnitErrorPresentation(
                "GitHub returned 503 while listing workflow runs",
                "provider_unit_retryable",
            ),
        ).toEqual({
            code: "provider_unit_retryable",
            title: "Provider request will retry",
            detail: "GitHub returned 503 while listing workflow runs",
        });
    });

    it("humanizes an unknown machine code", () => {
        expect(getSyncUnitErrorPresentation("custom_provider_fault", null)).toEqual({
            code: "custom_provider_fault",
            title: "Custom provider fault",
            detail: null,
        });
    });
});
