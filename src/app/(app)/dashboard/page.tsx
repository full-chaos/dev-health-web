import { ClientTimestamp } from "@/components/ClientTimestamp";
import { CockpitSummary } from "@/components/home/CockpitSummary";
import { RankedSignals } from "@/components/home/RankedSignals";
import { DataConfidenceIndicator } from "@/components/home/DataConfidenceIndicator";
import { EvidenceContextCard } from "@/components/home/EvidenceContextCard";
import { HomeMonitoring } from "@/components/home/HomeMonitoring";
import { InvestigationThreads } from "@/components/home/InvestigationThreads";
import { EvidenceFact, EvidenceFactList } from "@/components/evidence/EvidenceFacts";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { PageHeader } from "@/components/shell/PageHeader";
import { PageHeaderEvidenceAction } from "@/components/shell/PageHeaderEvidenceAction";
import { ScopeBar } from "@/components/shell/ScopeBar";
import { getLensFromSearchParams, getLensConfig, DEFAULT_ROLE } from "@/lib/lensContext";
import { checkApiHealth } from "@/lib/api/system";
import { getHomeDataViaGraphQL } from "@/lib/graphql/homeFetchers";
import { getSetupStatus } from "@/lib/admin/server";
import { SetupBanner } from "@/components/onboarding/SetupBanner";
import { auth } from "@/lib/auth";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { formatCoveragePct } from "@/lib/cockpit/coverage";
import { buildThreadApiUrl } from "@/lib/cockpit/evidenceRef";
import type { HomeResponse } from "@/lib/types";

const loadHome = async (
    filters: Parameters<typeof getHomeDataViaGraphQL>[0],
): Promise<HomeResponse | null> => {
    try {
        return await getHomeDataViaGraphQL(filters);
    } catch {
        return null;
    }
};

type HomePageProps = {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function Home({ searchParams }: HomePageProps) {
    const params = (await searchParams) ?? {};
    const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
    const filters = encodedFilter ? decodeFilter(encodedFilter) : filterFromQueryParams(params);

    const lensParam = Array.isArray(params.lens) ? params.lens[0] : params.lens;
    const roleParam = Array.isArray(params.role) ? params.role[0] : params.role;
    const activeLensId =
        getLensFromSearchParams(
            new URLSearchParams({
                ...(lensParam ? { lens: lensParam } : {}),
                ...(roleParam ? { role: roleParam } : {}),
            }),
        ) ?? "neutral";
    const lensConfig = getLensConfig(activeLensId);
    // Resolve a concrete role for child components that require RoleType.
    const activeRole = activeLensId === "neutral" ? DEFAULT_ROLE : activeLensId;

    // Run health check in parallel with data fetches to eliminate the waterfall.
    const [health, home, setupResult, session] = await Promise.all([
        checkApiHealth(),
        loadHome(filters),
        getSetupStatus(),
        auth(),
    ]);
    // CHAOS-2678: setup-aware surface. Degrade to no banner if the C2 status
    // call fails rather than blocking the cockpit.
    const setupStatus = setupResult.data ?? null;
    const setupOrgId = session?.user?.org_id ?? null;

    if (!health.ok) {
        // The shared app shell owns the `<main>` landmark for this route.
        return <ServiceUnavailable landmark={false} />;
    }
    // The freshness facts of the Home answer, read for the signed-in organization: the last ingest
    // time and the three coverage percents. The public meta route serves no organization data, so
    // it is not read. A fact that is not served has no value here and reads "Not reported".
    const lastIngested = home?.freshness?.last_ingested_at;
    const coverage = home?.freshness?.coverage;

    return (
        // Rendered inside the shared app shell: the layout owns the navigation, the
        // page padding and the `<main>` landmark.
        <div className="flex min-w-0 flex-1 flex-col gap-10 text-foreground">
            <PageHeader
                title="Home"
                subtitle={<>System patterns over the last {filters.time.range_days} days.</>}
                actions={
                    // The page subject is the Home payload itself, for the page's scope and window.
                    <PageHeaderEvidenceAction
                        subject={{
                            title: "Home",
                            apiUrl: buildThreadApiUrl("/api/v1/home", filters),
                            filters,
                            // The served coverage of the page: read here, not in the body. First
                            // the source coverage of the Home response, then its freshness facts:
                            // the last ingest time and the three coverage percents.
                            intro: (
                                <EvidenceFactList
                                    aria-label="Page data confidence"
                                    testId="home-evidence-coverage"
                                >
                                    <EvidenceFact
                                        label="Coverage"
                                        value={formatCoveragePct(
                                            home?.data_confidence?.coverage_pct,
                                        )}
                                    />
                                    <EvidenceFact
                                        label="Last ingested"
                                        value={
                                            lastIngested ? (
                                                // An unparseable value is shown as served.
                                                <ClientTimestamp
                                                    value={lastIngested}
                                                    fallback={lastIngested}
                                                />
                                            ) : undefined
                                        }
                                    />
                                    <EvidenceFact
                                        label="Repositories covered"
                                        value={formatCoveragePct(coverage?.repos_covered_pct)}
                                    />
                                    <EvidenceFact
                                        label="PRs linked to issues"
                                        value={formatCoveragePct(
                                            coverage?.prs_linked_to_issues_pct,
                                        )}
                                    />
                                    <EvidenceFact
                                        label="Issues with cycle states"
                                        value={formatCoveragePct(
                                            coverage?.issues_with_cycle_states_pct,
                                        )}
                                    />
                                </EvidenceFactList>
                            ),
                        }}
                    />
                }
            >
                {lensConfig.framing ? (
                    <p className="text-xs text-(--accent-2)/80">{lensConfig.framing}</p>
                ) : null}
            </PageHeader>

            {setupStatus ? <SetupBanner status={setupStatus} orgId={setupOrgId} /> : null}

            <ScopeBar view="home" />

            {/* Approved Home layout (prototype `cockpit()`): confidence banner, primary-signal
                hero, the ranked signals table beside the "Evidence & context" card, Monitoring,
                then Investigation threads. Nothing else is a body block. */}
            <div className="flex min-w-0 flex-col gap-4.5" data-testid="home-primary">
                {home?.data_confidence ? (
                    <DataConfidenceIndicator confidence={home.data_confidence} />
                ) : null}

                <CockpitSummary home={home} filters={filters} />

                <div className="grid gap-4.5 lg:grid-cols-[minmax(0,1fr)_20rem]">
                    <RankedSignals
                        signals={home?.signals ?? []}
                        deltas={home?.deltas}
                        filters={filters}
                    />
                    <EvidenceContextCard home={home} />
                </div>

                <HomeMonitoring
                    home={home}
                    filters={filters}
                    activeRole={activeRole}
                    lensId={activeLensId}
                    initialView={
                        Array.isArray(params.monitoring) ? params.monitoring[0] : params.monitoring
                    }
                />

                <InvestigationThreads home={home} filters={filters} activeRole={activeRole} />
            </div>
        </div>
    );
}
