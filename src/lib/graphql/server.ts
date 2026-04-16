/**
 * Server-only urql GraphQL client for React Server Components.
 *
 * Uses `registerUrql` from `@urql/next/rsc`, which wraps the client factory in
 * `react.cache()` so each request gets its own client instance. This closes
 * the module-level singleton hazard in `urqlClient.ts`, which — on a long-
 * lived Node server — could share an urql client (and any cached auth state
 * baked into its closure) across concurrent requests for different users/orgs.
 *
 * Design notes:
 *
 * - `registerUrql` requires a no-arg factory, so the client is not
 *   parameterized on `orgId`. Callers pass `orgId` through `graphqlFetch()`,
 *   which injects `X-Org-Id` as a per-operation header via the operation
 *   context.
 * - Auth is resolved inside `graphqlFetch()` (awaited per-operation) because
 *   urql's client-level `fetchOptions` is synchronous-only and cannot await
 *   `auth()`. Headers are merged into the operation context alongside
 *   `X-Org-Id`.
 * - Default `requestPolicy: "cache-first"` (was `"network-only"` in the old
 *   imperative `graphqlFetch`). Server Components are re-invoked per
 *   request, so there is no stale-data risk beyond the life of one request,
 *   and this change enables RSC → browser cache hydration in a later phase.
 *
 * See `./urqlClient.ts` for the browser/provider-side client. See CHAOS-1217
 * for the full 6-phase SSR hydration plan.
 */

import "server-only";

import {
  createClient,
  fetchExchange,
  cacheExchange,
  type Client,
  type TypedDocumentNode,
} from "@urql/core";
import { registerUrql } from "@urql/next/rsc";
import { resolveOrigin } from "@/lib/origin";
import { errorExchange, timingExchange } from "./urqlExchanges";

const GRAPHQL_PATH = "/graphql";

function makeServerClient(): Client {
  const url = new URL(GRAPHQL_PATH, resolveOrigin());

  return createClient({
    url: url.toString(),
    exchanges: [timingExchange, errorExchange, cacheExchange, fetchExchange],
    requestPolicy: "cache-first",
  });
}

const { getClient: _getServerClient } = registerUrql(makeServerClient);

/**
 * Get the per-request server urql client (isolated via `react.cache`).
 *
 * @param _orgId - Reserved for future per-org client keying. Pass `orgId`
 *   through `graphqlFetch()` today to get per-operation `X-Org-Id` injection.
 */
export function getServerClient(_orgId?: string): Client {
  return _getServerClient();
}

interface GraphQLFetchOptions {
  orgId?: string;
}

/**
 * Execute a GraphQL query from the server (RSC / server action / route handler).
 *
 * Re-exported from `urqlClient.ts` so the 40+ existing imperative callers
 * keep working without changes.
 *
 * @param query - GraphQL query string or TypedDocumentNode
 * @param variables - Query variables
 * @param options.orgId - Optional org scope (injected as `X-Org-Id` header).
 * @returns The typed query result data
 * @throws Error if the query returns GraphQL errors or missing data
 */
export async function graphqlFetch<T>(
  query: string | TypedDocumentNode<T, Record<string, unknown>>,
  variables: Record<string, unknown> = {},
  options: GraphQLFetchOptions = {}
): Promise<T> {
  const client = getServerClient(options.orgId);

  const headers: Record<string, string> = {};
  if (options.orgId) headers["X-Org-Id"] = options.orgId;

  // Auth must be awaited here because urql's client-level fetchOptions is
  // sync-only. Per-operation injection keeps the token fresh and scoped.
  try {
    const { auth } = await import("@/lib/auth");
    const session = await auth();
    if (session?.access_token) {
      headers["Authorization"] = `Bearer ${session.access_token}`;
    }
  } catch {
    // Unauthenticated fetch (codegen / tests / unauthenticated pages):
    // proceed without auth; the backend will reject if it is required.
  }

  const operationContext =
    Object.keys(headers).length > 0 ? { fetchOptions: { headers } } : undefined;

  const isMutation =
    typeof query === "string" && /^\s*mutation\b/i.test(query);

  const result = isMutation
    ? await client
        .mutation<T>(query, variables, operationContext)
        .toPromise()
    : await client.query<T>(query, variables, operationContext).toPromise();

  if (result.error) {
    throw new Error(`GraphQL error: ${result.error.message}`);
  }

  if (!result.data) {
    throw new Error("GraphQL response missing data");
  }

  return result.data;
}
