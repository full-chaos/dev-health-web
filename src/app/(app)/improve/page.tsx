import { AreaOverview } from "@/components/navigation/AreaOverview";
import { GlobalContextBar } from "@/components/navigation/GlobalContextBar";
import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { BackLink } from "@/components/shared/BackLink";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { checkApiHealth } from "@/lib/api/system";
import { getAreaSignals } from "@/lib/areaSignals";
import { getServerEnv } from "@/lib/config";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { withFilterParam } from "@/lib/filters/url";

type ImprovePageProps = {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function ImprovePage({ searchParams }: ImprovePageProps) {
    const params = (await searchParams) ?? {};
    const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
    const roleParam = Array.isArray(params.role) ? params.role[0] : params.role;
    const activeRole = typeof roleParam === "string" ? roleParam : undefined;
    const filters = encodedFilter ? decodeFilter(encodedFilter) : filterFromQueryParams(params);

    const env = getServerEnv();
    const isTestMode =
        env.DEV_HEALTH_TEST_MODE === "true" || env.NEXT_PUBLIC_DEV_HEALTH_TEST_MODE === "true";

    const [health, improveSignals] = await Promise.all([
        checkApiHealth(),
        getAreaSignals("improve", filters, isTestMode),
    ]);

    if (!health.ok && !isTestMode) {
        return <ServiceUnavailable />;
    }

    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="flex w-full flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
                <PrimaryNav filters={filters} active="improve-overview" role={activeRole} />
                <main className="flex min-w-0 flex-1 flex-col gap-8">
                    <header className="flex flex-col gap-4">
                        <BackLink href={withFilterParam("/", filters, activeRole)} />
                        <div>
                            <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                                Improve
                            </p>
                            <h1 className="mt-2 font-(--font-display) text-3xl">Improve</h1>
                            <p className="mt-2 text-sm text-(--ink-muted)">
                                Opportunities, experiments, and automations — each producing actions,
                                not dashboards.
                            </p>
                        </div>
                    </header>

                    <GlobalContextBar filters={filters} />

                    <AreaOverview
                        areaId="improve"
                        signals={improveSignals}
                        filters={filters}
                        role={activeRole}
                        title="Improve"
                        description="Opportunities, experiments, and automations — each producing actions, not dashboards."
                    />
                </main>
            </div>
        </div>
    );
}
