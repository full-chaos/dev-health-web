import Link from "next/link";

import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { OpportunityMasterDetail } from "./OpportunityMasterDetail";
import { DataState } from "@/components/ui/DataState";
import { Notice } from "@/components/ui/Notice";
import { RetryButton } from "@/components/ui/RetryButton";
import { checkApiHealth } from "@/lib/api/system";
import { getOpportunities } from "@/lib/api/home";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { fetchOrNull } from "@/lib/fetchOrNull";
import { withFilterParam } from "@/lib/filters/url";
import { CTA_LABELS } from "@/lib/design/cta";
import { getServerEnv } from "@/lib/config";
import { PageHeader } from "@/components/shell/PageHeader";
import { ScopeBar } from "@/components/shell/ScopeBar";

type OpportunitiesPageProps = {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function OpportunitiesPage({ searchParams }: OpportunitiesPageProps) {
    const params = (await searchParams) ?? {};
    const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
    const roleParam = Array.isArray(params.role) ? params.role[0] : params.role;
    const activeRole = typeof roleParam === "string" ? roleParam : undefined;

    const filters = encodedFilter ? decodeFilter(encodedFilter) : filterFromQueryParams(params);

    const env = getServerEnv();
    const isTestMode =
        env.DEV_HEALTH_TEST_MODE === "true" || env.NEXT_PUBLIC_DEV_HEALTH_TEST_MODE === "true";

    const [health, data] = await Promise.all([
        checkApiHealth(),
        fetchOrNull(getOpportunities(filters), "opportunities/data"),
    ]);

    if (!health.ok && !isTestMode) {
        return <ServiceUnavailable landmark={false} />;
    }

    return (
        // Rendered inside the shared app shell: the layout owns the navigation, the
        // page padding and the `<main>` landmark.
        <div className="flex min-w-0 flex-1 flex-col gap-8 text-foreground">
            <PageHeader
                title="Opportunities"
                subtitle="Evidence-linked improvement opportunities with clear artifacts and recommended next steps."
            />

            <ScopeBar view="opportunities" />

            {data && data.items.length > 0 && (
                <OpportunityMasterDetail
                    items={data.items}
                    filters={filters}
                    activeRole={activeRole}
                />
            )}
            {data && data.items.length === 0 && (
                <DataState
                    variant="detector-enabled-no-findings"
                    title="No open opportunities"
                    description="No open opportunities in this window — nothing is trending worse for the current scope."
                    data-testid="opportunities-empty"
                />
            )}
            {!data && (
                <DataState
                    variant="error"
                    title="Opportunity data unavailable."
                    message="Opportunities could not be loaded for the current window."
                    action={<RetryButton />}
                    data-testid="opportunities-error"
                />
            )}

            <Notice
                variant="info"
                live={false}
                title="Automation opportunities for AI-assisted work"
                titleAs="h2"
                data-testid="improve-ai-automations-crosslink"
                action={
                    <Link
                        href={withFilterParam("/ai/automations", filters, activeRole)}
                        className="text-xs uppercase tracking-[0.2em] text-(--accent-2) underline-offset-4 hover:underline"
                    >
                        {CTA_LABELS.seeAIAutomations} →
                    </Link>
                }
            >
                Responsible automation candidates detected on AI-attributed work live in the AI
                area, scoped to your current filters.
            </Notice>
        </div>
    );
}
