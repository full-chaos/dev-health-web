/**
 * /risk/compounding — Compounding Risk surface (CHAOS-1642).
 *
 * RSC entry. Reads from the backend ``compoundingRisk`` GraphQL query
 * (CHAOS-1641) and renders ``CompoundingRiskDashboard``.
 *
 * Per the no-surveillance contract, person/developer scope is intentionally
 * disallowed on this surface. If a caller hands us a ``filters.scope.level
 * === "developer"`` query string, the page renders a guardrail banner and
 * does not fetch person-scoped data.
 */

import Link from "next/link";
import { BackLink } from "@/components/shared/BackLink";

import { GlobalContextBar } from "@/components/navigation/GlobalContextBar";
import { FilterBar } from "@/components/filters/FilterBar";
import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import {
    CompoundingRiskDashboard,
    type CompoundingRiskDashboardProps,
    type CompoundingRiskRowView,
    type CompoundingRiskScope,
    type CompoundingRiskSeverity,
    type CompoundingRiskTrendPointView,
} from "@/components/risk/CompoundingRiskDashboard";
import { requireSession } from "@/lib/auth";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { withFilterParam } from "@/lib/filters/url";
import { graphqlFetch } from "@/lib/graphql/server";
import { COMPOUNDING_RISK_QUERY } from "@/lib/graphql/queries";

type CompoundingRiskPageProps = {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

type CompoundingRiskQueryResponse = {
    compoundingRisk: {
        orgId: string;
        breakout: "REPO" | "TEAM";
        generatedAt: string;
        rows: Array<{
            day: string;
            scope: "REPO" | "TEAM";
            scopeId: string;
            scopeLabel: string;
            score: number | null;
            severity: Uppercase<CompoundingRiskSeverity>;
            computedAt: string;
            components: CompoundingRiskRowView["components"];
            weights: CompoundingRiskRowView["weights"];
            thresholds: CompoundingRiskRowView["thresholds"];
        }>;
        trend: Array<{
            day: string;
            score: number | null;
            severity: Uppercase<CompoundingRiskSeverity>;
        }>;
    };
};

function normalizeScope(value: "REPO" | "TEAM"): CompoundingRiskScope {
    return value === "TEAM" ? "team" : "repo";
}

function normalizeSeverity(value: Uppercase<CompoundingRiskSeverity>): CompoundingRiskSeverity {
    switch (value) {
        case "HIGH":
            return "high";
        case "ELEVATED":
            return "elevated";
        case "LOW":
            return "low";
        case "UNKNOWN":
        default:
            return "unknown";
    }
}

function pickBreakoutFromQuery(value: unknown): CompoundingRiskScope {
    if (value === "team" || value === "TEAM") return "team";
    return "repo";
}

async function fetchCompoundingRisk(
    orgId: string,
    breakout: CompoundingRiskScope,
): Promise<CompoundingRiskDashboardProps | null> {
    try {
        const data = await graphqlFetch<CompoundingRiskQueryResponse>(
            COMPOUNDING_RISK_QUERY,
            {
                orgId,
                filter: {
                    breakout: breakout.toUpperCase(),
                    trendDays: 30,
                },
            },
            { orgId },
        );
        const payload = data?.compoundingRisk;
        if (!payload) return null;
        const rows: CompoundingRiskRowView[] = payload.rows.map((row) => ({
            day: row.day,
            scope: normalizeScope(row.scope),
            scopeId: row.scopeId,
            scopeLabel: row.scopeLabel,
            score: row.score,
            severity: normalizeSeverity(row.severity),
            components: row.components,
            weights: row.weights,
            thresholds: row.thresholds,
            computedAt: row.computedAt,
        }));
        const trend: CompoundingRiskTrendPointView[] = payload.trend.map((point) => ({
            day: point.day,
            score: point.score,
            severity: normalizeSeverity(point.severity),
        }));
        return {
            orgId: payload.orgId,
            breakout: normalizeScope(payload.breakout),
            rows,
            trend,
            generatedAt: payload.generatedAt,
        };
    } catch (error) {
        // Surface as empty state rather than crashing the surface; the dashboard
        // already shows a populated empty-state message.
        console.warn("compoundingRisk query failed", error);
        return null;
    }
}

export default async function CompoundingRiskPage({ searchParams }: CompoundingRiskPageProps) {
    const session = await requireSession();
    const params = (await searchParams) ?? {};

    const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
    const roleParam = Array.isArray(params.role) ? params.role[0] : params.role;
    const originParam = Array.isArray(params.origin) ? params.origin[0] : params.origin;
    const breakoutParam = Array.isArray(params.breakout) ? params.breakout[0] : params.breakout;

    const activeRole = typeof roleParam === "string" ? roleParam : undefined;
    const activeOrigin = typeof originParam === "string" ? originParam : undefined;
    const filters = encodedFilter ? decodeFilter(encodedFilter) : filterFromQueryParams(params);

    const isDeveloperScope = filters.scope.level === "developer";
    const breakout = pickBreakoutFromQuery(breakoutParam);

    const orgId = session.user?.org_id ?? "demo-org";

    const fetched = isDeveloperScope ? null : await fetchCompoundingRisk(orgId, breakout);

    // Always render the dashboard with the data we have (or empty defaults).
    // The dashboard component owns the unified empty-state UX so the layout
    // is consistent whether the GraphQL payload is populated, missing, or all-null.
    const dashboard: CompoundingRiskDashboardProps = fetched ?? {
        orgId,
        breakout,
        rows: [],
        trend: [],
        generatedAt: null,
    };

    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="flex w-full flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
                <PrimaryNav filters={filters} active="risk-compounding" role={activeRole} />
                <main
                    className="flex min-w-0 flex-1 flex-col gap-8"
                    data-testid="compounding-risk-page"
                >
                    <header className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                            <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                                Compounding Risk
                            </p>
                            <h1 className="mt-2 font-(--font-display) text-3xl">
                                Composite risk score
                            </h1>
                            <p className="mt-2 text-sm text-(--ink-muted)">
                                Where churn, complexity trend, ownership concentration, and review
                                latency are compounding into structural risk.
                            </p>
                            <p className="mt-2 text-sm text-(--ink-muted)">
                                Every score is inspectable: weights, thresholds, and raw inputs
                                persist with the row.
                            </p>
                        </div>
                        <BackLink href={withFilterParam("/", filters, activeRole)} />
                    </header>

                    <FilterBar view="risk-compounding" />

                    <GlobalContextBar filters={filters} origin={activeOrigin} />

                    {isDeveloperScope ? (
                        <section
                            className="rounded-[1.75rem] border border-amber-400/40 bg-amber-50/80 p-6 text-amber-950 shadow-sm"
                            data-testid="developer-scope-guardrail"
                        >
                            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
                                Scope guardrail
                            </p>
                            <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                                Compounding Risk is a team and repo signal.
                            </h2>
                            <p className="mt-3 max-w-3xl text-sm leading-6">
                                Per the no-surveillance contract, this surface intentionally does
                                not break down by person. Use team or repo aggregation to see where
                                change pressure is compounding architectural and operational risk.
                            </p>
                            <Link
                                href="/risk/compounding"
                                className="mt-5 inline-flex rounded-full bg-amber-950 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber-50"
                            >
                                Return to team/repo view
                            </Link>
                        </section>
                    ) : (
                        <CompoundingRiskDashboard {...dashboard} />
                    )}
                </main>
            </div>
        </div>
    );
}
