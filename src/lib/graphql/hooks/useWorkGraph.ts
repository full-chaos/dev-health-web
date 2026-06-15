import { useQuery } from "urql";
import { WORK_GRAPH_EDGES_QUERY } from "../queries";
import type {
    WorkGraphEdge,
    WorkGraphEdgeFilterInput,
    WorkGraphEdgesResult,
    PageInfo,
} from "../types";

interface UseWorkGraphEdgesOptions {
    orgId: string;
    filters?: WorkGraphEdgeFilterInput;
    pause?: boolean;
}

interface UseWorkGraphEdgesResult {
    edges: WorkGraphEdge[];
    totalCount: number;
    pageInfo: PageInfo | null;
    loading: boolean;
    error: Error | null;
    /**
     * Fail-safe signal from the backend (CHAOS-2431). `"MEMBERSHIP_NOT_MATERIALIZED"`
     * means theme membership data is not yet built for this org; null = OK.
     */
    degradedReason: string | null;
    refetch: () => void;
}

export function useWorkGraphEdges(options: UseWorkGraphEdgesOptions): UseWorkGraphEdgesResult {
    const { orgId, filters, pause = false } = options;

    const [result, reexecute] = useQuery<{ workGraphEdges: WorkGraphEdgesResult }>({
        query: WORK_GRAPH_EDGES_QUERY,
        variables: { orgId, filters },
        pause,
        requestPolicy: "cache-and-network",
    });

    return {
        edges: result.data?.workGraphEdges?.edges ?? [],
        totalCount: result.data?.workGraphEdges?.totalCount ?? 0,
        pageInfo: result.data?.workGraphEdges?.pageInfo ?? null,
        loading: result.fetching,
        error: result.error ?? null,
        degradedReason: result.data?.workGraphEdges?.degradedReason ?? null,
        refetch: reexecute,
    };
}

interface UseNodeEdgesOptions {
    orgId: string;
    nodeId: string;
    nodeType?: WorkGraphEdgeFilterInput["sourceType"];
    limit?: number;
    pause?: boolean;
}

export function useNodeEdges(options: UseNodeEdgesOptions): UseWorkGraphEdgesResult {
    const { orgId, nodeId, limit = 100, pause = false } = options;

    return useWorkGraphEdges({
        orgId,
        filters: { nodeId, limit },
        pause,
    });
}
