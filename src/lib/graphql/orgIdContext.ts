"use client";

import { createContext, useContext } from "react";

/**
 * The session's organization id, as the app layout's `GraphQLProvider` holds it. Its own module,
 * without urql, so a component that needs only the id (Ask Dev page context, CHAOS-11938) does not
 * load the GraphQL client.
 */
export const OrgIdContext = createContext<string | undefined>(undefined);

/** Hook to access the current org ID from the GraphQL provider. */
export function useOrgId(): string | undefined {
    return useContext(OrgIdContext);
}
