export const TIER_HIERARCHY: Record<string, number> = {
  community: 0,
  free: 0, // Alias for community
  team: 1,
  enterprise: 2,
};

export const FEATURE_TIERS: Record<string, string> = {
  basic_analytics: "community",
  investment_view: "team",
  team_dashboard: "team",
  custom_integrations: "team",
  capacity_planning: "team",
  sso: "enterprise",
  audit_log: "enterprise",
  ip_allowlist: "enterprise",
  retention_policies: "enterprise",
  priority_support: "enterprise",
};

export const TIER_LABELS: Record<string, string> = {
  community: "Community",
  free: "Community",
  team: "Team",
  enterprise: "Enterprise",
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
