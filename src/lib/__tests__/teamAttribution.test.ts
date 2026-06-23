import { describe, it, expect } from "vitest";
import {
    ATTRIBUTION_SOURCE_PRECEDENCE,
    describeAttributionProvenance,
    selectPrimaryAttribution,
} from "@/lib/investment/teamAttribution";
import type { WorkItemTeamAttribution } from "@/lib/graphql/__generated__/types";

const row = (over: Partial<WorkItemTeamAttribution>): WorkItemTeamAttribution => ({
    __typename: "WorkItemTeamAttribution",
    workItemId: "wi-1",
    provider: "github",
    teamId: "t-1",
    teamName: "Platform",
    source: "NATIVE_TEAM",
    confidence: "HIGH",
    isPrimary: true,
    evidence: "{}",
    ...over,
});

describe("describeAttributionProvenance", () => {
    it("maps a first-class source to a trusted, non-fallback provenance", () => {
        const p = describeAttributionProvenance({ source: "NATIVE_TEAM", confidence: "HIGH" });
        expect(p.tone).toBe("trusted");
        expect(p.isManualFallback).toBe(false);
        expect(p.sourceLabel).toBe("Native team");
        expect(p.confidenceLabel).toBe("high confidence");
    });

    it("renders manual_fallback as a DISTINCT, lower-confidence label", () => {
        const p = describeAttributionProvenance({
            source: "MANUAL_FALLBACK",
            confidence: "MANUAL",
        });
        expect(p.isManualFallback).toBe(true);
        expect(p.tone).toBe("fallback");
        expect(p.confidenceLabel).toBe("manual · low confidence");
        // Never presented as authoritative team truth.
        expect(p.description.toLowerCase()).toContain("not authoritative");
    });

    it("covers every backend source enum value", () => {
        for (const source of ATTRIBUTION_SOURCE_PRECEDENCE) {
            const p = describeAttributionProvenance({ source, confidence: "NONE" });
            expect(p.sourceLabel.length).toBeGreaterThan(0);
            expect(p.isManualFallback).toBe(source === "MANUAL_FALLBACK");
        }
    });
});

describe("selectPrimaryAttribution", () => {
    it("returns null for an empty list", () => {
        expect(selectPrimaryAttribution([])).toBeNull();
    });

    it("prefers the is_primary candidate", () => {
        const picked = selectPrimaryAttribution([
            row({ source: "MANUAL_FALLBACK", isPrimary: false }),
            row({ source: "REPO_OWNERSHIP", isPrimary: true }),
        ]);
        expect(picked?.source).toBe("REPO_OWNERSHIP");
    });

    it("falls back to highest precedence when no primary flagged", () => {
        const picked = selectPrimaryAttribution([
            row({ source: "MANUAL_FALLBACK", isPrimary: false }),
            row({ source: "ASSIGNEE_MEMBERSHIP", isPrimary: false }),
            row({ source: "ISSUE_PROJECT", isPrimary: false }),
        ]);
        expect(picked?.source).toBe("ISSUE_PROJECT");
    });
});
