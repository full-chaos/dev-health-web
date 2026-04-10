/**
 * urql GraphQL client configuration for dev-health-web.
 *
 * Single GraphQL client for all data fetching — both React hooks (via
 * useQuery/useSubscription) and imperative fetches (via graphqlFetch).
 *
 * Replaces the dual-client setup (urqlClient + fetch-based client.ts):
 *  - React components use urql hooks as before.
 *  - Server actions / non-hook code use graphqlFetch() from this module.
 */

import {
  createClient,
  fetchExchange,
  cacheExchange,
  mapExchange,
  type Client,
  type TypedDocumentNode,
} from "@urql/core";
import { resolveOrigin } from "@/lib/origin";
import { isServer } from "@/lib/env";
import { runtimeConfig } from "@/lib/runtimeConfig";
import { errorExchange, timingExchange } from "./urqlExchanges";
import type { GraphQLResponse } from "./types";

const GRAPHQL_PATH = "/graphql";

export interface UrqlClientOptions {
  orgId?: string;
}

/**
 * Create a urql client instance.
 *
 * @param options - Client configuration options
 * @returns Configured urql client
 */
export function createUrqlClient(options: UrqlClientOptions = {}): Client {
  const { orgId } = options;

  const url = new URL(GRAPHQL_PATH, resolveOrigin());

  // Add org_id as query param for compatibility
  if (orgId) {
    url.searchParams.set("org_id", orgId);
  }

  return createClient({
    url: url.toString(),
    exchanges: [
      // Org-header injection (must be first to affect outgoing operations).
      mapExchange({
        onOperation(operation) {
          if (!orgId) return operation;

          const fetchOptions =
            typeof operation.context.fetchOptions === "object"
              ? operation.context.fetchOptions
              : {};

          return {
            ...operation,
            context: {
              ...operation.context,
              fetchOptions: {
                ...fetchOptions,
                headers: {
                  ...((fetchOptions.headers ?? {}) as Record<string, string>),
                  "X-Org-Id": orgId,
                },
              },
            },
          };
        },
      }),
      // Observability exchanges — capture errors and measure timing.
      timingExchange,
      errorExchange,
      cacheExchange,
      fetchExchange,
    ],
    requestPolicy: "cache-and-network",
  });
}

// Singleton client instance for app-wide use
let _client: Client | null = null;
let _currentOrgId: string | undefined;

/**
 * Get or create the shared urql client instance.
 *
 * @param orgId - Optional org ID for scoping requests
 * @returns urql client instance
 */
export function getUrqlClient(orgId?: string): Client {
  // Recreate client if org changes
  if (_client && orgId !== _currentOrgId) {
    _client = null;
  }

  if (!_client) {
    _client = createUrqlClient({ orgId });
    _currentOrgId = orgId;
  }

  return _client;
}

/**
 * Reset the shared client (useful for testing or org switching).
 */
export function resetUrqlClient(): void {
  _client = null;
  _currentOrgId = undefined;
}

// ============================================================================
// Imperative GraphQL fetch — replaces the fetch-based graphqlClient
// ============================================================================

interface GraphQLFetchOptions {
  orgId?: string;
}

/**
 * Execute a GraphQL query imperatively (no React required).
 *
 * Suitable for use in Server Actions, API routes, and non-component code.
 * Uses the shared urql client under the hood so both hooks and imperative
 * calls share caching and error handling infrastructure.
 *
 * @param query  - GraphQL query string or TypedDocumentNode
 * @param variables - Query variables
 * @param options - Optional org ID and other options
 * @returns The typed query result data
 * @throws Error if the query returns GraphQL errors or missing data
 */
export async function graphqlFetch<T>(
  query: string | TypedDocumentNode<T, Record<string, unknown>>,
  variables: Record<string, unknown> = {},
  options: GraphQLFetchOptions = {}
): Promise<T> {
  const client = getUrqlClient(options.orgId);

  const authHeaders: Record<string, string> = {};
  if (isServer) {
    try {
      const { auth } = await import("@/lib/auth");
      const session = await auth();
      if (session?.access_token) {
        authHeaders["Authorization"] = `Bearer ${session.access_token}`;
      }
    } catch {}
  }

  const result = await client
    .query<T>(query, variables, {
      requestPolicy: "network-only",
      fetchOptions: { headers: authHeaders },
    })
    .toPromise();

  if (result.error) {
    throw new Error(`GraphQL error: ${result.error.message}`);
  }

  if (!result.data) {
    throw new Error("GraphQL response missing data");
  }

  return result.data;
}

// ============================================================================
// Legacy graphqlClient shim — keep callers working during transition
// ============================================================================

/**
 * @deprecated Use graphqlFetch() directly. This shim will be removed once all
 * callers in investmentFetchers and capacityFetchers are updated.
 */
export const graphqlClient = {
  query: async <T>(
    query: string,
    variables: Record<string, unknown>,
    options: GraphQLFetchOptions = {}
  ): Promise<T> => graphqlFetch<T>(query, variables, options),

  isEnabled: (): boolean => {
    return runtimeConfig.useGraphQLAnalytics();
  },

  /** @deprecated use graphqlFetch */
  request: async <T>(
    query: string,
    variables: Record<string, unknown>,
    options: GraphQLFetchOptions = {}
  ): Promise<GraphQLResponse<T>> => {
    const data = await graphqlFetch<T>(query, variables, options);
    return { data };
  },
};
