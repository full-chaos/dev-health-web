import type { IntegrationDataset } from "./types";

export const NEEDS_ATTENTION_PREFIX = "needs_attention:";

export interface DatasetAttention {
    datasetKey: string;
    /** Badge label. */
    label: "Needs attention" | "Unavailable";
    /** One plain sentence for the row. */
    reason: string;
    /** Longer plain explanation for the evidence drawer. */
    detail: string;
    since: string | null;
    lastSeenAt: string | null;
}

const CLASS_TEXT: Record<string, { reason: string; detail: string }> = {
    result_too_large: {
        reason: "A result was too large to store in one run.",
        detail: "The same failure repeated. Syncs now use shorter windows and run once a day until one succeeds.",
    },
    time_limit: {
        reason: "A run reached its time limit.",
        detail: "The same failure repeated. Syncs now use shorter windows and run once a day until one succeeds.",
    },
    unclassified: {
        reason: "Runs keep failing and the cause was not recorded.",
        detail: "The same failure repeated and no cause was stored. Syncs now run once a day until one succeeds.",
    },
};

function sentence(text: string): string {
    const spaced = text.replace(/[_-]+/g, " ").trim();
    if (!spaced) return "Unavailable.";
    const cased = spaced.charAt(0).toUpperCase() + spaced.slice(1);
    return /[.!?]$/.test(cased) ? cased : `${cased}.`;
}

/** Maps a dataset row to its display state. Returns null for a dataset with no marker. */
export function describeDatasetAttention(dataset: IntegrationDataset): DatasetAttention | null {
    const raw = dataset.unavailable_reason;
    if (raw === null || raw.trim() === "") return null;
    const base = {
        datasetKey: dataset.dataset_key,
        since: dataset.unavailable_since,
        lastSeenAt: dataset.unavailable_last_seen_at,
    };
    if (raw.startsWith(NEEDS_ATTENTION_PREFIX)) {
        const cause = raw.slice(NEEDS_ATTENTION_PREFIX.length);
        const known = CLASS_TEXT[cause];
        return {
            ...base,
            label: "Needs attention",
            reason: known?.reason ?? `Runs keep failing (${cause.replace(/_/g, " ")}).`,
            detail:
                known?.detail ??
                "The same failure repeated. Syncs now run once a day until one succeeds.",
        };
    }
    return {
        ...base,
        label: "Unavailable",
        reason: sentence(raw),
        detail: "This dataset is currently unavailable from the source.",
    };
}

export function datasetAttentionRows(datasets: readonly IntegrationDataset[]): DatasetAttention[] {
    return datasets.flatMap((dataset) => {
        const row = describeDatasetAttention(dataset);
        return row ? [row] : [];
    });
}
