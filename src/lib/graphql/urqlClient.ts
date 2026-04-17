/**
 * urql GraphQL client — browser/provider-side.
 *
 * Since CHAOS-1217 Phase A this module is focused on the BROWSER client used
 * by `<GraphQLProvider>` and `useQuery`-style hooks. Server-side (RSC) use
 * lives in `./server.ts`, which uses `registerUrql` + `react.cache` for
 * per-request isolation.
 *
 * Public API:
 *   - `createUrqlClient`    — browser client factory (used by provider.tsx).
 *   - `getUrqlClient`       — browser singleton getter.
 *   - `resetUrqlClient`     — resets the browser singleton (testing / org switch).
 *   - `graphqlFetch`        — re-exported from `./server` (server-only).
 */

import {
  createClient,
  fetchExchange,
  cacheExchange,
  mapExchange,
  type Client,
} from "@urql/core";
import { resolveOrigin } from "@/lib/origin";
import { errorExchange, timingExchange } from "./urqlExchanges";
import { graphqlFetch } from "./server";

const GRAPHQL_PATH = "/graphql";

export interface UrqlClientOptions {
  orgId?: string;
}

/**
 * Create a urql client instance for browser/provider use.
 *
 * @param options - Client configuration options
 * @returns Configured urql client
 */
export function createUrqlClient(options: UrqlClientOptions = {}): Client {
  const { orgId } = options;

  const url = new URL(GRAPHQL_PATH, resolveOrigin());

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
      timingExchange,
      errorExchange,
      cacheExchange,
      fetchExchange,
    ],
    requestPolicy: "cache-and-network",
  });
}

let _client: Client | null = null;
let _currentOrgId: string | undefined;

/**
 * Get or create the shared browser urql client instance.
 *
 * This singleton is safe in the browser (one client per tab). On the server,
 * use `getServerClient` from `./server.ts` for per-request isolation.
 */
export function getUrqlClient(orgId?: string): Client {
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
 * Reset the shared browser client (useful for testing or org switching).
 */
export function resetUrqlClient(): void {
  _client = null;
  _currentOrgId = undefined;
}

export { graphqlFetch };
