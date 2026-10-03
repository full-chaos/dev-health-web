import Link from "next/link";
import { ArrowRight, CircleAlert } from "lucide-react";

import { AdminHeader } from "@/components/admin/AdminHeader";
import { requireSession } from "@/lib/auth";
import {
    DataHealthIdentityDocument,
    GetConnectorsDataHealthDocument,
    GetMappingCoverageHealthDocument,
    type DataHealthIdentityQuery,
    type GetConnectorsDataHealthQuery,
    type GetMappingCoverageHealthQuery,
} from "@/lib/graphql/__generated__/graphql";
import { graphqlFetch } from "@/lib/graphql/urqlClient";
import { logger } from "@/lib/logger";
import { STATUS_PILL } from "@/lib/statusPill";

const NOT_REPORTED = "Not reported";

type CardProps = {
    title: string;
    href: string;
    /** The headline value; `null` = the request failed, shown as "Not reported". */
    value: string | null;
    /** A status pill beside the title (a served count above zero). */
    pill?: string | null;
    description: string;
};

// One card of the overview (design A14): title with an optional pill, a headline value, one
// sentence, the whole card a link with the arrow after the sentence.
function OverviewCard({ title, href, value, pill, description }: CardProps) {
    return (
        <Link
            href={href}
            className="block h-full rounded-(--radius-md) border border-(--card-stroke) bg-card p-5.25 transition-colors hover:border-(--accent-2)"
        >
            <div className="flex items-start justify-between gap-2">
                <h2 className="text-h3 font-semibold">{title}</h2>
                {pill ? (
                    <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_PILL.caution}`}
                    >
                        <CircleAlert aria-hidden="true" className="h-3 w-3" />
                        {pill}
                    </span>
                ) : null}
            </div>
            <p className="mt-3 text-3xl font-semibold text-foreground">{value ?? NOT_REPORTED}</p>
            <p className="mt-2 text-xs text-(--ink-muted)">
                {description}
                <ArrowRight aria-hidden="true" className="ml-1 inline h-3 w-3" />
            </p>
        </Link>
    );
}

async function load<T>(label: string, run: () => Promise<T>): Promise<T | null> {
    try {
        return await run();
    } catch (error) {
        // The failure goes to the log; the card says "Not reported".
        logger.error({ err: error }, `Data Confidence overview: ${label} request failed`);
        return null;
    }
}

export default async function DataHealthOverviewPage() {
    const session = await requireSession();
    const team = session.user.org_id || "default";

    const [connectors, identity, mapping] = await Promise.all([
        load("connectors", () =>
            graphqlFetch<GetConnectorsDataHealthQuery>(GetConnectorsDataHealthDocument.toString(), {
                teamId: team,
            }),
        ),
        load("identity", () =>
            graphqlFetch<DataHealthIdentityQuery>(DataHealthIdentityDocument.toString(), {
                team,
            }),
        ),
        load("mapping", () =>
            graphqlFetch<GetMappingCoverageHealthQuery>(
                GetMappingCoverageHealthDocument.toString(),
                { teamId: team },
            ),
        ),
    ]);

    // Connectors: the same reading the Connectors table uses for "Failed" (a recorded last failure).
    const connectorRows = connectors?.dataHealth.connectors;
    const failing = connectorRows?.filter((row) => row.lastFailure).length ?? 0;
    // Identity: the served count of unmapped identities.
    const unmapped = identity?.dataHealth.identityMapping.unmappedCount;
    // Mapping: the served coverage fractions, as percent (the Mapping page does the same x100).
    const coverage = mapping?.dataHealth.mappingCoverage;
    const pct = (fraction: number) => `${Math.round(fraction * 100)}%`;

    return (
        <div className="space-y-8">
            <AdminHeader
                title="Data Confidence"
                description="Monitor connector freshness, identity coverage, and mapping health."
            />

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                <OverviewCard
                    title="Connectors"
                    href="/data-health/connectors"
                    value={
                        connectorRows
                            ? `${connectorRows.length} ${connectorRows.length === 1 ? "connector" : "connectors"}`
                            : null
                    }
                    pill={connectorRows && failing > 0 ? `${failing} with a failure` : null}
                    description="Check synchronization freshness, errors, and status of all configured providers."
                />
                <OverviewCard
                    title="Identity Coverage"
                    href="/data-health/identity"
                    value={unmapped === undefined ? null : `${unmapped} unmapped`}
                    pill={unmapped !== undefined && unmapped > 0 ? "Review" : null}
                    description="Review unmapped authors, missing identities, and alias suggestions."
                />
                <OverviewCard
                    title="Mapping Coverage"
                    href="/data-health/mapping"
                    value={coverage ? `${pct(coverage.deployments.coveragePct)} deployments` : null}
                    description={
                        coverage
                            ? `Work items ${pct(coverage.workItems.coveragePct)}. Review deployment to work-item mapping and overall traceability.`
                            : "Review deployment to work-item mapping and overall traceability."
                    }
                />
            </div>
        </div>
    );
}
