export type InvestmentMixAggregate = {
    theme_distribution: Record<string, number>;
    subcategory_distribution: Record<string, number>;
    unit?: string;
    evidence_quality_distribution?: Record<string, number>;
    evidence_quality_stats?: {
        mean?: number | null;
        stddev?: number | null;
        band_counts?: Record<string, number>;
    };
};

/**
 * @deprecated The backend no longer sends the legacy categories/subtypes shape.
 * This type and the normalisation branch below will be removed once all
 * backend instances are confirmed to serve the theme_distribution contract.
 * Track removal in CHAOS-659.
 */

import { titleCase } from "@/lib/stringUtils";
export { titleCase };

export const formatSubcategoryLabel = (key: string, skipParentPrefix = false) => {
    const parts = key.split(".", 2);
    if (parts.length !== 2) return titleCase(key);
    const theme = parts[0] ?? "";
    const sub = parts[1] ?? key;
    if (skipParentPrefix) return titleCase(sub);
    return `${titleCase(theme)} · ${titleCase(sub)}`;
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
                ]),
            ),
            subcategory_distribution: Object.fromEntries(
                Object.entries(subcategoryDistribution).map(([key, value]) => [
                    key,
                    typeof value === "number" ? value : 0,
                ]),
            ),
            unit: typeof typed.unit === "string" ? typed.unit : undefined,
            evidence_quality_distribution: isRecord(typed.evidence_quality_distribution)
                ? Object.fromEntries(
                      Object.entries(typed.evidence_quality_distribution).map(([key, value]) => [
                          key,
                          typeof value === "number" ? value : 0,
                      ]),
                  )
                : undefined,
            evidence_quality_stats: isRecord(typed.evidence_quality_stats)
                ? {
                      mean:
                          typeof (typed.evidence_quality_stats as Record<string, unknown>).mean ===
                          "number"
                              ? ((typed.evidence_quality_stats as Record<string, unknown>)
                                    .mean as number)
                              : null,
                      stddev:
                          typeof (typed.evidence_quality_stats as Record<string, unknown>)
                              .stddev === "number"
                              ? ((typed.evidence_quality_stats as Record<string, unknown>)
                                    .stddev as number)
                              : null,
                      band_counts: isRecord(
                          (typed.evidence_quality_stats as Record<string, unknown>).band_counts,
                      )
                          ? Object.fromEntries(
                                Object.entries(
                                    (typed.evidence_quality_stats as Record<string, unknown>)
                                        .band_counts as Record<string, unknown>,
                                ).map(([k, v]) => [k, typeof v === "number" ? v : 0]),
                            )
                          : undefined,
                  }
                : undefined,
        };
    }

    // Legacy path: backend sent categories/subtypes instead of theme_distribution.
    // Log a warning so we can track when this is still being triggered.
    // TODO(CHAOS-659): Remove this branch once all backend instances serve the
    // theme_distribution contract and the warning no longer appears in logs.
    const legacy = input as LegacyInvestmentMixResponse;

    if (typeof window === "undefined") {
        // Server-side only — import logger lazily to avoid browser bundle impact.
        try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { logger } = require("@/lib/logger");
            logger.warn(
                { keys: Object.keys(typed) },
                "investmentMix: received legacy categories/subtypes response shape — backend should upgrade to theme_distribution contract (CHAOS-659)",
            );
        } catch {
            // Ignore if logger is unavailable.
        }
    }

    const theme_distribution: Record<string, number> = {};
    const subcategory_distribution: Record<string, number> = {};

    for (const category of legacy.categories ?? []) {
        theme_distribution[category.key] = typeof category.value === "number" ? category.value : 0;
    }
    for (const subtype of legacy.subtypes ?? []) {
        const subtypeKey = `${subtype.parentKey}.${slugify(subtype.name)}`;
        subcategory_distribution[subtypeKey] =
            typeof subtype.value === "number" ? subtype.value : 0;
    }

    return {
        theme_distribution,
        subcategory_distribution,
        unit: legacy.unit,
    };
};

export type InvestmentMixTheme = { key: string; value: number };
export type InvestmentMixSubcategory = {
    key: string;
    themeKey: string;
    value: number;
};

export const getSortedThemes = (mix: InvestmentMixAggregate): InvestmentMixTheme[] =>
    Object.entries(mix.theme_distribution ?? {})
        .map(([key, value]) => ({
            key,
            value: typeof value === "number" ? value : 0,
        }))
        .filter((entry) => entry.value > 0)
        .sort((a, b) => b.value - a.value);

export const getSortedSubcategories = (mix: InvestmentMixAggregate): InvestmentMixSubcategory[] =>
    Object.entries(mix.subcategory_distribution ?? {})
        .map(([key, value]) => {
            const [themeKey] = key.split(".", 1);
            return {
                key,
                themeKey: themeKey ?? "",
                value: typeof value === "number" ? value : 0,
            };
        })
        .filter((entry) => entry.value > 0 && entry.key.includes(".") && entry.themeKey)
        .sort((a, b) => b.value - a.value);
