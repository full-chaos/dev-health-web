export const TIER_HIERARCHY: Record<string, number> = {
  community: 0,
  free: 0, // Alias for community
  team: 1,
  enterprise: 2,
};

export const FEATURE_TIERS: Record<string, string> = {
  investment_view: "team",
  capacity_planning: "team",
};

export const TIER_FEATURES: Record<string, string> = {
  team: "Unlock advanced insights, team-level metrics, and capacity planning.",
  enterprise: "Get enterprise-grade security, SSO, and dedicated support.",
};

export function hasAccess(currentTier: string, requiredTier: string): boolean {
  const currentLevel = TIER_HIERARCHY[currentTier.toLowerCase()] ?? 0;
  const requiredLevel = TIER_HIERARCHY[requiredTier.toLowerCase()] ?? 0;
  return currentLevel >= requiredLevel;
}
