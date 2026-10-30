import type { InvestigationResult } from "@/lib/ask-dev/render/contracts";

/**
 * The answer's evidence window in words (CHAOS-11941, E8 design §11.2). A served `relative_id` reads
 * as words; otherwise both served bounds, as UTC dates; "window inferred" when the window was the
 * service's default. Absent, or neither a relative id nor both bounds: "Window not stated". This view
 * never supplies a default window.
 */
export const WINDOW_NOT_STATED = "Window not stated";

const RELATIVE_WORDS: Record<string, string> = {
    trailing_30d: "Last 30 days",
    trailing_90d: "Last 90 days",
    trailing_365d: "Last 365 days",
    all_time: "All time",
};

const utcDate = (value: unknown): string | null => {
    if (typeof value !== "string") return null;
    const at = Date.parse(value);
    return Number.isNaN(at) ? null : new Date(at).toISOString().slice(0, 10);
};

export function windowText(result: Pick<InvestigationResult, "effective_evidence_window">): string {
    const window = result.effective_evidence_window as Record<string, unknown> | undefined;
    if (window === undefined || window === null) return WINDOW_NOT_STATED;
    const inferred = window.provenance === "inferred_default" ? " (window inferred)" : "";
    const relative =
        typeof window.relative_id === "string" ? RELATIVE_WORDS[window.relative_id] : undefined;
    if (relative !== undefined) return `${relative}${inferred}`;
    const start = utcDate(window.start);
    const end = utcDate(window.end);
    if (start !== null && end !== null) return `${start} – ${end}${inferred}`;
    return WINDOW_NOT_STATED;
}
