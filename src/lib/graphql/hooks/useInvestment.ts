import { useQuery } from "urql";
import { useMemo } from "react";
import { INVESTMENT_BREAKDOWN_QUERY, INVESTMENT_FULL_QUERY } from "../queries";
import type { MetricFilter } from "@/lib/filters/types";
import type { InvestmentResponse, SankeyResponse } from "@/lib/types";
import {
  AnalyticsQueryResponse,
  AnalyticsRequestInput,
  DimensionInput,
  FilterInput,
  MeasureInput,
  ScopeLevelInput,
} from "../types";
import { adaptSankeyResult } from "../investmentFetchers";
import { useOrgId } from "../provider";

function getOrgId(filters: MetricFilter, contextOrgId?: string): string {
  if (filters.scope.level === "org" && filters.scope.ids.length > 0) {
    return filters.scope.ids[0];
  }
  if (contextOrgId) {
    return contextOrgId;
  }
  throw new Error("org_id is required: not found in filters or GraphQL context");
}

function buildDateRange(filters: MetricFilter): { startDate: string; endDate: string } {
  const { start_date, end_date, range_days } = filters.time;
  if (start_date && end_date) {
    return { startDate: start_date, endDate: end_date };
  }
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - range_days * 24 * 60 * 60 * 1000);
  return {
    startDate: startDate.toISOString().split("T")[0],
    endDate: endDate.toISOString().split("T")[0],
  };
}

function translateFilters(filters: MetricFilter): FilterInput {
  return {
    scope: {
      level: filters.scope.level.toUpperCase() as ScopeLevelInput,
      ids: filters.scope.ids,
    },
    who: filters.who.developers?.length ? { developers: filters.who.developers } : undefined,
    what: filters.what.repos?.length ? { repos: filters.what.repos } : undefined,
    why: (filters.why.work_category?.length || filters.why.issue_type?.length) ? {
      workCategory: filters.why.work_category,
      issueType: filters.why.issue_type,
    } : undefined,
    how: filters.how.flow_stage?.length ? { flowStage: filters.how.flow_stage } : undefined,
  };
}

interface UseInvestmentMixOptions {
  filters: MetricFilter;
  pause?: boolean;
}

interface UseInvestmentMixResult {
  data: InvestmentResponse | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useInvestmentMix(options: UseInvestmentMixOptions): UseInvestmentMixResult {
  const { filters, pause = false } = options;
  const contextOrgId = useOrgId();

  const variables = useMemo(() => {
    const orgId = getOrgId(filters, contextOrgId);
    const dateRange = buildDateRange(filters);
    const batch: AnalyticsRequestInput = {
      breakdowns: [
        { dimension: "THEME" as DimensionInput, measure: "COUNT" as MeasureInput, dateRange, topN: 50 },
        { dimension: "SUBCATEGORY" as DimensionInput, measure: "COUNT" as MeasureInput, dateRange, topN: 100 },
      ],
      useInvestment: true,
      filters: translateFilters(filters),
    };
    return { orgId, batch };
  }, [filters, contextOrgId]);

  const [result, reexecute] = useQuery<AnalyticsQueryResponse>({
    query: INVESTMENT_BREAKDOWN_QUERY,
    variables,
    pause,
  });

  const data = useMemo<InvestmentResponse | null>(() => {
    if (!result.data?.analytics) return null;

    const themeBreakdown = result.data.analytics.breakdowns.find(
      (b) => b.dimension.toLowerCase() === "theme"
    );
    const subcategoryBreakdown = result.data.analytics.breakdowns.find(
      (b) => b.dimension.toLowerCase() === "subcategory"
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

    return { theme_distribution, subcategory_distribution, unit: "delivery_units" };
  }, [result.data]);

  return {
    data,
    loading: result.fetching,
    error: result.error ?? null,
    refetch: reexecute,
  };
}

type FlowMode = "team_category_repo" | "team_subcategory_repo" | "team_category_subcategory_repo";

interface UseInvestmentFlowOptions {
  filters: MetricFilter;
  flowMode?: FlowMode;
  theme?: string | null;
  topNRepos?: number;
  pause?: boolean;
}

interface UseInvestmentFlowResult {
  data: SankeyResponse | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useInvestmentFlow(options: UseInvestmentFlowOptions): UseInvestmentFlowResult {
  const { filters, flowMode = "team_category_repo", theme = null, pause = false } = options;
  const contextOrgId = useOrgId();

  const variables = useMemo(() => {
    const orgId = getOrgId(filters, contextOrgId);
    const dateRange = buildDateRange(filters);
    const graphqlFilters = translateFilters(filters);

    if (theme) {
      graphqlFilters.why = { ...(graphqlFilters.why ?? {}), workCategory: [theme] };
    }

    let path: DimensionInput[] = ["TEAM", "THEME", "REPO"];
    if (flowMode === "team_category_subcategory_repo") {
      path = ["TEAM", "THEME", "SUBCATEGORY", "REPO"];
    }

    const batch: AnalyticsRequestInput = {
      sankey: {
        path,
        measure: "COUNT" as MeasureInput,
        dateRange,
        maxNodes: 50,
        maxEdges: 200,
        useInvestment: true,
      },
      useInvestment: true,
      filters: graphqlFilters,
    };
    return { orgId, batch };
  }, [filters, flowMode, theme, contextOrgId]);

  const [result, reexecute] = useQuery<AnalyticsQueryResponse>({
    query: INVESTMENT_FULL_QUERY,
    variables,
    pause,
  });

  const data = useMemo<SankeyResponse | null>(() => {
    if (!result.data?.analytics?.sankey) return null;
    return adaptSankeyResult(result.data.analytics.sankey, "investment");
  }, [result.data]);

  return {
    data,
    loading: result.fetching,
    error: result.error ?? null,
    refetch: reexecute,
  };
}

interface UseInvestmentRepoTeamFlowOptions {
  filters: MetricFilter;
  theme?: string | null;
  pause?: boolean;
}

export function useInvestmentRepoTeamFlow(options: UseInvestmentRepoTeamFlowOptions): UseInvestmentFlowResult {
  const { filters, theme = null, pause = false } = options;
  const contextOrgId = useOrgId();

  const variables = useMemo(() => {
    const orgId = getOrgId(filters, contextOrgId);
    const dateRange = buildDateRange(filters);
    const graphqlFilters = translateFilters(filters);

    if (theme) {
      graphqlFilters.why = { ...(graphqlFilters.why ?? {}), workCategory: [theme] };
    }

    const batch: AnalyticsRequestInput = {
      sankey: {
        path: ["SUBCATEGORY", "REPO", "TEAM"] as DimensionInput[],
        measure: "COUNT" as MeasureInput,
        dateRange,
        maxNodes: 50,
        maxEdges: 200,
        useInvestment: true,
      },
      useInvestment: true,
      filters: graphqlFilters,
    };
    return { orgId, batch };
  }, [filters, theme, contextOrgId]);

  const [result, reexecute] = useQuery<AnalyticsQueryResponse>({
    query: INVESTMENT_FULL_QUERY,
    variables,
    pause,
  });

  const data = useMemo<SankeyResponse | null>(() => {
    if (!result.data?.analytics?.sankey) return null;
    return adaptSankeyResult(result.data.analytics.sankey, "investment");
  }, [result.data]);

  return {
    data,
    loading: result.fetching,
    error: result.error ?? null,
    refetch: reexecute,
  };
}
