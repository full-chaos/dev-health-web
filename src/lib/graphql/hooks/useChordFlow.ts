import { useMemo } from "react";
import { useQuery } from "urql";

import type { ChordGroupingDimension, ChordRecord } from "@/lib/types";

import { adaptSankeyToChord } from "../chordAdapter";
import { INVESTMENT_FULL_QUERY } from "../queries";
import type { AnalyticsQueryResponse, AnalyticsRequestInput, DimensionInput, MeasureInput } from "../types";

type UseChordFlowArgs = {
  orgId: string;
  grouping: ChordGroupingDimension;
  dateRange: { startDate: string; endDate: string };
  measure?: string;
  pause?: boolean;
};

type UseChordFlowResult = {
  data: ChordRecord[] | null;
  fetching: boolean;
  error: unknown;
};

const GROUPING_TO_DIMENSION: Record<ChordGroupingDimension, DimensionInput> = {
  team: "TEAM",
  repo: "REPO",
  work_type: "WORK_TYPE",
};

const FALLBACK_BRIDGE_DIMENSION: Record<ChordGroupingDimension, DimensionInput> = {
  team: "REPO",
  repo: "TEAM",
  work_type: "REPO",
};

function toSameDimensionSankey(
  sankey: NonNullable<AnalyticsQueryResponse["analytics"]["sankey"]>,
  grouping: ChordGroupingDimension
) {
  const primaryDimension = GROUPING_TO_DIMENSION[grouping];
  const bridgeDimension = FALLBACK_BRIDGE_DIMENSION[grouping];
  const primaryNodes = sankey.nodes.filter((node) => node.dimension.toUpperCase() === primaryDimension);
  const bridgeNodeIds = new Set(
    sankey.nodes
      .filter((node) => node.dimension.toUpperCase() === bridgeDimension)
      .map((node) => node.id)
  );

  const weightsByBridge = new Map<string, Array<{ nodeId: string; value: number }>>();

  for (const edge of sankey.edges) {
    const isPrimaryToBridge = bridgeNodeIds.has(edge.target);
    const isBridgeToPrimary = bridgeNodeIds.has(edge.source);

    if (isPrimaryToBridge) {
      const existing = weightsByBridge.get(edge.target) ?? [];
      existing.push({ nodeId: edge.source, value: edge.value });
      weightsByBridge.set(edge.target, existing);
      continue;
    }

    if (isBridgeToPrimary) {
      const existing = weightsByBridge.get(edge.source) ?? [];
      existing.push({ nodeId: edge.target, value: edge.value });
      weightsByBridge.set(edge.source, existing);
    }
  }

  const edgeTotals = new Map<string, number>();

  for (const weights of weightsByBridge.values()) {
    for (const source of weights) {
      for (const target of weights) {
        const key = `${source.nodeId}→${target.nodeId}`;
        edgeTotals.set(key, (edgeTotals.get(key) ?? 0) + source.value * target.value);
      }
    }
  }

  return {
    nodes: primaryNodes,
    edges: Array.from(edgeTotals.entries()).map(([key, value]) => {
      const [source, target] = key.split("→");
      return { source, target, value };
    }),
  };
}

/**
 * Fetch chord flow records derived from GraphQL `analytics.sankey` data.
 */
export function useChordFlow(args: UseChordFlowArgs): UseChordFlowResult {
  const { orgId, grouping, dateRange, measure = "THROUGHPUT", pause = false } = args;

  const variables = useMemo(() => {
    const dimension = GROUPING_TO_DIMENSION[grouping];
    const batch: AnalyticsRequestInput = {
      sankey: {
        path: [dimension, FALLBACK_BRIDGE_DIMENSION[grouping]],
        measure: measure as MeasureInput,
        dateRange,
        maxNodes: 50,
        maxEdges: 200,
        useInvestment: true,
      },
      useInvestment: true,
    };

    return { orgId, batch };
  }, [dateRange, grouping, measure, orgId]);

  const [result] = useQuery<AnalyticsQueryResponse>({
    query: INVESTMENT_FULL_QUERY,
    variables,
    pause,
    requestPolicy: "cache-and-network",
  });

  const data = useMemo<ChordRecord[] | null>(() => {
    if (result.fetching || result.error || !result.data?.analytics?.sankey) {
      return null;
    }

    return adaptSankeyToChord(toSameDimensionSankey(result.data.analytics.sankey, grouping), grouping);
  }, [grouping, result.data, result.error, result.fetching]);

  return {
    data,
    fetching: result.fetching,
    error: result.error,
  };
}
