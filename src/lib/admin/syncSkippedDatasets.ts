export interface SkippedDataset {
    dataset_key: string;
    reason: string;
}

const SKIPPED_REASON_TEXT: Record<string, string> = {
    feature_disabled: "skipped: feature off",
};

export const SKIPPED_REASON_FALLBACK = "skipped";

export function skippedReasonText(reason: string): string {
    return SKIPPED_REASON_TEXT[reason] ?? SKIPPED_REASON_FALLBACK;
}

export function readSkippedDatasets(
    result: Record<string, unknown> | null | undefined,
): SkippedDataset[] {
    const raw = result?.skipped_datasets;
    if (!Array.isArray(raw)) return [];
    const out: SkippedDataset[] = [];
    for (const entry of raw) {
        if (typeof entry !== "object" || entry === null) continue;
        const { dataset_key, reason } = entry as Record<string, unknown>;
        if (typeof dataset_key !== "string" || dataset_key === "") continue;
        out.push({ dataset_key, reason: typeof reason === "string" ? reason : "" });
    }
    return out;
}
