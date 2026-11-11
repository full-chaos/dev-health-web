// The decision point lists at most 256 repositories in one allow (ops obligations.go MaxRepositoryAllowlist); over
// that it denies repository_allowlist_too_large. Shared by the server error and the approval and consent pages.
export const GRANT_LIMIT_EXCEEDED_CODE = "grant_limit_exceeded";
export const GRANT_LIMIT_MESSAGE =
    "This account holds more than 256 repository grants in this organization. One credential covers at most 256 repositories.";
