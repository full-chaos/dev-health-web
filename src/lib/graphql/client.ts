/**
 * GraphQL client wrapper for dev-health-ops analytics API.
 *
 * Lightweight client using fetch - no external dependencies needed.
 * Supports X-Org-Id header and org_id query param for org scoping.
 */

import { runtimeConfig } from "@/lib/runtimeConfig";
import { resolveOrigin } from "@/lib/origin";
import type { GraphQLResponse } from "./types";

const GRAPHQL_PATH = "/graphql";

export interface GraphQLClientOptions {
    orgId?: string;
    headers?: Record<string, string>;
    timeout?: number;
}

/**
 * Execute a GraphQL query against the analytics API.
 *
 * @param query - GraphQL query string
 * @param variables - Query variables
 * @param options - Client options (orgId, headers, timeout)
 * @returns Parsed GraphQL response
 */
export async function graphqlRequest<T>(
    query: string,
    variables: Record<string, unknown> = {},
    options: GraphQLClientOptions = {}
): Promise<GraphQLResponse<T>> {
    const { orgId, headers = {}, timeout = 30000 } = options;

    const url = new URL(GRAPHQL_PATH, resolveOrigin());

    // Add org_id as query param if provided (backend accepts both header and param)
    if (orgId) {
        url.searchParams.set("org_id", orgId);
    }

    const requestHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        ...headers,
    };

    // Also set X-Org-Id header if provided
    if (orgId) {
        requestHeaders["X-Org-Id"] = orgId;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url.toString(), {
            method: "POST",
            headers: requestHeaders,
            body: JSON.stringify({ query, variables }),
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`GraphQL request failed: ${response.status}`);
        }

        const text = await response.text();
        return JSON.parse(text.trim()) as GraphQLResponse<T>;
    } catch (error) {
        clearTimeout(timeoutId);
        throw error;
    }
}

/**
 * Execute a GraphQL query and extract the data, throwing on errors.
 *
 * @param query - GraphQL query string
 * @param variables - Query variables
 * @param options - Client options
 * @returns Query result data
 * @throws Error if the query returns GraphQL errors
 */
export async function graphqlQuery<T>(
    query: string,
    variables: Record<string, unknown> = {},
    options: GraphQLClientOptions = {}
): Promise<T> {
    const response = await graphqlRequest<T>(query, variables, options);

    if (response.errors?.length) {
        const message = response.errors.map((e) => e.message).join("; ");
        throw new Error(`GraphQL error: ${message}`);
    }

    if (!response.data) {
        throw new Error("GraphQL response missing data");
    }

    return response.data;
}

/**
 * Check if GraphQL analytics is enabled via feature flag.
 */
export function isGraphQLEnabled(): boolean {
    return runtimeConfig.useGraphQLAnalytics();
}

export const graphqlClient = {
    request: graphqlRequest,
    query: graphqlQuery,
    isEnabled: isGraphQLEnabled,
};
