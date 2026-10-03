"use client";

import { Button } from "@/components/shared/Button";
import { Drawer } from "@/components/ui/Drawer";
import { CTA_LABELS } from "@/lib/design/cta";
import type { AIFilter } from "@/lib/filters/ai";

import { AIEvidenceExplorer } from "./AIEvidenceExplorer";

/** Small caps line above the drawer title (the concept's `A_drill`, CHAOS-8297 follow-up). */
export const AI_EVIDENCE_DRAWER_EYEBROW = "Evidence & context";

/**
 * The "Open evidence" drawer of Review Load and Governance Risk: the shared wide Drawer holding the PR
 * explorer, with the Work Graph evidence stacked under the table. The metric the card named is a
 * small caps line at the top of the body; a Close button sits in the footer.
 */
export function AIEvidenceDrawer({
    metric,
    filter,
    onCloseAction,
}: {
    /** The metric whose evidence was opened; the drawer is open when it is not null. */
    metric: string | null;
    filter: AIFilter;
    onCloseAction: () => void;
}) {
    return (
        <Drawer
            open={metric !== null}
            onCloseAction={onCloseAction}
            eyebrow={AI_EVIDENCE_DRAWER_EYEBROW}
            title="Evidence by pull request"
            size="wide"
            data-testid="ai-drilldown-drawer"
            footer={
                <Button variant="secondary" onClick={onCloseAction}>
                    {CTA_LABELS.close}
                </Button>
            }
        >
            <p
                className="mb-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-(--ink-muted)"
                data-testid="ai-drilldown-metric"
            >
                {metric}
            </p>
            <p className="text-sm text-(--ink-muted)">
                Pick an AI-attributed PR to see its Work Graph evidence. Filtered to the current
                dashboard range, repo, and work type.
            </p>
            <AIEvidenceExplorer filter={filter} layout="stacked" />
        </Drawer>
    );
}
