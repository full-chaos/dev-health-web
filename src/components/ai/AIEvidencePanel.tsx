"use client";

import type { AIFilter } from "@/lib/filters/ai";
import { AIEvidenceExplorerWithDrawer } from "./AIEvidenceExplorer";

type AIEvidencePanelProps = {
    filter: AIFilter;
};

/**
 * Governance Risk → Evidence tab (CHAOS-2197). Inline home for the PR-evidence
 * explorer that previously only existed behind metric-card drilldown modals.
 */
export function AIEvidencePanel({ filter }: AIEvidencePanelProps) {
    return (
        <section
            className="rounded-(--radius-md) border border-(--card-stroke) bg-card p-6"
            data-testid="ai-evidence-panel"
        >
            <h3 className="text-h3 font-semibold">Evidence by pull request</h3>
            <p className="mt-1 max-w-3xl text-sm text-(--ink-muted)">
                Pick an AI-attributed PR to see its Work Graph evidence — nodes and edges with
                provenance. Filtered to the current range, repo, and work type.
            </p>
            <AIEvidenceExplorerWithDrawer filter={filter} />
        </section>
    );
}
