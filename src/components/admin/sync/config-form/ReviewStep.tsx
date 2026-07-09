import { CTA_LABELS } from "@/lib/design/cta";
import { ReviewSummary, type ReviewSummaryRow } from "@/components/shared/ReviewSummary";

type ReviewStepProps = {
    name: string;
    providerLabel: string;
    credentialName: string | null;
    isRepoScoped: boolean;
    syncAllRepos: boolean;
    owner: string;
    repoCount: number;
    datasetLabels: string[];
    showAutoImport: boolean;
    autoImportTeams: boolean;
    depthLabel: string;
    scheduleLabel: string;
    timezone: string | null;
    isActive: boolean;
    isPending: boolean;
    onBackAction: () => void;
};

function repoScopeValue(syncAllRepos: boolean, owner: string, repoCount: number): string {
    if (syncAllRepos) {
        return owner
            ? `All repositories this credential can access in ${owner}`
            : "All repositories this credential can access";
    }
    if (repoCount > 0) {
        return `${repoCount} repositor${repoCount === 1 ? "y" : "ies"} selected${owner ? ` in ${owner}` : ""}`;
    }
    return owner ? `No repositories selected yet in ${owner}` : "No repositories selected yet";
}

/**
 * Final review-before-submit step of the guided sync-config creation flow
 * (CHAOS-2838): a read-only summary of every staged choice, built on the
 * shared `ReviewSummary` primitive, plus the actual submit control.
 */
export function ReviewStep({
    name,
    providerLabel,
    credentialName,
    isRepoScoped,
    syncAllRepos,
    owner,
    repoCount,
    datasetLabels,
    showAutoImport,
    autoImportTeams,
    depthLabel,
    scheduleLabel,
    timezone,
    isActive,
    isPending,
    onBackAction,
}: ReviewStepProps) {
    const rows: ReviewSummaryRow[] = [
        { label: "Configuration name", value: name },
        { label: "Provider", value: providerLabel },
        { label: "Credential", value: credentialName ?? "None selected" },
    ];

    if (isRepoScoped) {
        rows.push({
            label: "Repository scope",
            value: repoScopeValue(syncAllRepos, owner, repoCount),
        });
    }

    rows.push({
        label: "Datasets",
        value: datasetLabels.length > 0 ? datasetLabels.join(", ") : "None selected",
    });

    if (showAutoImport) {
        rows.push({
            label: "Auto-import teams",
            value: autoImportTeams ? "Enabled" : "Disabled",
        });
    }

    rows.push({ label: "Initial depth", value: depthLabel });
    rows.push({
        label: "Schedule",
        value: isActive ? `${scheduleLabel}${timezone ? ` (${timezone})` : ""}` : "Sync disabled",
    });

    return (
        <div className="space-y-4">
            <ReviewSummary rows={rows} />
            <div className="flex items-center justify-between gap-3">
                <button
                    type="button"
                    onClick={onBackAction}
                    className="rounded-lg border border-(--card-stroke) px-4 py-2 text-sm font-medium text-(--ink-muted) hover:bg-(--card-70) hover:text-foreground"
                >
                    {CTA_LABELS.backButton}
                </button>
                <button
                    type="submit"
                    disabled={isPending}
                    className="rounded-lg bg-(--accent) px-4 py-2 text-sm font-medium text-white hover:bg-(--accent)/90 disabled:opacity-50"
                >
                    {isPending ? CTA_LABELS.savingConfiguration : CTA_LABELS.createConfiguration}
                </button>
            </div>
        </div>
    );
}
