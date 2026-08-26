import { CTA_LABELS } from "@/lib/design/cta";
import { ReviewSummary, type ReviewSummaryRow } from "@/components/shared/ReviewSummary";
import { AUTO_IMPORT_CATEGORIES } from "./constants";
import type { ServiceRepositoryMappings } from "@/lib/admin/pagerduty";
import type { AutoImportCapability, AutoImportCategory } from "@/lib/admin/types";

type ReviewStepProps = {
    name: string;
    providerLabel: string;
    credentialName: string | null;
    isRepoScoped: boolean;
    syncAllRepos: boolean;
    owner: string;
    repoCount: number;
    datasetLabels: string[];
    autoImportCapability: AutoImportCapability | undefined;
    autoImportValues: Record<AutoImportCategory, boolean>;
    depthLabel: string;
    scheduleLabel: string;
    timezone: string | null;
    isActive: boolean;
    serviceRepositoryMappings: ServiceRepositoryMappings;
    pagerDutyServiceDisplayNames: Readonly<Record<string, string>>;
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

function serviceRepositoryMappingsValue(
    mappings: ServiceRepositoryMappings,
    displayNames: Readonly<Record<string, string>>,
): string {
    const entries = Object.entries(mappings);
    if (entries.length === 0) return "No service mappings configured";
    return entries
        .map(([serviceExternalId, repositories]) => {
            const displayName = displayNames[serviceExternalId] ?? "Unavailable PagerDuty service";
            const targets = repositories
                .map((repository) => `${repository.provider}:${repository.full_name}`)
                .join(", ");
            return `${displayName}: ${targets}`;
        })
        .join("; ");
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
    autoImportCapability,
    autoImportValues,
    depthLabel,
    scheduleLabel,
    timezone,
    isActive,
    serviceRepositoryMappings,
    pagerDutyServiceDisplayNames,
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

    const capabilitySupportsAny =
        !!autoImportCapability &&
        (autoImportCapability.teams ||
            autoImportCapability.projects ||
            autoImportCapability.members);
    if (capabilitySupportsAny && autoImportCapability) {
        for (const category of AUTO_IMPORT_CATEGORIES) {
            const supported = autoImportCapability[category.id];
            rows.push({
                label: category.label,
                value: supported
                    ? autoImportValues[category.id]
                        ? "Enabled"
                        : "Disabled"
                    : "Not supported",
            });
        }
    }

    rows.push({ label: "Initial depth", value: depthLabel });
    if (providerLabel === "PagerDuty") {
        rows.push({
            label: "Service repository mappings",
            value: serviceRepositoryMappingsValue(
                serviceRepositoryMappings,
                pagerDutyServiceDisplayNames,
            ),
        });
    }
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
                    className="rounded-lg bg-(--accent) px-4 py-2 text-sm font-medium text-(--accent-foreground) hover:bg-(--accent)/90 disabled:opacity-50"
                >
                    {isPending ? CTA_LABELS.savingConfiguration : CTA_LABELS.createConfiguration}
                </button>
            </div>
        </div>
    );
}
