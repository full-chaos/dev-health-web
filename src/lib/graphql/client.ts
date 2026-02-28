/**
 * GraphQL client — legacy compatibility shim.
 *
 * All exports here now delegate to the single urql-based client in
 * urqlClient.ts. This file is kept so existing imports continue to work
 * during migration.
 *
 * @deprecated Import from "@/lib/graphql/urqlClient" directly.
 */

export {
  graphqlClient,
  graphqlFetch as graphqlQuery,
  graphqlFetch as graphqlRequest,
} from "./urqlClient";

import { runtimeConfig } from "@/lib/runtimeConfig";

/** @deprecated Use the urql client directly. */
export function isGraphQLEnabled(): boolean {
  return runtimeConfig.useGraphQLAnalytics();
}
