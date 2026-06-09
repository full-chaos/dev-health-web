"use client";

import type { AIFilter } from "@/lib/filters/ai";
import { AIEvidenceExplorer } from "./AIEvidenceExplorer";

type AIDrilldownModalProps = {
    metric: string;
    filter: AIFilter;
    onClose: () => void;
};

export function AIDrilldownModal({ metric, filter, onClose }: AIDrilldownModalProps) {
    const titleId = "ai-drilldown-title";

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
            onClick={onClose}
            data-testid="ai-drilldown-modal"
        >
            <div
                className="w-full max-w-3xl rounded-3xl border border-(--card-stroke) bg-card p-6 shadow-xl"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-(--ink-muted)">
                            {metric}
                        </p>
                        <h3 id={titleId} className="font-(--font-display) text-xl">
                            Evidence by pull request
                        </h3>
                        <p className="mt-1 text-sm text-(--ink-muted)">
                            Pick an AI-attributed PR to see its Work Graph evidence. Filtered to the
                            current dashboard range, repo, and work type.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-full border border-(--card-stroke) px-3 py-1 text-xs font-semibold text-(--ink-muted) hover:text-foreground"
                        aria-label="Close evidence drilldown"
                    >
                        Close
                    </button>
                </div>

                <AIEvidenceExplorer filter={filter} />
            </div>
        </div>
    );
}
