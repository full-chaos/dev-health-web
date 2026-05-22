import { AdminHeader } from "@/components/admin/AdminHeader";
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
    error = e instanceof Error ? e.message : "Failed to load mapping coverage";
  }

  return (
    <div className="space-y-8">
      <AdminHeader
        title="Mapping Coverage"
        description="Deployment to work-item mapping and overall traceability."
      />

      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-red-500">
          Failed to load data: {error}
        </div>
      )}

      {!error && !coverageData && (
        <div className="rounded-lg border border-(--card-stroke) bg-(--card-80) p-8 text-center text-(--ink-muted)">
          No mapping coverage data found.
        </div>
      )}

      {coverageData && (
        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-xl border border-(--card-stroke) bg-(--card-80) p-6">
            <h3 className="font-semibold text-lg mb-4">Deployments Coverage</h3>
            <p className="text-sm text-(--ink-muted) mb-4">
              Percentage of deployments successfully mapped back to work items.
            </p>
            <CoverageBar
              coveragePercent={coverageData.deployments.coveragePct * 100}
              label={`${coverageData.deployments.coveredRepos} of ${coverageData.deployments.totalRepos} Repos`}
            />
          </div>

          <div className="rounded-xl border border-(--card-stroke) bg-(--card-80) p-6">
            <h3 className="font-semibold text-lg mb-4">Work Items Coverage</h3>
            <p className="text-sm text-(--ink-muted) mb-4">
              Percentage of work items successfully mapped back to deployments.
            </p>
            <CoverageBar
              coveragePercent={coverageData.workItems.coveragePct * 100}
              label={`${coverageData.workItems.coveredRepos} of ${coverageData.workItems.totalRepos} Repos`}
            />
          </div>
        </div>
      )}
    </div>
  );
}
