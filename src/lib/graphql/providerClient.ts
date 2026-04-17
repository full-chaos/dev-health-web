import {
  fetchExchange,
  cacheExchange,
  mapExchange,
  type SSRExchange,
} from "@urql/core";
import { resolveOrigin } from "@/lib/origin";
import { errorExchange, timingExchange } from "./urqlExchanges";

const GRAPHQL_PATH = "/graphql";

export interface GraphQLClientOptionsArgs {
  orgId?: string;
  ssr: SSRExchange;
}

export function createGraphQLClientOptions({
  orgId,
  ssr,
}: GraphQLClientOptionsArgs) {
  const url = new URL(GRAPHQL_PATH, resolveOrigin());
  if (orgId) url.searchParams.set("org_id", orgId);

  return {
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
    requestPolicy: "cache-first" as const,
    suspense: false,
  };
}
