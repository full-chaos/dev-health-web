export type InvestmentMixAggregate = {
  theme_distribution: Record<string, number>;
  subcategory_distribution: Record<string, number>;
  unit?: string;
  evidence_quality_distribution?: Record<string, number>;
};

export type LegacyInvestmentMixResponse = {
  categories: Array<{ key: string; name: string; value: number }>;
  subtypes: Array<{ name: string; value: number; parentKey: string }>;
  unit?: string;
  edges?: Array<Record<string, unknown>>;
};

export type InvestmentMixResponse = InvestmentMixAggregate | LegacyInvestmentMixResponse;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

export const normalizeInvestmentMix = (input: InvestmentMixResponse): InvestmentMixAggregate => {
  if (!input || typeof input !== "object") {
    return { theme_distribution: {}, subcategory_distribution: {} };
  }

  const typed = input as Record<string, unknown>;
  const themeDistribution = typed.theme_distribution;
  const subcategoryDistribution = typed.subcategory_distribution;

  if (isRecord(themeDistribution) && isRecord(subcategoryDistribution)) {
    return {
      theme_distribution: Object.fromEntries(
        Object.entries(themeDistribution).map(([key, value]) => [
          key,
          typeof value === "number" ? value : 0,
        ])
      ),
      subcategory_distribution: Object.fromEntries(
        Object.entries(subcategoryDistribution).map(([key, value]) => [
          key,
          typeof value === "number" ? value : 0,
        ])
      ),
      unit: typeof typed.unit === "string" ? typed.unit : undefined,
      evidence_quality_distribution: isRecord(typed.evidence_quality_distribution)
        ? Object.fromEntries(
            Object.entries(typed.evidence_quality_distribution).map(([key, value]) => [
              key,
              typeof value === "number" ? value : 0,
            ])
          )
        : undefined,
    };
  }

  const legacy = input as LegacyInvestmentMixResponse;
  const theme_distribution: Record<string, number> = {};
  const subcategory_distribution: Record<string, number> = {};

  for (const category of legacy.categories ?? []) {
    theme_distribution[category.key] = typeof category.value === "number" ? category.value : 0;
  }
  for (const subtype of legacy.subtypes ?? []) {
    const subtypeKey = `${subtype.parentKey}.${slugify(subtype.name)}`;
    subcategory_distribution[subtypeKey] = typeof subtype.value === "number" ? subtype.value : 0;
  }

  return {
    theme_distribution,
    subcategory_distribution,
    unit: legacy.unit,
  };
};

export type InvestmentMixTheme = { key: string; value: number };
export type InvestmentMixSubcategory = { key: string; themeKey: string; value: number };

export const getSortedThemes = (mix: InvestmentMixAggregate): InvestmentMixTheme[] =>
  Object.entries(mix.theme_distribution ?? {})
    .map(([key, value]) => ({ key, value: typeof value === "number" ? value : 0 }))
    .filter((entry) => entry.value > 0)
    .sort((a, b) => b.value - a.value);

export const getSortedSubcategories = (mix: InvestmentMixAggregate): InvestmentMixSubcategory[] =>
  Object.entries(mix.subcategory_distribution ?? {})
    .map(([key, value]) => {
      const [themeKey] = key.split(".", 1);
      return { key, themeKey: themeKey ?? "", value: typeof value === "number" ? value : 0 };
    })
    .filter((entry) => entry.value > 0 && entry.key.includes(".") && entry.themeKey)
    .sort((a, b) => b.value - a.value);

