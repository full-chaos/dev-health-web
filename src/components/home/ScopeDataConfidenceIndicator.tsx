import { ClientTimestamp } from "@/components/ClientTimestamp";
import { formatCoveragePct } from "@/lib/cockpit/coverage";
import { Notice, type NoticeVariant } from "@/components/ui/Notice";
import type { ScopeDataConfidence } from "@/lib/types";

type ScopeDataConfidenceIndicatorProps = {
    confidence: ScopeDataConfidence;
    className?: string;
};

const LEVEL_META: Record<ScopeDataConfidence["level"], { variant: NoticeVariant; strong: string }> =
    {
        high: { variant: "good", strong: "text-(--positive)" },
        medium: { variant: "warn", strong: "text-(--caution)" },
        low: { variant: "warn", strong: "text-(--caution)" },
    };

/**
 * Renders the scope-specific confidence served by Home. This does not reuse
 * the organization-wide data-confidence banner or derive a confidence level.
 */
export function ScopeDataConfidenceIndicator({
    confidence,
    className,
}: ScopeDataConfidenceIndicatorProps) {
    const meta = LEVEL_META[confidence.level];
    const coverage = formatCoveragePct(confidence.coverage_pct) ?? "Not reported";

    return (
        <Notice
            variant={meta.variant}
            live={false}
            data-testid="scope-data-confidence-indicator"
            data-level={confidence.level}
            className={className}
        >
            <strong
                data-testid="scope-data-confidence-level"
                className={`font-semibold ${meta.strong}`}
            >
                Scope data confidence: {confidence.level}
            </strong>
            <span aria-hidden="true"> · </span>
            <span data-testid="scope-data-confidence-text">
                Scope coverage: {coverage}. Last scoped ingest:{" "}
                {confidence.last_ingested_at ? (
                    <ClientTimestamp
                        value={confidence.last_ingested_at}
                        fallback={confidence.last_ingested_at}
                    />
                ) : (
                    "Not reported"
                )}
                {confidence.caveats.length > 0 ? ` ${confidence.caveats.join(" ")}` : ""}
            </span>
        </Notice>
    );
}
