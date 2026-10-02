/**
 * Provenance chip for AI-attributed work (CHAOS-2195).
 *
 * Renders the canonical attribution bucket (ai_assisted / ai_review /
 * agent_created / human / unknown — mirrors `AI_BUCKETS` in
 * `components/ai/utils.ts`) as a small pill, optionally annotated with the
 * detected tool and attribution confidence via a tooltip. Mirrors the
 * {@link PreviewBadge} pattern: decorative by default, no interactive state.
 *
 * Honest-provenance contract: an unrecognized bucket or kind renders as the
 * "unknown" treatment — the badge never upgrades uncertain attribution to a
 * confident-looking AI label.
 */

// Concept: an outline pill with a dot in the bucket's color (the same color as its slice in the
// Impact donut); Unknown is dashed and carries no color, so it never reads as a confident label.
const PILL = "border-(--card-stroke) bg-transparent text-foreground";
const BUCKET_TREATMENTS = {
    ai_assisted: { label: "AI-assisted", className: PILL, dot: "bg-(--chart-color-1)" },
    ai_review: { label: "AI-reviewed", className: PILL, dot: "bg-(--chart-color-2)" },
    agent_created: { label: "Agent-created", className: PILL, dot: "bg-(--chart-color-6)" },
    human: { label: "Human", className: PILL, dot: "bg-(--ink-muted)" },
    unknown: {
        label: "Unknown attribution",
        className: "border-dashed border-(--card-stroke) bg-transparent text-(--ink-muted)",
        dot: "border border-dashed border-(--ink-muted) bg-transparent",
    },
} as const;

export type AIAttributionBucket = keyof typeof BUCKET_TREATMENTS;

/**
 * Canonicalize a persisted/resolver bucket value (`AI_ASSISTED`,
 * `ai_assisted`, …) to the badge vocabulary. Unrecognized values fall back
 * to `unknown` so coverage gaps stay visible instead of being relabeled.
 */
export function normalizeAttributionBucket(value: string | null | undefined): AIAttributionBucket {
    const key = value?.trim().toLowerCase() ?? "";
    return key in BUCKET_TREATMENTS ? (key as AIAttributionBucket) : "unknown";
}

/**
 * Explicit allowlist from resolved attribution `kind` values to badge
 * buckets. The backend's `ai_attribution_resolved.kind` vocabulary is
 * exactly `ai_assisted` / `agent_created` / `ai_review` (see ops
 * `metrics/loaders/ai_impact.py`, the `attr.kind IN (...)` filters); the
 * canonical bucket names pass through for callers that already hold a
 * bucket.
 */
const KIND_TO_BUCKET: Record<string, AIAttributionBucket> = {
    ai_assisted: "ai_assisted",
    ai_review: "ai_review",
    agent_created: "agent_created",
    human: "human",
    unknown: "unknown",
};

/**
 * Map an attribution row `kind` to a badge bucket via the explicit
 * allowlist. Anything outside the known vocabulary — absent kinds, future
 * sentinels ("unclassified", "manual"), tool names — falls back to the
 * "unknown" treatment. Provenance is never upgraded to a confident AI
 * label on an unrecognized value.
 */
export function attributionBucketForKind(kind: string | null | undefined): AIAttributionBucket {
    const key = kind?.trim().toLowerCase() ?? "";
    return KIND_TO_BUCKET[key] ?? "unknown";
}

type AIAttributionBadgeProps = {
    /** Attribution bucket (canonical lowercase or resolver uppercase form). */
    bucket: AIAttributionBucket | string;
    /** Detected tool/kind (e.g. "copilot", "claude") shown after the label. */
    tool?: string | null;
    /** Attribution confidence in [0, 1]; surfaced in the tooltip only. */
    confidence?: number | null;
    className?: string;
};

export function AIAttributionBadge({
    bucket,
    tool,
    confidence,
    className,
}: AIAttributionBadgeProps) {
    const treatment = BUCKET_TREATMENTS[normalizeAttributionBucket(bucket)];
    const tooltipParts: string[] = [treatment.label];
    if (tool) tooltipParts.push(`Tool: ${tool}`);
    if (confidence != null) tooltipParts.push(`Confidence: ${Math.round(confidence * 100)}%`);

    return (
        <span
            title={tooltipParts.join(" · ")}
            data-testid="ai-attribution-badge"
            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-label-caps font-semibold uppercase ${treatment.className} ${className ?? ""}`.trim()}
        >
            <span
                aria-hidden="true"
                data-testid="ai-attribution-dot"
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${treatment.dot}`}
            />
            {treatment.label}
            {tool ? (
                <span className="font-normal normal-case tracking-normal">· {tool}</span>
            ) : null}
        </span>
    );
}
