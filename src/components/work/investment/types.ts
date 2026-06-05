import type { InvestmentMixExplanation, WorkUnitInvestment } from "@/lib/types";

export type CategorizationMode = "text_metadata" | "metadata_only";

export type TreemapSelection = {
    key: string;
    type: "theme" | "subcategory";
    themeLabel: string;
    themeKey: string | null;
    subcategoryLabel?: string;
    subcategoryId?: string | null;
};

export type EvidenceUnit = {
    unit: WorkUnitInvestment;
    weightedEffort: number;
    weight: number;
};

export const CATEGORIZATION_OPTIONS: Array<{ id: CategorizationMode; label: string }> = [
    { id: "text_metadata", label: "Text + metadata" },
    { id: "metadata_only", label: "Metadata only" },
];

export const EVIDENCE_QUALITY_BANDS = [
    { id: "high", label: "High (0.80-1.00)", opacityClass: "opacity-100" },
    { id: "moderate", label: "Moderate (0.60-0.79)", opacityClass: "opacity-75" },
    { id: "low", label: "Low (0.40-0.59)", opacityClass: "opacity-50" },
    { id: "very_low", label: "Very low (<0.40)", opacityClass: "opacity-30" },
] as const;

export type MixExplanationState = {
    data: InvestmentMixExplanation | null;
    filtersKey: string;
    focus: { theme: string | null; subcategory: string | null };
};
