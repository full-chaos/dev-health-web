import { AdminHeader } from "@/components/admin/AdminHeader";
import { Notice } from "@/components/ui/Notice";
import { RetryButton } from "@/components/ui/RetryButton";
import { Section } from "@/components/ui/Section";
import { logger } from "@/lib/logger";
import { CoverageBar } from "../_components/CoverageBar";
import { graphqlFetch } from "@/lib/graphql/urqlClient";
import {
    GetMappingCoverageHealthDocument,
    type GetMappingCoverageHealthQuery,
} from "@/lib/graphql/__generated__/graphql";
import { requireSession } from "@/lib/auth";

export default async function MappingHealthPage() {
    const session = await requireSession();

    const teamId = session.user.org_id || "default";

    let coverageData = null;
    let error: string | null = null;

    try {
        const res = await graphqlFetch<GetMappingCoverageHealthQuery>(
            GetMappingCoverageHealthDocument.toString(),
            { teamId },
        );
        coverageData = res.dataHealth.mappingCoverage;
    } catch (e) {
        // The failure goes to the log; the page says one plain sentence + Retry.
        logger.error({ err: e }, "Failed to load mapping coverage");
        error = "Failed to load mapping coverage";
    }

    return (
        <div className="space-y-8">
            <AdminHeader
                title="Data Confidence"
                description="Deployment to work-item mapping and overall traceability."
            />

            {error && (
                <Notice variant="danger" live={false} action={<RetryButton />}>
                    Mapping coverage could not be loaded. Retry, or check again in a moment.
                </Notice>
            )}

            {!error && !coverageData && (
                <div className="rounded-lg border border-(--card-stroke) bg-(--card-80) p-8 text-center text-(--ink-muted)">
                    No mapping coverage data found.
                </div>
            )}

            {coverageData && (
                <div className="grid gap-6 md:grid-cols-2">
                    <Section
                        title="Deployments Coverage"
                        description="Percentage of deployments successfully mapped back to work items."
                    >
                        <CoverageBar
                            coveragePercent={coverageData.deployments.coveragePct * 100}
                            label={`${coverageData.deployments.coveredRepos} of ${coverageData.deployments.totalRepos} Repos`}
                        />
                    </Section>

                    <Section
                        title="Work Items Coverage"
                        description="Percentage of work items successfully mapped back to deployments."
                    >
                        <CoverageBar
                            coveragePercent={coverageData.workItems.coveragePct * 100}
                            label={`${coverageData.workItems.coveredRepos} of ${coverageData.workItems.totalRepos} Repos`}
                        />
                    </Section>
                </div>
            )}
        </div>
    );
}
