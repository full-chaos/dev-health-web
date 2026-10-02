import { DataState } from "@/components/ui/DataState";
import { Section } from "@/components/ui/Section";
import { formatPercent } from "@/lib/formatters";
import type { RepositoryCoverageRow } from "@/lib/testops/coverageRepos";

/** Shown for a value the API does not serve. */
const NOT_REPORTED = "Not reported";

type CoverageBaselineCardProps = {
    repositories: RepositoryCoverageRow[];
    /** The one product target baseline (percent). */
    baselinePct: number;
    fetchFailed?: boolean;
};

/**
 * The approved "Coverage against baseline" card: per repository, its name, then one row per
 * coverage kind with the served value. Line coverage is the served breakdown value. Branch
 * coverage by repository is not served by the API yet, so its row reads "Not reported" (never a
 * made-up value). The baseline is the one product target, shown once in the card head.
 */
export function CoverageBaselineCard({
    repositories,
    baselinePct,
    fetchFailed = false,
}: CoverageBaselineCardProps) {
    const baselineLabel = `${formatPercent(baselinePct)} baseline`;
    return (
        <Section
            title="Coverage against baseline"
            description="Line coverage of each repository against the one target baseline."
            action={
                <span
                    data-testid="testops-coverage-baseline-pill"
                    className="inline-flex items-center rounded-full bg-(--info)/12 px-2.25 py-0.5 text-label-caps text-(--info)"
                >
                    {baselineLabel}
                </span>
            }
            data-testid="testops-coverage-baseline"
        >
            {fetchFailed ? (
                <DataState
                    variant="error"
                    title="Coverage could not be loaded"
                    message="Coverage analytics could not be loaded. The repositories will reappear once the data service recovers."
                />
            ) : repositories.length === 0 ? (
                <DataState
                    variant="no-data-connected"
                    title="No repository coverage"
                    description="Repository coverage appears here once connected CI coverage data is available for this scope."
                />
            ) : (
                <div className="space-y-5">
                    {repositories.map((repo) => (
                        <div key={repo.id} data-testid="testops-coverage-baseline-repo">
                            <p className="text-sm font-semibold text-foreground" title={repo.title}>
                                {repo.name}
                            </p>
                            <dl className="mt-2 text-xs">
                                <CoverageRow
                                    label="Line coverage"
                                    value={formatPercent(repo.lineCoverage)}
                                />
                                <CoverageRow label="Branch coverage" />
                            </dl>
                        </div>
                    ))}
                    <div className="rounded-(--radius-sm) bg-background p-3.75 text-xs text-(--ink-muted)">
                        The baseline is one product target ({formatPercent(baselinePct)} line
                        coverage) for every repository. Branch coverage and a per-repository
                        baseline are not reported yet.
                    </div>
                </div>
            )}
        </Section>
    );
}

/** One coverage row: label left, the served value right ("Not reported" when not served). */
function CoverageRow({ label, value }: { label: string; value?: string }) {
    const reported = value !== undefined;
    return (
        <div
            data-testid="testops-coverage-row"
            data-reported={reported}
            className="flex items-center gap-3 border-b border-(--card-stroke) py-2 last:border-b-0"
        >
            <dt className="text-(--ink-muted)">{label}</dt>
            <dd
                className={`ml-auto tabular-nums ${
                    reported ? "font-semibold text-foreground" : "text-(--ink-muted)"
                }`}
            >
                {reported ? value : NOT_REPORTED}
            </dd>
        </div>
    );
}
