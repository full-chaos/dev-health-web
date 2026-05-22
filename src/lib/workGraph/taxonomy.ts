import type { InvestmentSubcategory, InvestmentTheme } from "@/lib/graphql/types";

export const INVESTMENT_THEMES: InvestmentTheme[] = [
  "feature_delivery",
  "operational",
  "maintenance",
  "quality",
  "risk",
];

export const INVESTMENT_SUBCATEGORIES: InvestmentSubcategory[] = [
  "feature_delivery.customer",
  "feature_delivery.roadmap",
  "feature_delivery.enablement",
  "operational.incident_response",
  "operational.on_call",
  "operational.support",
  "maintenance.refactor",
  "maintenance.upgrade",
  "maintenance.debt",
  "quality.testing",
  "quality.bugfix",
  "quality.reliability",
  "risk.security",
  "risk.compliance",
  "risk.vulnerability",
];

export const SUBCATEGORY_TO_THEME = Object.fromEntries(
  INVESTMENT_SUBCATEGORIES.map((subcategory) => [
    subcategory,
    subcategory.split(".", 1)[0] as InvestmentTheme,
  ]),
) as Record<InvestmentSubcategory, InvestmentTheme>;

export function themeOf(subcategory: InvestmentSubcategory): InvestmentTheme {
  return SUBCATEGORY_TO_THEME[subcategory];
}

export function labelInvestmentKey(key: string): string {
  return key
    .replaceAll("_", " ")
    .replaceAll(".", " / ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
