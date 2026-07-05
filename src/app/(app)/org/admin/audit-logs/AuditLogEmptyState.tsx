"use client";

import { DataState } from "@/components/ui/DataState";
import { Button } from "@/components/shared/Button";
import { CTA_LABELS } from "@/lib/design/cta";

type AuditLogEmptyStateProps = {
    /** Whether the current query has any non-empty filter applied. */
    hasActiveFilters: boolean;
    onResetAction: () => void;
};

/**
 * Customer-safe "no rows" states for the audit-logs investigation page
 * (CHAOS-2843, design system A11): a filtered zero-result state is visually
 * and textually distinct from the initial "nothing recorded yet" state, and
 * the filtered state offers a one-click way back to an unfiltered view.
 */
export function AuditLogEmptyState({ hasActiveFilters, onResetAction }: AuditLogEmptyStateProps) {
    if (hasActiveFilters) {
        return (
            <DataState
                variant="detector-enabled-no-findings"
                title="No audit events match these filters"
                description="Try widening the date range or clearing a filter to see more activity."
                data-testid="audit-log-empty-filtered"
                action={
                    <Button variant="secondary" onClick={onResetAction}>
                        {CTA_LABELS.resetFilters}
                    </Button>
                }
            />
        );
    }

    return (
        <DataState
            variant="detector-enabled-no-findings"
            title="No audit events recorded yet"
            description="Audit events appear here as members take actions in your organization."
            data-testid="audit-log-empty-initial"
        />
    );
}
