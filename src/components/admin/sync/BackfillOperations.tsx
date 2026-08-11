"use client";

import { useState } from "react";
import { SyncCoverageSummaryCard } from "./SyncCoverageSummaryCard";
import { SyncCoverageTimeline } from "./SyncCoverageTimeline";
import { BackfillStatus } from "./BackfillStatus";
import { BackfillWizard } from "./BackfillWizard";
import type {
    BackfillJob,
    SyncCoverageBackfillWindow,
    SyncCoverageSummary,
} from "@/lib/admin/types";

interface BackfillOperationsProps {
    configId: string;
    coverage: SyncCoverageSummary | null;
    coverageError?: string | null;
    isActive: boolean;
    /** Persisted active backfill job (live fetch or test-mode sample); see BackfillStatus. */
    activeBackfillJob: BackfillJob | null;
    testMode?: boolean;
}

interface WizardRange {
    since: string;
    before: string;
}

function toDateInput(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toISOString().slice(0, 10);
}

/**
 * Owns backfill as an OPERATIONAL action on the config detail page
 * (CHAOS-2795): the coverage summary's "Backfill" CTA and every timeline gap
 * row's "Backfill this gap" action open the wizard in place here instead of
 * deep-linking to the edit page. Also hosts the persisted in-progress status
 * (CHAOS-2795) so it survives navigation.
 */
export function BackfillOperations({
    configId,
    coverage,
    coverageError,
    isActive,
    activeBackfillJob,
    testMode = false,
}: BackfillOperationsProps) {
    const [isWizardOpen, setIsWizardOpen] = useState(false);
    const [wizardRange, setWizardRange] = useState<WizardRange | null>(null);

    const openWizard = (range?: SyncCoverageBackfillWindow) => {
        setWizardRange(
            range ? { since: toDateInput(range.since), before: toDateInput(range.before) } : null,
        );
        setIsWizardOpen(true);
    };
    const closeWizard = () => setIsWizardOpen(false);

    return (
        <>
            <SyncCoverageSummaryCard
                configId={configId}
                coverage={coverage}
                error={coverageError}
                isActive={isActive}
                onBackfillAction={() => openWizard()}
            />

            <BackfillStatus
                key={activeBackfillJob?.id ?? "none"}
                initialJob={activeBackfillJob}
                testMode={testMode}
            />

            <SyncCoverageTimeline
                coverage={coverage}
                error={coverageError}
                onBackfillWindowAction={openWizard}
            />

            {isWizardOpen && (
                <BackfillWizard
                    configId={configId}
                    onCloseAction={closeWizard}
                    initialSince={wizardRange?.since}
                    initialBefore={wizardRange?.before}
                    datasets={coverage?.datasets ?? []}
                    sources={coverage?.sources ?? []}
                    testMode={testMode}
                />
            )}
        </>
    );
}
