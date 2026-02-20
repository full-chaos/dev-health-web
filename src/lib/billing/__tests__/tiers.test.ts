import { describe, it, expect } from "vitest";
import {
  hasAccess,
  FEATURE_TIERS,
  TIER_HIERARCHY,
  TIER_LABELS,
} from "../tiers";

describe("hasAccess", () => {
  it("community can access community features", () => {
    expect(hasAccess("community", "community")).toBe(true);
  });

  it("community cannot access team features", () => {
    expect(hasAccess("community", "team")).toBe(false);
  });

  it("community cannot access enterprise features", () => {
    expect(hasAccess("community", "enterprise")).toBe(false);
  });

  it("team can access community and team features", () => {
    expect(hasAccess("team", "community")).toBe(true);
    expect(hasAccess("team", "team")).toBe(true);
  });

  it("team cannot access enterprise features", () => {
    expect(hasAccess("team", "enterprise")).toBe(false);
  });

  it("enterprise can access all tiers", () => {
    expect(hasAccess("enterprise", "community")).toBe(true);
    expect(hasAccess("enterprise", "team")).toBe(true);
    expect(hasAccess("enterprise", "enterprise")).toBe(true);
  });

  it("treats 'free' as alias for community", () => {
    expect(hasAccess("free", "community")).toBe(true);
    expect(hasAccess("free", "team")).toBe(false);
  });

  it("treats unknown tier as community (level 0)", () => {
    expect(hasAccess("unknown", "community")).toBe(true);
    expect(hasAccess("unknown", "team")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(hasAccess("Enterprise", "enterprise")).toBe(true);
    expect(hasAccess("TEAM", "team")).toBe(true);
  });
});

describe("FEATURE_TIERS", () => {
  it("maps enterprise features correctly", () => {
    expect(FEATURE_TIERS["audit_log"]).toBe("enterprise");
    expect(FEATURE_TIERS["ip_allowlist"]).toBe("enterprise");
    expect(FEATURE_TIERS["retention_policies"]).toBe("enterprise");
    expect(FEATURE_TIERS["sso"]).toBe("enterprise");
    expect(FEATURE_TIERS["priority_support"]).toBe("enterprise");
  });

  it("maps team features correctly", () => {
    expect(FEATURE_TIERS["investment_view"]).toBe("team");
    expect(FEATURE_TIERS["team_dashboard"]).toBe("team");
    expect(FEATURE_TIERS["custom_integrations"]).toBe("team");
    expect(FEATURE_TIERS["capacity_planning"]).toBe("team");
  });

  it("maps community features correctly", () => {
    expect(FEATURE_TIERS["basic_analytics"]).toBe("community");
  });

  it("every feature maps to a valid tier", () => {
    const validTiers = Object.keys(TIER_HIERARCHY);
    for (const [feature, tier] of Object.entries(FEATURE_TIERS)) {
      expect(validTiers, `feature "${feature}" has invalid tier "${tier}"`).toContain(tier);
    }
  });
});

describe("TIER_LABELS", () => {
  it("provides display labels for all base tiers", () => {
    expect(TIER_LABELS["community"]).toBe("Community");
    expect(TIER_LABELS["team"]).toBe("Team");
    expect(TIER_LABELS["enterprise"]).toBe("Enterprise");
  });

  it("maps free alias to Community", () => {
    expect(TIER_LABELS["free"]).toBe("Community");
  });
});
