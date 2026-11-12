# Web auth reference: Auth.js, authorization, ACR assertion, rollback

One page for developers and operators. It states how `dev-health-web` signs users in, how it asks
the policy decision point (PDP) for a verdict, how it signs the ACR assertion, and which switch
turns each part back. Detail lives in the pages linked in each section.

## 1. Auth.js configuration

`src/lib/auth.ts` builds one `NextAuth(...)` instance (Auth.js v5 beta) and exports `handlers`,
`signIn`, `signOut`, `auth` and the guards.

| Item           | Value                                                                                                                             |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Providers      | `credentials` (backend login), `sso` (a sealed ticket from the SSO routes), GitHub, Google and GitLab (social)                    |
| Social checks  | `checks: ["pkce", "state"]`                                                                                                       |
| Social enabled | A provider is offered when its `AUTH_<NAME>_ID` is set (`getAvailableSocialProviders`)                                            |
| SSO enabled    | `AUTH_SSO_ENABLED` is `true` or `1` (`ssoEnabled`); unset means no SSO call is made                                               |
| Pages          | sign-in `/auth/signin`, error `/auth/error`                                                                                       |
| Secret         | `AUTH_SECRET`; public origin `AUTH_URL` (`trustHost: true`)                                                                       |
| Access token   | EdDSA only, verified against the keys of the pinned issuer `AUTH_ACCESS_TOKEN_ISSUER`; without it sign-in and refresh are refused |

Callbacks:

- `jwt`: runs the sign-in, the refresh (when the access token is within 5 minutes of `exp`), the
  60 s backend validation, the sealed session handoff (organization switch, password change,
  onboarding) and the impersonation start and stop. It keeps the Ops tokens in the sealed session
  cookie only.
- `session`: builds `session.user` (`id`, `role`, `is_superuser`, `org_id`,
  `needs_onboarding`, `is_impersonating`) and the in-process `access_token`. While impersonating,
  `org_id` is the target organization and `real_org_id` is the administrator's. An expired
  delegated token leaves no bearer at all (`session.error = impersonation_ending`).

The Ops token never reaches page JavaScript: `/api/auth/*` answers go through
`browserSafeAuthHandlers`, which removes `access_token` and `refresh_token`.

Guards (server only, `src/lib/auth.ts`): `requireSession` (redirects on a missing session, a
terminal session error or `needs_onboarding`), `requireRole` (superuser bypass does not apply while
impersonating), `requireSuperuser` (refuses an impersonating session).

Detail: [auth-system.md](auth-system.md), [auth-impersonation.md](auth-impersonation.md),
[env-vars.md](env-vars.md).

## 2. Web authorization

Web is a policy enforcement point, not the source of truth. Two layers decide:

1. **Client rules.** The route-group guards above and the role arrays in the guard catalog. These
   are the default.
2. **PDP verdicts.** `src/lib/auth/authorize/` asks the Auth Control Plane `POST /v1/authorize`
   (one request) or the batch form (up to 100). An answer is an allow only when it parses as a valid,
   unambiguous `authorization_decision.v1` whose reason is one of the three `allowed_by_*` codes.
   Any other answer, and any failure to get one, is a deny. Web keeps no decision cache.

How web reaches the PDP (`src/lib/auth/authorize/transport.ts`, `src/lib/auth/workload/token.ts`):

- `AUTH_INTERNAL_URL`, `AUTH_WORKLOAD_SUBJECT_FILE` and `AUTH_WORKLOAD_ISSUER` must all be set
  (the issuer must be an https URL). With any of them unset there is no transport.
- Web reads its projected ServiceAccount token from `AUTH_WORKLOAD_SUBJECT_FILE` and exchanges it
  at `{AUTH_INTERNAL_URL}/internal/v1/token/exchange` (RFC 8693, audience `auth-service`). The
  answer must be a Bearer JWT with `expires_in` of 1 to 300 s whose `iss` equals
  `AUTH_WORKLOAD_ISSUER`, `aud` is `auth-service` and `principal_type` is `workload`. A mis-shaped
  answer is refused.
- The token is cached, refreshed at half its life, and never used inside its last 30 s. If no
  usable token can be had the request is not sent and there is no fallback credential.
- The decision request carries the user's session access token as an opaque principal reference in
  the body; the workload token goes in `Authorization` and nowhere else. Timeouts: 800 ms for
  shadow calls, 1500 ms for enforced guard decisions, 5 s for ACR scope decisions. No retry, no
  redirect.

Three features use the decision client. Each has its own switch and is off by default:

| Switch                    | Exact value | Effect                                                                                                                                                                                                                                 |
| ------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AUTHZ_SHADOW_NAV`        | `on`        | Advisory: after the response, asks the PDP about navigation and page guards and logs the comparison. Changes nothing a page renders.                                                                                                   |
| `AUTHZ_PLATFORM_UI`       | `shadow`    | Same advisory comparison for the platform-admin surfaces.                                                                                                                                                                              |
| `AUTHZ_PLATFORM_UI`       | `enforce`   | Impersonation limits for the platform pages, nav, controls and organization writes. See [auth-impersonation.md](auth-impersonation.md). Any other value is off.                                                                        |
| `AUTHZ_DECISIONS_ENFORCE` | `on`        | One PDP decision per guard (`platform.orgs` as `admin.orgs`, `platform.users` as `admin.users`, `org.integrations.write` as `integrations.write`). The client role rule is then not read; a missing transport or a failed call denies. |

A switch matches its value exactly: `On`, ` on` and `true` are off.

Detail: `src/lib/auth/authorize/README.md`, [auth-endpoint-profiles.md](auth-endpoint-profiles.md).

## 3. ACR assertion

Web signs an assertion for the Agent Context Runtime (ACR) service. It is sent as the
`X-ACR-Web-Assertion` header on every request `AcrRuntimeClient` makes (`src/lib/acr/client.ts`);
`signWebAssertion` (`src/lib/acr/assertion.ts`) is the only signer.

- Format: compact JWT, header `{alg: "EdDSA", kid, typ: "JWT"}`.
- Claims: `aud`, `body_sha256` (of the request body), `exp` (`iat` + 30 s), `iat`, `iss`, `jti`
  (random UUID), `method`, `nbf`, `org_id`, `path`, `permissions`, `repository_scopes`, `sub`.
  `permissions` holds `context:read`, `evidence:read` or `credential:issue`. A `credential:issue`
  assertion also carries `impersonating` and, when known, `sid`, but only when `ACR_OAUTH_ISSUER` is
  set (otherwise both are omitted); web derives both on the server, never from the browser.
- Routes that mint one: `POST /api/acr/device`, `POST /api/agent-context/context-packets`,
  `GET /api/agent-context/evidence/[evidenceRefId]`.
- Configuration (`src/lib/acr/config.ts`): `ACR_API_ORIGIN`, `ACR_WEB_ASSERTION_ISSUER`,
  `ACR_WEB_ASSERTION_AUDIENCE`, `ACR_WEB_ASSERTION_KID`, `ACR_WEB_ASSERTION_KEY_FILE`, and the
  optional `ACR_REQUEST_TIMEOUT_MS` (100 to 30000, default 5000). A missing or invalid value gives
  the "not configured" error and no request.
- Key custody: the Ed25519 private key is a file. Web opens it with `O_NOFOLLOW`, accepts 1 byte to
  16 KiB, and refuses a file with any group or other permission bit. The key is read on every
  request, so a new key file takes effect without a restart.
- Repository scopes: by default they come from the ops repository catalog. With
  `ACR_SCOPES_FROM_GRANTS` on (`1` or `true`, any case), scopes come from PDP decisions for
  `acr.context.read` and `acr.evidence.read`, and device approval and consent first ask
  `acr.credential.issue`. In that mode a missing transport or an invalid answer refuses the request;
  it never falls back to the catalog. Each scope resolution (one or more PDP decisions) writes one
  `acr scopes decided from grants` log line (route, organization, outcome, scopes; no credential).

Key rotation order and the drill: [auth-endpoint-profiles.md](auth-endpoint-profiles.md), section
"Rotating the web assertion key".

The device approval flow and the approver decision: [auth-acr-device-approval.md](auth-acr-device-approval.md).

## 4. Rollback

Each switch below is read per request from the server environment. In the deploy chart they are
entries of the `web.extraEnv` list. Removing an entry and rolling the web Deployment returns that
part to its default.

| To turn back                  | Change                                                                                                                      | Result                                                                                                                                                                |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Platform UI limits or shadow  | Set `AUTHZ_PLATFORM_UI` to anything but `shadow` or `enforce`, or remove it                                                 | Impersonation guards as in the "Always" list of [auth-impersonation.md](auth-impersonation.md)                                                                        |
| Navigation shadow             | Remove `AUTHZ_SHADOW_NAV`                                                                                                   | No advisory calls                                                                                                                                                     |
| PDP guard decisions           | Remove `AUTHZ_DECISIONS_ENFORCE`                                                                                            | Client role rules decide, as before                                                                                                                                   |
| ACR scopes from grants        | Remove `ACR_SCOPES_FROM_GRANTS`                                                                                             | Legacy catalog scopes and the legacy issuance rule                                                                                                                    |
| Enterprise SSO sign-in        | Remove `AUTH_SSO_ENABLED`                                                                                                   | No SSO call; the `sso` provider refuses every ticket                                                                                                                  |
| The decision transport itself | Remove `AUTH_INTERNAL_URL`, `AUTH_WORKLOAD_SUBJECT_FILE`, `AUTH_WORKLOAD_ISSUER` (and the projected token volume and mount) | No transport. Turn off every switch above that uses it first: with `AUTHZ_DECISIONS_ENFORCE` or `ACR_SCOPES_FROM_GRANTS` still on, no transport means deny or refuse. |
| A bad web build               | Pin the previous web image digest in the deploy values (`webImage`) and roll                                                | Previous build; the switches keep their values                                                                                                                        |

Order for a full return to the legacy rules: switches first, then the transport env, then the
image if still needed.

What cannot be switched back: `AUTH_ACCESS_TOKEN_ISSUER` is required, and EdDSA is the only access
token class. The old `AUTH_ACCESS_TOKEN_CLASS` value is ignored if still set. Changing `AUTH_SECRET`
signs every user out once.

Recovery runbooks: [session recovery](runbooks/session-recovery.md),
[forced sign-out](runbooks/forced-sign-out.md).
