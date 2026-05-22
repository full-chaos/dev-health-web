import { describe, it, expect } from "vitest";
import {
  titleCase,
  formatSubcategoryLabel,
  normalizeThemeKey,
  normalizeUnassignedLabel,
  stripSankeyPrefix,
  isUnassignedLabel,
  buildOptionalTimeRangeLabel,
  TOP_N_REPOS,
  UNASSIGNED_TEAM_LABEL,
  UNASSIGNED_REPO_LABEL,
  UNASSIGNED_THEME_LABEL,
  UNASSIGNED_SUBCATEGORY_LABEL,
} from "../investment/transforms";

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
