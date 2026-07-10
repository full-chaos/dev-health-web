# Agent Context Runtime Entitlement Contract

`agent_context_runtime` is an organization-scoped, purchased hosted product
entitlement. It is never enabled merely because an organization is on a paid
Dev Health tier, trial, or self-hosted installation.

The web entitlement management surface consumes the existing authenticated
`GET /api/v1/licensing/entitlements/{org_id}` response through
`OrgEntitlements.features`. It can display the boolean and create the existing
organization-scoped feature overrides for superadmins. It must not infer ACR
access from `tier`, cache a positive result as durable authorization, pass an
organization chosen by the browser as trusted identity, or attach Dev Health
license material to an ACR request.

The hosted ACR service independently validates its own credential, organization,
and repository scope before it reads this entitlement. A value of `false`, a
missing feature row, or an unavailable entitlement record is denied. The web is
an inspection and administration surface only; it does not implement ACR
assembly or authorization.
