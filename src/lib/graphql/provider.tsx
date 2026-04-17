"use client";

/**
 * urql Provider component for React applications.
 *
 * Provides the urql client to child components via React context.
 *
 * Since CHAOS-1217 Phase B this provider uses `@urql/next` instead of plain
 * `urql`. `@urql/next` re-exports the entire `urql`/`@urql/core` surface, so
 * downstream `useQuery`/`useSubscription` hooks are unaffected.
 */

import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  UrqlProvider,
  ssrExchange,
  fetchExchange,
  cacheExchange,
  createClient,
  mapExchange,
} from "@urql/next";
import type { SSRExchange } from "@urql/core";
import { resolveOrigin } from "@/lib/origin";
import { errorExchange, timingExchange } from "./urqlExchanges";

const GRAPHQL_PATH = "/graphql";

interface GraphQLProviderProps {
  children: ReactNode;
  orgId?: string;
}

const OrgIdContext = createContext<string | undefined>(undefined);

/**
 * Exposes the client-side `ssrExchange` instance so `HydrateUrqlResults`
 * (or any descendant) can call `restoreData(payload)` to seed the browser
 * cache with data already fetched on the server. See CHAOS-1276 Phase C.
 */
const SsrContext = createContext<SSRExchange | null>(null);

/**
 * GraphQL provider for client components.
 *
 * Wires `@urql/next`'s `UrqlProvider` with an `ssrExchange` instance that
 * will be used in Phase C to restore server-fetched data into the client
 * cache. Until then, `ssrExchange` is present but no RSC results are
 * hydrated, so client queries still trigger their own fetches (same as
 * pre-Phase B).
 *
 * Org scoping: the `orgId` (from the user's session) is injected as an
 * `X-Org-Id` header on every operation via `mapExchange`, and as the
 * `org_id` query param on the GraphQL URL. A change in `orgId` re-creates
 * both the client and the SSR exchange.
 *
 * @example
 * ```tsx
 * <GraphQLProvider orgId="my-org">
 *   <MyComponent />
 * </GraphQLProvider>
 * ```
 */
export function GraphQLProvider({
  children,
  orgId,
}: GraphQLProviderProps): React.ReactNode {
  const [client, ssr] = useMemo(() => {
    const ssr = ssrExchange({
      isClient: typeof window !== "undefined",
    });

    const url = new URL(GRAPHQL_PATH, resolveOrigin());
    if (orgId) url.searchParams.set("org_id", orgId);

    const client = createClient({
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
        ssr,
        fetchExchange,
      ],
      requestPolicy: "cache-and-network",
      suspense: false,
    });

    return [client, ssr] as const;
  }, [orgId]);

  return (
    <OrgIdContext.Provider value={orgId}>
      <SsrContext.Provider value={ssr}>
        <UrqlProvider client={client} ssr={ssr}>
          {children}
        </UrqlProvider>
      </SsrContext.Provider>
    </OrgIdContext.Provider>
  );
}

/**
 * Hook to access the current org ID from the GraphQL provider.
 */
export function useOrgId(): string | undefined {
  return useContext(OrgIdContext);
}

/**
 * Hook to access the client-side `ssrExchange` instance (CHAOS-1276 Phase C).
 *
 * Used by `HydrateUrqlResults` to seed the browser urql cache with a
 * hydration payload extracted on the server, eliminating the RSC→client
 * double-fetch. Returns `null` if called outside a `GraphQLProvider`.
 */
export function useSsr(): SSRExchange | null {
  return useContext(SsrContext);
}

/**
 * HOC to wrap a component with GraphQL provider.
 *
 * @param Component - Component to wrap
 * @param orgId - Org ID for scoping
 * @returns Wrapped component
 */
export function withGraphQL<P extends object>(
  Component: React.ComponentType<P>,
  orgId?: string
): React.FC<P> {
  return function WithGraphQL(props: P) {
    return (
      <GraphQLProvider orgId={orgId}>
        <Component {...props} />
      </GraphQLProvider>
    );
  };
}
