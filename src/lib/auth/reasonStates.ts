export const AUTH_UI_STATES = [
    "allowed",
    "signin",
    "denied",
    "entitlement",
    "unavailable",
    "notfound",
] as const;
export type AuthUiState = (typeof AUTH_UI_STATES)[number];

export const DECISION_REASON_CODES = [
    "allowed_by_membership_default",
    "allowed_by_repository_grant",
    "allowed_by_role",
    "delegation_invalid",
    "grant_absent",
    "grant_expired",
    "grant_revoked",
    "impersonation_denied",
    "invalid_request",
    "membership_inactive",
    "no_membership",
    "org_mismatch",
    "organization_inactive",
    "platform_role_absent",
    "principal_inactive",
    "repository_not_granted",
    "resource_mismatch",
    "role_lacks_action",
    "role_scope_mismatch",
    "role_unknown",
    "service_account_inactive",
    "unknown_action",
    "workload_action_denied",
    "workload_audience_denied",
] as const;

export const CODE_STATES: Readonly<Record<string, AuthUiState>> = Object.freeze({
    allowed_by_repository_grant: "allowed",
    allowed_by_role: "allowed",
    allowed_by_membership_default: "allowed",
    grant_absent: "denied",
    repository_not_granted: "denied",
    platform_role_absent: "denied",
    grant_expired: "denied",
    grant_revoked: "denied",
    membership_inactive: "denied",
    organization_inactive: "denied",
    org_mismatch: "denied",
    resource_mismatch: "denied",
    role_lacks_action: "denied",
    role_scope_mismatch: "denied",
    role_unknown: "denied",
    service_account_inactive: "denied",
    unknown_action: "denied",
    workload_action_denied: "denied",
    workload_audience_denied: "denied",
    impersonation_denied: "denied",
    delegation_invalid: "denied",
    invalid_request: "unavailable",
    principal_inactive: "signin",
    no_membership: "notfound",
    denied_policy: "denied",
    denied_no_grant: "denied",
    denied_no_membership: "notfound",
    not_found: "notfound",
    credential_missing: "signin",
    expired: "signin",
    principal_deactivated: "signin",
    rate_limited: "unavailable",
    current_state_unavailable: "unavailable",
    authority_unavailable: "unavailable",
    upstream_unavailable: "unavailable",
    internal_error: "unavailable",
    // Sign in again. Pre-auth account-existence codes share ONE state and message (design ruling).
    session_expired: "signin",
    session_revoked: "signin",
    refresh_expired: "signin",
    refresh_unknown: "signin",
    refresh_reused: "signin",
    invalid_credentials: "signin",
    principal_not_found: "signin",
    account_locked: "signin",
    email_unverified: "signin",
    malformed: "signin",
    bad_signature: "signin",
    audience: "signin",
    issuer: "signin",
    not_yet_valid: "signin",
    missing_sub: "signin",
    missing_type: "signin",
    type_mismatch: "signin",
    revision_stale: "signin",
    replayed: "signin",
    nonce_mismatch: "signin",
    not_entitled: "entitlement",
    membership_required: "denied",
    provisioning_disabled: "denied",
    domain_not_allowed: "denied",
    provider_already_linked: "signin",
    identity_conflict: "signin",
    email_collision: "signin",
    store_unavailable: "unavailable",
    dependency_unavailable: "unavailable",
    signup_unavailable: "unavailable",
});

const MESSAGES: Readonly<Record<AuthUiState, string>> = Object.freeze({
    allowed: "Access granted.",
    signin: "Sign in to continue.",
    denied: "You do not have access to this.",
    entitlement: "This is not included in your current plan.",
    unavailable: "This is temporarily unavailable. Try again shortly.",
    notfound: "We could not find this page.",
});

export type ReasonStateContext = { hidden?: boolean; entitlement?: boolean };
export type ReasonState = { state: AuthUiState; message: string };

export function reasonToState(code: unknown, ctx: ReasonStateContext = {}): ReasonState {
    let state: AuthUiState =
        typeof code === "string" && Object.hasOwn(CODE_STATES, code)
            ? CODE_STATES[code]
            : "unavailable";
    if (state === "denied" || state === "notfound") {
        if (ctx.hidden === true) state = "notfound";
        else if (ctx.entitlement === true && state === "denied") state = "entitlement";
    }
    return { state, message: MESSAGES[state] };
}
