# Auth endpoint profiles (CHAOS-3273 Wave 0)

Companion to [`auth-system.md`](auth-system.md) — that doc explains the auth
_architecture_; this one is the per-surface inventory Guardrail G-1 requires
("a route without a registered profile fails CI and may not ship"). Extends
it rather than duplicating it: read `auth-system.md` first.

- Machine-readable inventory: [`../../contracts/auth/v1/endpoint-profiles.web.json`](../../contracts/auth/v1/endpoint-profiles.web.json)
  (168 rows: 18 REST + 150 `server_action`)
- Discovery script (independent re-derivation): [`../../ci/discover_web_routes.ts`](../../ci/discover_web_routes.ts)
- CI gate (diffs discovery against the inventory; fails on an unowned
  surface, a stale row, a duplicate id, a closed-vocabulary violation,
  anchor drift, a schema violation, an unstated null, or a claimed-protected
  action whose validator can't be shown to reject): [`../../ci/gate_web_auth_profiles.ts`](../../ci/gate_web_auth_profiles.ts),
  proven by [`../../ci/__tests__/gate_web_auth_profiles.test.ts`](../../ci/__tests__/gate_web_auth_profiles.test.ts).
  Wired into CI as a step of the `quality` job in
  `.github/workflows/tests.yml`, on every pull request; a run with no ops
  contract input (see next bullet) SKIPS the closed-vocabulary checks
  locally but FAILS in CI (`checkContractInputsPresent`) -- a skip that
  still exits 0 is a green build nobody reads the warning on.
- Shared schema (owned by ops, reused as-is): `contracts/auth/v1/endpoint-profile.schema.json`.
  The "service" closed vocabulary is read LIVE from this schema's
  `$defs.endpointProfile.properties.service.enum`, never hardcoded.
- Closed credential-class vocabulary (owned by ops): `contracts/auth/v1/credential-classes.json`
- Both ops-owned contract files above are pinned at one ops commit
  (`../../ci/ops-contract.pin`) and fetched via a sparse checkout in CI --
  the same mechanism dev-health-acr uses, so a push to ops's own main never
  silently changes what this gate validates against.

## Coverage

18 REST surfaces across 15 `route.ts` files under `src/app/api/` (one file,
`conversations/[conversationId]/route.ts`, registers 3 methods; the
NextAuth catch-all is represented as a single `api_route` row). This matches
the orchestrator's file count (15) exactly; the row count (18) reflects
per-method splitting, mirroring ops's convention.

Two families, by how they reach ops:

| Family             | Files                                                                     | Auth pattern                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Direct (own fetch) | `auth/[...nextauth]`, `auth/organizations`, `auth/switch-org`, `feedback` | Inline `auth()` check, own `fetch()` to ops                                                                                              |
| ACR-issuing        | `acr/device`, `agent-context/*`                                           | `auth()` inside `src/lib/acr/service.ts`, then **mints and sends an `acr_web_assertion`** to the ACR service (see "web as issuer" below) |
| Ask Dev proxy      | `v1/dev/*` (7 files, 10 rows)                                             | Shared `src/app/api/v1/dev/_proxy.ts` forwards `Authorization: Bearer` to ops                                                            |

## `src/proxy.ts` — the only middleware

Next.js 16 does not allow `middleware.ts` and `proxy.ts` to coexist; this
repo uses `proxy.ts` for both routing and auth enforcement
(`docs/auth-system.md` "Proxy Integration"). For every non-public path it:

1. Calls `auth()`; no session → 303 redirect to `/auth/signin` (`src/proxy.ts:250-263`).
2. Requires `session.user.org_id` unless the path starts with one of
   `ORG_EXEMPT_PATHS = ["/superadmin", "/demo", "/auth/onboard", "/settings"]`
   → redirect to `/auth/onboard` or `/superadmin` (`src/proxy.ts:270-279`).
3. For paths it proxies to ops (`shouldProxy`, `src/proxy.ts:287-296` —
   excludes `/api/auth`, `/api/acr`, `/api/agent-context`,
   `/api/v1/dev*`, `/api/v1/llm-proxy`), rewrites to the backend and injects
   **both** `Authorization: Bearer <access_token>` and `X-Org-Id: <org_id>`
   (`src/proxy.ts:319-323`).

**`/api/auth` is a `PREFIX_PUBLIC_PATH`** (`src/proxy.ts:96`) — proxy.ts
performs _no_ credential check ahead of `auth/organizations`,
`auth/switch-org`, or the NextAuth catch-all; those three own their
authentication entirely. Every other row in the inventory has proxy.ts's
session+org gate as a `reachable_validators` entry: `is_intended_validator:
false, reachable_but_not_owner: true` — the CHAOS-3271 pattern L1 found in
ops's `OrgIdMiddleware`/`ImpersonationMiddleware`, here in web's own
middleware layer.

## Route-group layout guards (not schema rows — see below)

| Route group         | Layout                                 | Guard                                       |
| ------------------- | -------------------------------------- | ------------------------------------------- |
| `(app)`             | `src/app/(app)/layout.tsx`             | `requireSession()`                          |
| `(app)/org/admin`   | `src/app/(app)/org/admin/layout.tsx`   | `requireRole(["admin","owner"])`            |
| `(app)/superadmin`  | `src/app/(app)/superadmin/layout.tsx`  | `requireSuperuser()`                        |
| `(app)/data-health` | `src/app/(app)/data-health/layout.tsx` | `requireRole(["admin","owner","operator"])` |

**Doc-drift finding:** `auth-system.md`'s "Route Group Security" table lists
the admin guard's layout as `src/app/(app)/admin/layout.tsx`; the actual
path is `src/app/(app)/org/admin/layout.tsx`, and it is not the only
additional role-gated layout (`data-health` also gates, undocumented there).
Not fixed in this pass (`auth-system.md` is out of this lane's write scope);
flagged for the doc owner.

These guard page _navigation_, not an HTTP endpoint with a method/path the
schema's `surface_kind` enum can represent — see the schema-evolution
finding below.

## Web as an ISSUER: `X-ACR-Web-Assertion`

`src/lib/acr/assertion.ts::signWebAssertion()` mints a compact, EdDSA-signed,
JWT-shaped assertion (header `{alg: "EdDSA", kid, typ: "JWT"}`, claims
`{aud, body_sha256, exp: iat+30s, iat, iss, jti, method, nbf, org_id,
path, permissions, repository_scopes, sub}`) and sends it as
`X-ACR-Web-Assertion` on every request `AcrRuntimeClient` makes to the ACR
service (`src/lib/acr/client.ts:276-301`). **Three** routes trigger this:
`POST /api/acr/device`, `POST /api/agent-context/context-packets`, and
`GET /api/agent-context/evidence/[evidenceRefId]`. They now carry it as
machine-readable `issued_credential` rows in
`contracts/auth/v1/endpoint-profiles.web.json`, not prose alone.

> **Correction — `agent-context/repositories` does NOT mint.** An earlier
> revision of this page listed a fourth route,
> `GET /api/agent-context/repositories`. That is wrong; the row now records
> `issued_credential: []` — assessed, mints nothing.
> `listAuthorizedRepositories()` (`src/lib/acr/service.ts:83-102`) never
> constructs an `AcrRuntimeClient`: it calls `resolveOpsAuthorization()` and
> returns `authorization.repositoryScopes` straight from **ops**. The route
> file imports only that helper and `getCurrentOrg`
> (`src/app/api/agent-context/repositories/route.ts:1-5`), and
> `src/lib/acr/ops.ts` forwards the caller's own session token
> (`Authorization: Bearer ${accessToken}`, `:91`) rather than minting
> anything. In an issuer inventory a false issuer is as damaging as a missing
> one, so the claim is corrected here rather than left standing in prose.

Every mint funnels through the single private `AcrRuntimeClient.request`
(`src/lib/acr/client.ts:276`, header set at `:284`); `signWebAssertion` has no
other caller in the repo, so that one line is the whole issuing surface.

**Key custody** (`src/lib/acr/config.ts::readPrivateKey()`):

- Private key lives on the **web server's local filesystem**, path from
  `ACR_WEB_ASSERTION_KEY_FILE`. Not KMS/HSM-backed.
- Opened `O_NOFOLLOW` (no symlink following), size-bounded (1B–16KiB),
  **mode-checked**: rejects if any of the group/other bits are set
  (`metadata.mode & 0o077 !== 0`) — i.e. requires `0600` or stricter.
  Owner-execute/read bits are not separately checked.
  Must parse as an `ed25519` key or the whole config load throws.
- Loaded fresh on every `loadAcrRuntimeConfig()` call (no in-process cache
  observed) — a key rotation takes effect on the next request, no restart
  needed, at the cost of a filesystem read per ACR call.
- `keyId` (JWT `kid`) is a separate env var (`ACR_WEB_ASSERTION_KID`),
  independently validated as `[A-Za-z0-9._-]{1,128}`.

Positive pattern worth copying platform-wide (per orchestrator's known
facts about acr's `authenticateWebAssertion` rejecting dual
`X-ACR-Web-Assertion`+`Authorization`): `approveDeviceAuthorization()` and
`previewDeviceAuthorization()` in `src/lib/acr/service.ts` (lines 149-218)
explicitly **refuse to issue an assertion while impersonating** — they
compare `rawSession.user.real_org_id` against the impersonation-resolved
`session.orgId` and throw `403 notEntitled` on mismatch. No other web route
in this inventory has an equivalent explicit impersonation block; the other
two minting routes rely only on `session.user.org_id` already being
impersonation-resolved (`resolveActiveOrgId()`), which is weaker (silently
scopes to the impersonated org rather than refusing).

## FINDING: `/api/v1/dev/*` never forwards `X-Org-Id`

`src/app/api/v1/dev/_proxy.ts::proxyDevRequest()` forwards only
`Authorization: Bearer <access_token>` to ops — never `X-Org-Id`, unlike
`proxy.ts`'s own rewrite path. `session.access_token` is the admin's
original ops JWT; it is **not** re-minted per impersonation target (only
`session.user.org_id` is remapped client-side via `resolveActiveOrgId()`).
Whether ops's `/api/v1/dev/*` handlers derive org from the JWT alone, and if
so whether that equals the impersonated org or the admin's real org, is an
**ops-repo question this lane cannot verify** (ops worktree is read-only for
L2). Reported to auth-cp for ticketing, not guessed at.

## FINDING: inconsistent mutation CSRF/Origin checks

Three different postures across mutating routes:

- `acr/device` (`route.ts:94-99`) and `v1/dev/_proxy.ts`
  (`hasValidMutationOrigin()`, lines 67-115) both explicitly check the
  `Origin` header against `AUTH_URL`/`NEXTAUTH_URL` (or a same-site
  fallback).
- `auth/switch-org`, `agent-context/context-packets` have **no** explicit
  Origin check — CSRF defense is whatever the Auth.js session cookie's
  `SameSite` attribute provides (next-auth default, not verified as an
  explicit override in this repo).

Not necessarily a defect (session-cookie SameSite may be sufficient), but
the asymmetry within the _same_ auth family is worth the CI-gate author's
attention.

## Schema-evolution findings — both RESOLVED

This lane reported two blockers against the shared
`endpoint-profile.schema.json` rather than silently forking it. Both have
since been fixed in the schema, in the ops repo that owns it.

1. **`service` was a closed 2-value enum** naming only ops's two deployed
   apps, and was `required` — so no web row could validate at all. The enum
   now carries all five deployed apps (`dev-health-ops-api`,
   `dev-health-ops-billing-edge`, `dev-health-web`, `dev-health-acr-api`,
   `dev-health-acr-mcp`) and is still **closed on purpose** (G-26: an
   unknown service must fail, not be quietly accepted — a newly deployed app
   gets registered in the enum before its routes can carry profiles).
   `endpoint-profiles.web.json` validates as published; the
   `schema_deviation_note` key that flagged this has been removed, since it
   was itself an extra top-level key the schema's
   `additionalProperties: false` rejects.
2. **No field for an endpoint's issued/outbound credential.** The schema now
   has an optional `issued_credential` array (mint-site anchor,
   closed-vocabulary `class_id`, `direction`, and issuer/audience/algorithm/
   lifetime/key-source facts). The three minting routes above carry real
   entries; `agent-context/repositories` carries `[]`. Rows this lane did not
   trace for issuance leave the field **absent** — the field is optional
   precisely so an untouched row reads as "predates the field" rather than as
   a false "issues nothing". See the ops repo's
   `docs/reference/auth/endpoint-profiles.md` for the field's full contract.

**RESOLVED 2026-09-01** (chris's ruling): `server_action` is now a
`surface_kind` value — see the next section. (Earlier revisions of this page
said there was no such kind and that Server Actions were deliberately left
unprofiled; that is no longer accurate, superseded below.)

## Server Actions ("use server") — now expanded into rows

Chris ruled 2026-09-01 (10:56): Server Actions **are** auth surfaces and
count toward Wave 0's coverage criterion. Web is the public auth boundary
(ops is reached through it), so an unprofiled Server Action here is an
unprofiled perimeter surface, not a secondary gap.

**Keying.** Next.js dispatches a Server Action by an encrypted, per-build
action id posted to a page — never a static method+path — so `method` and
`route` are `null` for this surface kind, and the stable key is
`server_action:<repo-relative module path>#<exported function name>`
(`endpoint-profile.schema.json`'s `id` field format for this kind). Never
key on the action id itself: it changes on every build.

**Discovery.** `ci/discover_web_routes.ts` independently walks every file
under `src/` whose first non-comment, non-blank line is the `"use server"`
directive (20 files) and emits one `serverActions` record per exported
function — `export async function NAME(...)` or the async-arrow form,
`export type`/`export interface` lines correctly excluded since Next.js
erases them at compile time and does not require them to be async
functions. Current count: **150** actions across those 20 files, all now
carrying rows in `endpoint-profiles.web.json`, bringing the file's total
row count to 168 (18 REST + 150 server\_action).

**Reconciliation.** An earlier pass estimated "~98" Server Actions while
flagging the exclusion above; that estimate was never produced by running
this repo's own discovery script (which, unchanged in its function-matching
regex, independently reproduces 150 today) — it does not survive
reconciliation under any grouping tested (distinct function names, or
single-line-signature-only counting) and is best read as an informal
estimate rather than a prior measurement to reconcile against. Four
CRUD-heavy admin files (`settings.ts` 26, `orgs.ts` 19, `sync.ts` 19,
`customer-push.ts` 14) account for 78 of the 150 — more than half — which is
the concrete reason a quick per-file skim would undercount.

**Guard patterns verified.** Every action's own call chain was traced (not
just grepped for a literal `auth()`/`requireSession` token — a shared-helper
call one hop away, or an inline check, both correctly reject and would be
missed by a purely textual search). The overwhelming majority funnel
through one of a small number of shared, verified-rejecting helpers:
`src/lib/admin/server/_shared.ts::getSessionContext()`/`requireSuperuserToken()`/`getToken()`,
`src/lib/billing/actions/_shared.ts::getAuthHeaders()`/`resolveOrgId()`/`getAuthHeadersOrThrow()`
(the last also reached via `apiRequest()`), and one file-local equivalent in
`superadmin/billing/audit/actions.ts`. `resolveOrgId()` additionally
enforces `orgId === sessionOrgId` unless `is_superuser` — recorded in each
affected row's `tenant_requirement`, not only in prose.

**General platform note, not specific to this repo:** a page's `layout.tsx`
guard (React Server Component code) does not execute before a Server Action
invocation reaches the action function itself — this is documented,
general-purpose Next.js App Router behavior (see Next.js's own Server
Actions security guidance: treat every Server Action as its own
independently-reachable endpoint). Relying solely on a route group's layout
guard, with no check inside the action itself, does not protect that
action. Every row in this inventory's `primary_validator` anchors a check
that executes inside the action's own call chain for exactly this reason —
never a layout guard.

**`DISCLOSURE-HOLD` convention:** a row whose `gaps` entry is
`DISCLOSURE-HOLD`-prefixed is complete and accurate, but this repo being
public means the specific mechanism is withheld from prose here (or
anywhere else outside the contract file) until the fix ships in the same
PR, or after it merges. No row in `endpoint-profiles.web.json` currently
carries this marker: the two rows that did (`fetchFlagPage`,
`listBillingPlans`) were fixed by CHAOS-4728 (merged `fcc3c1db`) and
re-profiled against the fixed code. `ci/gate_web_auth_profiles.ts` fails CI
on this exact defect shape (a claimed-protected action whose validator
anchor cannot be shown to reject, undisclosed in `gaps`) for any _new_ row
that doesn't disclose it the way a held row would.
