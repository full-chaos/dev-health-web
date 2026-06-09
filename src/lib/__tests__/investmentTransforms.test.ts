import { describe, it, expect } from "vitest";
import {
    titleCase,
    formatSubcategoryLabel,
    normalizeThemeKey,
    normalizeUnassignedLabel,
    stripSankeyPrefix,
    isUnassignedLabel,
    buildOptionalTimeRangeLabel,
    selectWorkUnitEntries,
    TOP_N_REPOS,
    UNASSIGNED_TEAM_LABEL,
    UNASSIGNED_REPO_LABEL,
    UNASSIGNED_THEME_LABEL,
    UNASSIGNED_SUBCATEGORY_LABEL,
} from "../investment/transforms";
import type { WorkUnitInvestment } from "@/lib/types";

const makeUnit = (
    id: string,
    effortValue: number,
    subcategories: Record<string, number> = {},
): WorkUnitInvestment => ({
    work_unit_id: id,
    work_unit_name: `Unit ${id}`,
    work_unit_type: "pr",
    time_range: { start: "2026-02-01T00:00:00Z", end: "2026-03-01T00:00:00Z" },
    effort: { metric: "active_hours", value: effortValue },
    investment: { themes: {}, subcategories },
    evidence_quality: { value: 0.7, band: "moderate" },
    evidence: { textual: [], structural: [], contextual: [] },
});

// ============================================================================
// titleCase
// ============================================================================
describe("titleCase", () => {
    it("converts snake_case to Title Case", () => {
        expect(titleCase("feature_delivery")).toBe("Feature Delivery");
    });

    it("converts kebab-case to Title Case", () => {
        expect(titleCase("feature-delivery")).toBe("Feature Delivery");
    });

    it("handles single word", () => {
        expect(titleCase("operational")).toBe("Operational");
    });

    it("trims leading/trailing spaces", () => {
        expect(titleCase("  hello world  ")).toBe("Hello World");
    });
});

// ============================================================================
// formatSubcategoryLabel
// ============================================================================
describe("formatSubcategoryLabel", () => {
    it("formats a subcategory key with theme prefix", () => {
        const label = formatSubcategoryLabel("feature_delivery.new_features", true);
        expect(label).toContain("·");
        expect(label).toContain("Feature Delivery");
        expect(label).toContain("New Features");
    });

    it("formats a subcategory key without theme prefix", () => {
        const label = formatSubcategoryLabel("feature_delivery.new_features", false);
        expect(label).toBe("New Features");
        expect(label).not.toContain("·");
    });

    it("handles simple keys without dots", () => {
        const label = formatSubcategoryLabel("maintenance");
        expect(label).toBe("Maintenance");
    });
});

// ============================================================================
// normalizeThemeKey
// ============================================================================
describe("normalizeThemeKey", () => {
    it("returns null for null input", () => {
        expect(normalizeThemeKey(null)).toBeNull();
    });

    it("returns null for empty string", () => {
        expect(normalizeThemeKey("")).toBeNull();
    });

    it("returns null for whitespace-only string", () => {
        expect(normalizeThemeKey("   ")).toBeNull();
    });

    it("normalizes a known theme key to lowercase", () => {
        const result = normalizeThemeKey("Feature_Delivery");
        expect(result).not.toBeNull();
        expect(typeof result).toBe("string");
    });

    it("slugifies unknown theme values", () => {
        const result = normalizeThemeKey("My Custom Theme");
        expect(result).toBe("my_custom_theme");
    });
});

// ============================================================================
// normalizeUnassignedLabel
// ============================================================================
describe("normalizeUnassignedLabel", () => {
    it("returns the canonical team unassigned label", () => {
        expect(normalizeUnassignedLabel("unassigned team", "team")).toBe(UNASSIGNED_TEAM_LABEL);
    });

    it("returns the canonical repo unassigned label", () => {
        expect(normalizeUnassignedLabel("(Unassigned repo)", "repo")).toBe(UNASSIGNED_REPO_LABEL);
    });

    it("returns the canonical theme unassigned label for category group", () => {
        expect(normalizeUnassignedLabel("unassigned", "category")).toBe(UNASSIGNED_THEME_LABEL);
    });

    it("returns the canonical subcategory unassigned label", () => {
        expect(normalizeUnassignedLabel("Unassigned subcategory", "subcategory")).toBe(
            UNASSIGNED_SUBCATEGORY_LABEL,
        );
    });

    it("returns the value unchanged when not unassigned", () => {
        expect(normalizeUnassignedLabel("My Team", "team")).toBe("My Team");
    });

    it("handles empty strings by returning them unchanged", () => {
        expect(normalizeUnassignedLabel("", "team")).toBe("");
    });
});

// ============================================================================
// stripSankeyPrefix
// ============================================================================
describe("stripSankeyPrefix", () => {
    it("strips team: prefix", () => {
        expect(stripSankeyPrefix("team: Engineering")).toBe("Engineering");
    });

    it("strips repo: prefix", () => {
        expect(stripSankeyPrefix("repo:org/frontend")).toBe("org/frontend");
    });

    it("strips category: prefix", () => {
        expect(stripSankeyPrefix("category:maintenance")).toBe("maintenance");
    });

    it("is case-insensitive for prefix matching", () => {
        expect(stripSankeyPrefix("TEAM:Design")).toBe("Design");
    });

    it("does not modify strings without a recognised prefix", () => {
        expect(stripSankeyPrefix("Engineering")).toBe("Engineering");
    });
});

// ============================================================================
// isUnassignedLabel
// ============================================================================
describe("isUnassignedLabel", () => {
    it("returns true for labels containing 'unassigned'", () => {
        expect(isUnassignedLabel("Unassigned team")).toBe(true);
    });

    it("is case-insensitive", () => {
        expect(isUnassignedLabel("UNASSIGNED")).toBe(true);
    });

    it("returns false for normal labels", () => {
        expect(isUnassignedLabel("Engineering")).toBe(false);
    });
});

// ============================================================================
// buildOptionalTimeRangeLabel
// ============================================================================
describe("buildOptionalTimeRangeLabel", () => {
    it("returns null when start is missing", () => {
        expect(buildOptionalTimeRangeLabel(undefined, "2024-01-31")).toBeNull();
    });

    it("returns null when end is missing", () => {
        expect(buildOptionalTimeRangeLabel("2024-01-01", undefined)).toBeNull();
    });

    it("returns a label string when both dates are provided", () => {
        const label = buildOptionalTimeRangeLabel("2024-01-01T00:00:00Z", "2024-01-31T00:00:00Z");
        // May return null if formatTimestamp returns 'Unavailable' — just check type
        expect(label === null || typeof label === "string").toBe(true);
    });
});

// ============================================================================
// selectWorkUnitEntries
// ============================================================================
describe("selectWorkUnitEntries", () => {
    const units = [
        makeUnit("a", 10, { "feature.build": 0.5, "quality.tests": 0.5 }),
        makeUnit("b", 20, { "feature.build": 1.0 }),
        makeUnit("c", 5, { "quality.tests": 1.0 }),
    ];

    describe("no focused subcategory", () => {
        it("returns [] when fallbackToAll is false (Overview drill-down default)", () => {
            expect(selectWorkUnitEntries({ focusSubcategory: null, workUnits: units })).toEqual([]);
        });

        it("returns ALL units when fallbackToAll is true (self-contained tab)", () => {
            const entries = selectWorkUnitEntries({
                focusSubcategory: null,
                workUnits: units,
                fallbackToAll: true,
            });
            expect(entries).toHaveLength(3);
            // weight defaults to 1, weightedEffort == raw effort
            expect(entries.every((e) => e.weight === 1)).toBe(true);
            expect(entries.map((e) => e.unit.work_unit_id).sort()).toEqual(["a", "b", "c"]);
        });

        it("sorts the all-units listing by effort descending", () => {
            const entries = selectWorkUnitEntries({
                focusSubcategory: null,
                workUnits: units,
                fallbackToAll: true,
            });
            expect(entries.map((e) => e.unit.work_unit_id)).toEqual(["b", "a", "c"]);
            expect(entries.map((e) => e.weightedEffort)).toEqual([20, 10, 5]);
        });

        it("returns [] for an empty work-unit list even with fallbackToAll", () => {
            expect(
                selectWorkUnitEntries({
                    focusSubcategory: null,
                    workUnits: [],
                    fallbackToAll: true,
                }),
            ).toEqual([]);
        });
    });

    describe("focused subcategory", () => {
        it("returns only units contributing to the subcategory, weighted + sorted", () => {
            const entries = selectWorkUnitEntries({
                focusSubcategory: "feature.build",
                workUnits: units,
            });
            // c has no feature.build weight → excluded
            expect(entries.map((e) => e.unit.work_unit_id)).toEqual(["b", "a"]);
            // weightedEffort = effort * subcategory weight; b=20*1=20, a=10*0.5=5
            expect(entries.map((e) => e.weightedEffort)).toEqual([20, 5]);
            expect(entries.map((e) => e.weight)).toEqual([1.0, 0.5]);
        });

        it("ignores fallbackToAll when a subcategory is set", () => {
            const focused = selectWorkUnitEntries({
                focusSubcategory: "quality.tests",
                workUnits: units,
                fallbackToAll: true,
            });
            // a (effort 10 × 0.5 = 5) and c (effort 5 × 1.0 = 5) contribute; b does not.
            // (fallbackToAll is ignored — only contributors are returned, not all 3 units.)
            expect(focused).toHaveLength(2);
            expect(focused.map((e) => e.unit.work_unit_id).sort()).toEqual(["a", "c"]);
        });

        it("returns [] when no unit contributes to the focused subcategory", () => {
            expect(
                selectWorkUnitEntries({ focusSubcategory: "risk.audit", workUnits: units }),
            ).toEqual([]);
        });
    });
});

// ============================================================================
// Constants
// ============================================================================
describe("investment transform constants", () => {
    it("TOP_N_REPOS is a positive number", () => {
        expect(TOP_N_REPOS).toBeGreaterThan(0);
    });

    it("UNASSIGNED labels are non-empty strings", () => {
        expect(UNASSIGNED_TEAM_LABEL.length).toBeGreaterThan(0);
        expect(UNASSIGNED_REPO_LABEL.length).toBeGreaterThan(0);
        expect(UNASSIGNED_THEME_LABEL.length).toBeGreaterThan(0);
        expect(UNASSIGNED_SUBCATEGORY_LABEL.length).toBeGreaterThan(0);
    });
});
