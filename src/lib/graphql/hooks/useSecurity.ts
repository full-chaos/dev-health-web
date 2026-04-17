import { useCallback, useState } from "react";
import { useQuery } from "urql";

import { SECURITY_OVERVIEW_QUERY, SECURITY_ALERTS_QUERY } from "../queries";
import { useOrgId } from "../provider";
import type {
  SecurityAlertConnection,
  SecurityAlertFilterInput,
  SecurityOverview,
  SecurityPaginationInput,
} from "../__generated__/types";
import type { SecurityFilter } from "@/lib/filters/security";

/** Translate a lowercase SecurityFilter into the GraphQL SecurityAlertFilterInput.
 *  The GraphQL enum values are UPPERCASE; the SecurityFilter uses lowercase strings.
 */
function toGraphQLFilter(f: SecurityFilter): SecurityAlertFilterInput {
  return {
    repoIds: f.repoIds ?? null,
    severities: f.severities
      ? (f.severities.map((s) => s.toUpperCase()) as SecurityAlertFilterInput["severities"])
      : null,
    sources: f.sources
      ? (f.sources.map((s) => s.toUpperCase()) as SecurityAlertFilterInput["sources"])
      : null,
    states: f.states
      ? (f.states.map((s) => s.toUpperCase()) as SecurityAlertFilterInput["states"])
      : null,
    since: f.since ?? null,
    until: f.until ?? null,
    openOnly: f.openOnly ?? false,
    search: f.search ?? null,
  };
}

// ---------------------------------------------------------------------------
// useSecurityOverview
// ---------------------------------------------------------------------------

interface UseSecurityOverviewResult {
  data: { securityOverview: SecurityOverview } | undefined;
  fetching: boolean;
  error: Error | undefined;
}

export function useSecurityOverview(filter: SecurityFilter): UseSecurityOverviewResult {
  const orgId = useOrgId();
  const filters = toGraphQLFilter(filter);

  const [result] = useQuery<{ securityOverview: SecurityOverview }>({
    query: SECURITY_OVERVIEW_QUERY,
    variables: { orgId: orgId ?? "", filters },
    pause: !orgId,
    requestPolicy: "cache-and-network",
  });

  return {
    data: result.data,
    fetching: result.fetching,
    error: result.error,
  };
}

// ---------------------------------------------------------------------------
// useSecurityAlerts
// ---------------------------------------------------------------------------

interface UseSecurityAlertsOptions {
  first?: number;
  after?: string;
}

interface UseSecurityAlertsResult {
  data: { securityAlerts: SecurityAlertConnection } | undefined;
  fetching: boolean;
  error: Error | undefined;
  fetchMore: (after: string) => void;
  allEdges: SecurityAlertConnection["edges"];
}

export function useSecurityAlerts(
  filter: SecurityFilter,
  pagination?: UseSecurityAlertsOptions
): UseSecurityAlertsResult {
  const orgId = useOrgId();
  const filters = toGraphQLFilter(filter);

  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [accumulatedEdges, setAccumulatedEdges] = useState<
    SecurityAlertConnection["edges"]
  >([]);

  const paginationInput: SecurityPaginationInput = {
    first: pagination?.first ?? 50,
    after: cursor ?? null,
  };

  const [result, reexecute] = useQuery<{ securityAlerts: SecurityAlertConnection }>({
    query: SECURITY_ALERTS_QUERY,
    variables: { orgId: orgId ?? "", filters, pagination: paginationInput },
    pause: !orgId,
    requestPolicy: "cache-and-network",
  });

  // Merge new edges into accumulated list when data changes
  const currentEdges = result.data?.securityAlerts?.edges ?? [];

  const fetchMore = useCallback(
    (after: string) => {
      // Accumulate existing edges before fetching next page
      setAccumulatedEdges((prev) => {
        const existingIds = new Set(prev.map((e) => e.cursor));
        const newEdges = (result.data?.securityAlerts?.edges ?? []).filter(
          (e) => !existingIds.has(e.cursor)
        );
        return [...prev, ...newEdges];
      });
      setCursor(after);
      reexecute({ requestPolicy: "network-only" });
    },
    [result.data, reexecute]
  );

  // When cursor is set, allEdges = accumulated + current page
  // When cursor is not set (first page), allEdges = current page
  const allEdges =
    cursor !== undefined
      ? [
          ...accumulatedEdges,
          ...currentEdges.filter(
            (e) => !accumulatedEdges.some((a) => a.cursor === e.cursor)
          ),
        ]
      : currentEdges;

  return {
    data: result.data,
    fetching: result.fetching,
    error: result.error,
    fetchMore,
    allEdges,
  };
}
