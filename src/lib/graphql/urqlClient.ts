/**
 * urql GraphQL client configuration for dev-health-web.
 *
 * Provides a normalized cache, automatic request deduplication,
 * and TypeScript-first GraphQL operations.
 */

import {
  createClient,
  fetchExchange,
  cacheExchange,
  mapExchange,
  type Client,
} from "@urql/core";
import { resolveOrigin } from "@/lib/origin";

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
