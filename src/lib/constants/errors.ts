export const AuthErrors = {
    Unauthorized: "Unauthorized",
    OrgIdRequiredFromSession: "org_id is required: not provided and not found in session",
    OrgIdRequiredFromGraphQLContext: "org_id is required: not found in filters or GraphQL context",
    OrgIdRequiredFromContext: "org_id is required: not found in filters or context",
} as const;

export const ValidationErrors = {
    InvalidIdFormat: "Invalid ID format",
    InvalidAuditEntryId: "Invalid audit entry ID",
    PricesJsonMustBeArray: "Prices JSON must be an array",
    FailedToFetchEvidence: "Failed to fetch evidence",
    GraphQLResponseMissingData: "GraphQL response missing data",
    ServerEnvCalledFromClientBundle:
        "getServerEnv() called from client bundle — server-only env is not available at runtime.",
} as const;

export const ApiErrors = {
    RateLimitExceeded: "Rate limit exceeded. Please try again later.",
    GenericApiError: "API error",
    FailedToCreateIssue: "Failed to create issue",
} as const;

export const apiErrorMessage = (status: number): string => `API error: ${status}`;

export const requestFailedMessage = (status: number): string => `Request failed (${status})`;

export const graphQlErrorMessage = (message: string): string => `GraphQL error: ${message}`;

export const validationFailedMessage = (details: string): string => `Validation failed: ${details}`;

export const linearApiRequestFailedMessage = (status: number): string =>
    `Linear API request failed with status ${status}`;
