import { describe, expect, it } from "vitest";

import { changeFailureEvidenceRows, statusCoverageText } from "../changeFailureEvidence";

describe("statusCoverageText", () => {
    it("reads exactly 0 and exactly 1 as 0% and 100%", () => {
        expect(statusCoverageText(0)).toBe("0%");
        expect(statusCoverageText(1)).toBe("100%");
    });

    it("never rounds a partly covered rate onto 0% or 100%", () => {
        expect(statusCoverageText(0.004)).toBe("<1%");
        expect(statusCoverageText(0.996)).toBe("99%");
        expect(statusCoverageText(0.75)).toBe("75%");
    });

    it("has no text for a coverage that is not a number", () => {
        expect(statusCoverageText(null)).toBeNull();
        expect(statusCoverageText(undefined)).toBeNull();
        expect(statusCoverageText(Number.NaN)).toBeNull();
    });
});

describe("changeFailureEvidenceRows", () => {
    it("draws nothing when no evidence is served", () => {
        expect(changeFailureEvidenceRows(null)).toEqual([]);
        expect(changeFailureEvidenceRows(undefined)).toEqual([]);
    });

    it("names a statuses-only rate, its base K and the coverage", () => {
        expect(
            changeFailureEvidenceRows({
                basis: "status",
                deployments: 40,
                deployments_with_status: 30,
                coverage: 0.75,
                unknown_reason: null,
            }),
        ).toEqual([
            { label: "Evidence basis", value: "Deployment statuses" },
            { label: "Rate is out of", value: "Deployments with a final status" },
            { label: "Deployments", value: "40" },
            { label: "With a final status", value: "30" },
            { label: "Status coverage", value: "75%" },
        ]);
    });

    it("names an incident or both basis as out of all deployments", () => {
        for (const [basis, text] of [
            ["incident", "Incident links"],
            ["both", "Deployment statuses and incident links"],
        ] as const) {
            const rows = changeFailureEvidenceRows({
                basis,
                deployments: 5,
                deployments_with_status: 5,
                coverage: 1,
            });
            expect(rows[0]).toEqual({ label: "Evidence basis", value: text });
            expect(rows[1]).toEqual({ label: "Rate is out of", value: "All deployments" });
        }
    });

    it("names each reason an unknown rate has, with the counts, and no basis", () => {
        const reasons = {
            not_collected: "Nothing was collected for this window",
            no_deployments_in_window: "No deployments in this window",
            deployments_without_outcome:
                "Deployments, but no incident evidence and no deployment with a final status",
        };
        for (const [reason, text] of Object.entries(reasons)) {
            const rows = changeFailureEvidenceRows({
                basis: null,
                deployments: 0,
                deployments_with_status: 0,
                coverage: null,
                unknown_reason: reason,
            });
            expect(rows).toEqual([
                { label: "Why there is no rate", value: text },
                { label: "Deployments", value: "0" },
                { label: "With a final status", value: "0" },
            ]);
        }
    });

    it("keeps a served 0 count and a 0 coverage (a value, not a missing one)", () => {
        expect(
            changeFailureEvidenceRows({ deployments: 4, deployments_with_status: 0, coverage: 0 }),
        ).toEqual([
            { label: "Deployments", value: "4" },
            { label: "With a final status", value: "0" },
            { label: "Status coverage", value: "0%" },
        ]);
    });

    it("draws no row for a basis or a reason this web does not know", () => {
        expect(
            changeFailureEvidenceRows({
                basis: "something_new",
                unknown_reason: "something_else",
                deployments: 2,
            }),
        ).toEqual([{ label: "Deployments", value: "2" }]);
    });
});
