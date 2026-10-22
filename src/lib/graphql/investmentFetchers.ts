/**
 * GraphQL-based fetchers for Investment view.
 *
 * These fetchers adapt GraphQL responses to match the shapes
 * expected by the existing REST-based UI components.
 * Toggle with USE_GRAPHQL_ANALYTICS=true (runtime) or NEXT_PUBLIC_USE_GRAPHQL_ANALYTICS=true.
 */

import { AuthErrors } from "@/lib/constants/errors";
import type { MetricFilter } from "@/lib/filters/types";
import type { InvestmentResponse, SankeyResponse, SankeyNode, SankeyLink } from "@/lib/types";
import { formatSubcategoryLabel } from "@/lib/investmentMix";
import { graphqlFetch } from "./urqlClient";
import { INVESTMENT_BREAKDOWN_QUERY } from "./queries";
import type {
    AnalyticsQueryResponse,
    AnalyticsRequestInput,
    DimensionInput,
    FilterInput,
    MeasureInput,
    SankeyResult,
    ScopeLevelInput,
} from "./types";

/**
 * Get the org ID from filters or context.
 * Throws an error if org_id cannot be determined.
 */
export function getOrgId(filters: MetricFilter, contextOrgId?: string): string {
    // Extract org from scope when scope level is "org"
    if (filters.scope.level === "org" && filters.scope.ids.length > 0) {
        return filters.scope.ids[0];
    }
    // Use context org if provided
    if (contextOrgId) {
        return contextOrgId;
    }
    // Throw error if no org can be determined
    throw new Error(AuthErrors.OrgIdRequiredFromContext);
}

const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function isCalendarDay(day: string): boolean {
    if (!ISO_DAY.test(day)) return false;
    const parsed = new Date(`${day}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(day);
}

/**
 * Build the investment window from MetricFilter. A relative range is the N full
 * UTC days that end yesterday (inclusive): today's partial day is never read,
 * matching the server's endExclusive = min(end+1, today). Explicit dates pass
 * through, except an end later than yesterday is clamped to yesterday and a
 * start then after it is clamped to that end. Every investment reader (chart
 * and explain) uses this one.
 */
export function buildDateRange(filters: MetricFilter): {
    startDate: string;
    endDate: string;
} {
    const { start_date, end_date, range_days } = filters.time;

    const now = Date.now();
    const todayStart = now - (now % DAY_MS);
    const yesterday = new Date(todayStart - DAY_MS).toISOString().split("T")[0];

    if (start_date && end_date) {
        // URL params reach here unvalidated and may carry a time part: compare the date part.
        const endDay = end_date.slice(0, 10);
        if (!isCalendarDay(endDay) || endDay <= yesterday) {
            return { startDate: start_date, endDate: end_date };
        }
        const startDay = start_date.slice(0, 10);
        return {
            startDate: isCalendarDay(startDay) && startDay > yesterday ? yesterday : start_date,
            endDate: yesterday,
        };
    }

    const endDate = new Date(todayStart - DAY_MS);
    const startDate = new Date(endDate.getTime() - (range_days - 1) * DAY_MS);

    return {
        startDate: startDate.toISOString().split("T")[0],
        endDate: yesterday,
    };
}

/**
 * Translate internal MetricFilter to GraphQL FilterInput.
 *
 * Exported for reuse by other GraphQL fetchers (e.g. improveFetchers).
 * Key invariant: MetricFilter scope.level is lowercase ("org", "team") while
 * the GraphQL ScopeLevelInput enum is uppercase ("ORG", "TEAM") — this
 * function normalises the case via .toUpperCase().
 */
export function translateMetricFilterToGraphQL(filters: MetricFilter): FilterInput {
    return {
        scope: {
            level: filters.scope.level.toUpperCase() as ScopeLevelInput,
            ids: filters.scope.ids,
        },
        who: filters.who.developers?.length ? { developers: filters.who.developers } : undefined,
        what: filters.what.repos?.length ? { repos: filters.what.repos } : undefined,
        why: filters.why.work_category?.length
            ? { workCategory: filters.why.work_category }
            : undefined,
    };
}

/**
 * Fetch investment breakdown (theme/subcategory distributions) via GraphQL.
 *
 * Returns data in the same shape as the REST /api/v1/investment endpoint.
 */
export async function getInvestmentViaGraphQL(
    filters: MetricFilter,
    contextOrgId?: string,
): Promise<InvestmentResponse> {
    const orgId = getOrgId(filters, contextOrgId);
    const dateRange = buildDateRange(filters);

    const batch: AnalyticsRequestInput = {
        breakdowns: [
            {
                dimension: "THEME" as DimensionInput,
                measure: "ISSUE_SIZE" as MeasureInput,
                dateRange,
                topN: 50,
            },
            {
                dimension: "SUBCATEGORY" as DimensionInput,
                measure: "ISSUE_SIZE" as MeasureInput,
                dateRange,
                topN: 100,
            },
        ],
        useInvestment: true,
        filters: translateMetricFilterToGraphQL(filters),
    };

    const response = await graphqlFetch<AnalyticsQueryResponse>(
        INVESTMENT_BREAKDOWN_QUERY,
        { orgId, batch },
        { orgId },
    );

    // Convert breakdowns to the expected shape
    const themeBreakdown = response.analytics.breakdowns.find(
        (b) => b.dimension.toLowerCase() === "theme",
    );
    const subcategoryBreakdown = response.analytics.breakdowns.find(
        (b) => b.dimension.toLowerCase() === "subcategory",
    );

    const theme_distribution: Record<string, number> = {};
    const subcategory_distribution: Record<string, number> = {};

    if (themeBreakdown) {
        for (const item of themeBreakdown.items) {
            theme_distribution[item.key] = item.value;
        }
    }

    if (subcategoryBreakdown) {
        for (const item of subcategoryBreakdown.items) {
            subcategory_distribution[item.key] = item.value;
        }
    }

    return {
        theme_distribution,
        subcategory_distribution,
        unit: "issue_size",
    };
}

/**
 * Adapt GraphQL SankeyResult to REST SankeyResponse shape.
 */
export function adaptSankeyResult(
    graphqlSankey: SankeyResult | undefined,
    mode: string,
): SankeyResponse {
    if (!graphqlSankey) {
        return {
            mode: mode as SankeyResponse["mode"],
            nodes: [],
            links: [],
        };
    }

    // Only a work-unit count or an issue size is an investment value. A flow served in any other
    // unit (lines of code, hours) is never drawn: it becomes the empty, no-data flow.
    if (
        graphqlSankey.unit !== undefined &&
        graphqlSankey.unit !== "WORK_UNITS" &&
        graphqlSankey.unit !== "ISSUE_SIZE"
    ) {
        console.debug("[investment] flow dropped: served unit is not a work-unit count", {
            unitClass: graphqlSankey.unit,
            mode,
            nodes: graphqlSankey.nodes.length,
        });
        return { mode: mode as SankeyResponse["mode"], nodes: [], links: [] };
    }

    // Map GraphQL nodes to REST shape
    const nodes: SankeyNode[] = graphqlSankey.nodes.map((n) => {
        // Map GraphQL dimensions to lowercase groups expected by the UI
        let group = n.dimension.toLowerCase();
        if (n.dimension === "TEAM") {
            group = "team";
        } else if (n.dimension === "THEME") {
            group = "category";
        } else if (n.dimension === "SUBCATEGORY") {
            group = "subcategory";
        } else if (n.dimension === "REPO") {
            group = "repo";
        }

        let name = n.label || `(Unassigned ${group})`;
        // Strip prefixes if present (e.g. from backend ID formatting leaks)
        name = name.replace(/^(TEAM|REPO|THEME|SUBCATEGORY):\s*/i, "");
        if (group === "subcategory") {
            name = formatSubcategoryLabel(name, false);
        }

        return {
            id: n.id,
            name,
            group,
            value: n.value,
        };
    });

    const nodeNameById = new Map(nodes.map((node) => [node.id ?? node.name, node.name]));

    const normalizeEdgeRef = (ref: string) =>
        ref.replace(/^(TEAM|REPO|THEME|SUBCATEGORY):\s*/i, "");

    // Map GraphQL edges to REST links (source/target should match node names)
    const links: SankeyLink[] = graphqlSankey.edges.map((e) => ({
        source: nodeNameById.get(e.source) ?? normalizeEdgeRef(e.source),
        target: nodeNameById.get(e.target) ?? normalizeEdgeRef(e.target),
        value: e.value,
    }));

    // Missing is not zero: the backend degrades coverage to null when its
    // coverage query fails. Keep only leaves it actually produced (a finite
    // number, including 0); never coerce null/NaN to 0.
    const teamCoverage = graphqlSankey.coverage?.teamCoverage;
    const repoCoverage = graphqlSankey.coverage?.repoCoverage;
    const producedTeam = typeof teamCoverage === "number" && Number.isFinite(teamCoverage);
    const producedRepo = typeof repoCoverage === "number" && Number.isFinite(repoCoverage);
    const sizingCoverage = graphqlSankey.coverage?.sizingCoverage;
    const unsizedUnitCount = graphqlSankey.coverage?.unsizedUnitCount;
    const producedSizing = typeof sizingCoverage === "number" && Number.isFinite(sizingCoverage);
    const producedUnsized =
        typeof unsizedUnitCount === "number" && Number.isFinite(unsizedUnitCount);
    const coverage: SankeyResponse["coverage"] | undefined =
        producedTeam || producedRepo || producedSizing || producedUnsized
            ? {
                  ...(producedTeam && { team: teamCoverage }),
                  ...(producedRepo && { repo: repoCoverage }),
                  ...(producedSizing && { sizing: sizingCoverage }),
                  ...(producedUnsized && { unsized_units: unsizedUnitCount }),
              }
            : undefined;

    return {
        mode: mode as SankeyResponse["mode"],
        nodes,
        links,
        ...(coverage !== undefined && { coverage }),
        ...(graphqlSankey.unit !== undefined && { unit: graphqlSankey.unit }),
    };
}
