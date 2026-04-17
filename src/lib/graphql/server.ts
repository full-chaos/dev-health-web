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
 *
 * NOTE: `import "server-only"` is intentionally omitted. The existing
 * `@/lib/api` and `@/lib/graphql/client` shims are imported by a handful of
 * client components (FlowView, FlameView, HeatmapPanel, EvidencePanel,
 * useInvestmentData). Those client paths never execute `graphqlFetch` at
 * runtime (`api.ts` gates the GraphQL branch with `graphqlClient.isEnabled()`
 * and dynamic-imports `@/lib/auth` only on the server path), but a
 * `"server-only"` assertion would block Turbopack's static analysis and fail
 * the build. CHAOS-1219 (api.ts split) will draw the module boundary cleanly;
 * this guard can be reintroduced then.
 */

import {
  createClient,
  fetchExchange,
  cacheExchange,
  ssrExchange as createSsrExchange,
  type Client,
  type SSRData,
  type TypedDocumentNode,
} from "@urql/core";
import { registerUrql } from "@urql/next/rsc";
import { ValidationErrors, graphQlErrorMessage } from "@/lib/constants/errors";
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
  void _orgId;
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
    throw new Error(graphQlErrorMessage(result.error.message));
  }

  if (!result.data) {
    throw new Error(ValidationErrors.GraphQLResponseMissingData);
  }

  return result.data;
}

/**
 * Server-side GraphQL fetch that also returns a hydration payload (CHAOS-1276
 * Phase C). The caller renders `<HydrateUrqlResults payload={payload}>` on a
 * client boundary; the payload seeds the browser `ssrExchange` cache so a
 * subsequent client-side `useQuery` with the SAME query and EXACTLY the same
 * variables resolves synchronously from cache — no second network request.
 *
 * Uses a per-call client with its own `ssrExchange({ isClient: false })` so
 * the extracted payload contains ONLY this operation's result, never leaking
 * other concurrent requests' data.
 *
 * Variable parity is the caller's responsibility: if server variables differ
 * from client variables (e.g. sort order, numeric coercion), the urql cache
 * key differs and hydration silently misses.
 */
export async function graphqlFetchForHydration<T>(
  query: string | TypedDocumentNode<T, Record<string, unknown>>,
  variables: Record<string, unknown> = {},
  options: GraphQLFetchOptions = {}
): Promise<{ data: T; hydrationPayload: SSRData }> {
  const ssr = createSsrExchange({ isClient: false });

  const url = new URL(GRAPHQL_PATH, resolveOrigin());

  const headers: Record<string, string> = {};
  if (options.orgId) headers["X-Org-Id"] = options.orgId;

  try {
    const { auth } = await import("@/lib/auth");
    const session = await auth();
    if (session?.access_token) {
      headers["Authorization"] = `Bearer ${session.access_token}`;
    }
  } catch {
    // Unauthenticated fetch (codegen / tests / unauthenticated pages).
  }

  const client = createClient({
    url: url.toString(),
    exchanges: [timingExchange, errorExchange, cacheExchange, ssr, fetchExchange],
    requestPolicy: "cache-first",
  });

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
    throw new Error(graphQlErrorMessage(result.error.message));
  }

  if (!result.data) {
    throw new Error(ValidationErrors.GraphQLResponseMissingData);
  }

  return { data: result.data, hydrationPayload: ssr.extractData() };
}
