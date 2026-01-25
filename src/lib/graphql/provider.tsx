"use client";

/**
 * urql Provider component for React applications.
 *
 * Provides the urql client to child components via React context.
 */

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { Provider as UrqlProvider } from "urql";
import { createUrqlClient } from "./urqlClient";

interface GraphQLProviderProps {
  children: ReactNode;
  orgId?: string;
}

const OrgIdContext = createContext<string | undefined>(undefined);

/**
 * GraphQL Provider that configures urql client with org scoping.
 *
 * Wrap your application or page with this provider to enable
 * GraphQL queries via urql hooks.
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
  const client = useMemo(() => createUrqlClient({ orgId }), [orgId]);

  return (
    <OrgIdContext.Provider value={orgId}>
      <UrqlProvider value={client}>{children}</UrqlProvider>
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
