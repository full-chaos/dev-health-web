# Auth endpoint profiles (CHAOS-3273 Wave 0)

Companion to [`auth-system.md`](auth-system.md) — that doc explains the auth
_architecture_; this one is the per-surface inventory Guardrail G-1 requires
("a route without a registered profile fails CI and may not ship"). Extends
it rather than duplicating it: read `auth-system.md` first.

- Machine-readable inventory: [`../contracts/auth/v1/endpoint-profiles.web.json`](../contracts/auth/v1/endpoint-profiles.web.json)
  (157 rows: 12 REST + 145 `server_action`)
- Discovery script (independent re-derivation): [`../ci/discover_web_routes.ts`](../ci/discover_web_routes.ts)
- CI gate (diffs discovery against the inventory; fails on an unowned
  surface, a stale row, a duplicate id, a closed-vocabulary violation,
  anchor drift, a stale anchor (a `src/proxy.ts` anchor range without `boundedProxyAuth(`), a schema violation, an unstated null, or a claimed-protected
  action whose validator can't be shown to reject): [`../ci/gate_web_auth_profiles.ts`](../ci/gate_web_auth_profiles.ts),
  proven by [`../ci/__tests__/gate_web_auth_profiles.test.ts`](../ci/__tests__/gate_web_auth_profiles.test.ts).
  Wired into CI as a step of the `quality` job in
  `.github/workflows/tests.yml`, on every pull request; a run with no ops
  contract input (see next bullet) FAILS, in CI and locally
  (`checkContractInputsPresent`): a measurement that did not happen must
  fail. A local run that cannot supply the inputs passes
  `--allow-missing-contract-inputs` (or sets `WEB_ALLOW_MISSING_CONTRACT_INPUTS=1`
  for `ci/run_tests.sh`); the gate then lists the checks it skipped. CI has
  no opt-out.
- Shared schema (owned by ops, reused as-is): `contracts/auth/v1/endpoint-profile.schema.json`.
  The "service" closed vocabulary is read LIVE from this schema's
  `$defs.endpointProfile.properties.service.enum`, never hardcoded.
- Closed credential-class vocabulary (owned by ops): `contracts/auth/v1/credential-classes.json`
- Both ops-owned contract files above are pinned at one ops commit
  (`../../ci/ops-contract.pin`) and fetched via a sparse checkout in CI --
  the same mechanism dev-health-acr uses, so a push to ops's own main never
  silently changes what this gate validates against.

## Absent versus null on the advisory fields

On `action`, `resource_resolver`, `current_state_cache_behavior`,
`entitlement_requirement`, `disclosure_behavior` and `token_shape`, a field is
**absent** when code evidence shows it does not apply to the route, and `null`
when it is undetermined in this pass. Every `null` needs a `gaps` entry that
begins with `<field>:` and says what was searched. Never write `null` for
"not applicable", and never infer "absent" from silence. The rule is ops-owned
(`docs/reference/auth/endpoint-profiles.md` in dev-health-ops, ACP decision
sheet B10 shape b). The gate that enforces it on every advisory field is a
separate change; this inventory already satisfies it.

The gate now enforces "absent" for two fields. A row may leave
`entitlement_requirement` or `token_shape` absent only when the type-checker
call walk in `ci/discover_web_routes.ts` proves it: the walk follows every call
from the handler and reaches no member of `ENTITLEMENT_SYMBOLS` (entitlement
gates) or `GUARD_SYMBOLS` (credential reads). A call the walk cannot resolve to
a body (a parameter callback, an interface member) makes the verdict `limit`,
and `limit` never proves absence. So does anything the walk cannot resolve
statically: a call to an overridable class method, a read that may run a getter
(property, element, spread, destructuring, `for...in`), a string conversion of a
project object, and a library call that receives a project object with methods
or accessors (`JSON.stringify` runs `toJSON`). A present field that is empty
(`""`, `[]`, `{}`) counts as absent. `ENTITLEMENT_SYMBOLS` entries are verified
as live gates: each must still call what it delegates to and, for a rejecting
gate, throw on a condition computed from that call's result. Rule `absent_without_proof` rejects an absent
field without a `not_reachable` verdict. Rule `reach_contradicts_row` rejects a
null or absent field whose gate or credential read is reachable, and a recorded
`entitlement_requirement` on a surface that reaches no gate.
`current_state_cache_behavior` and `resource_resolver` have the same absent
proof, with their own symbol sets: `CACHE_SYMBOLS` (`next/cache` revalidation
and `unstable_cache`, React `cache`, a `fetch` with a `cache` or `next` option,
a `Cache-Control` string) and `RESOLVER_SYMBOLS` (the session and org helpers,
plus request input: a server action parameter, a route reading its body, query
or params). Their values are prose the walk cannot derive, so a `null` with its
`<field>:` gaps entry stays allowed even when the walk reaches a symbol; only
"absent" needs the proof. `verifyCacheSymbols` and `verifyResolverSymbols` fail
the gate when a listed name stops resolving. `action` and `disclosure_behavior`
have no predicate yet: they may not be absent, and stay `null` with a
`<field>:` gaps entry. A gate is verified live by `entitlementGateIsLive`, in one closed shape: a
`const` from an awaited known call, then `if (<cond>) throw`, then an optional
`return`, where `<cond>` is a `||` of leaves, each `!chain` or a chain compared
with a literal, with every chain derived from that call. No `&&`, no `!` on
anything but a chain, no bare truthiness, no `try`, `switch`, loop, label,
`let` or reassignment: anything else is not live. The polarity is bound to the
refusal: a leaf is true exactly when the value is disabled or unset (`!chain`,
`!(chain ?? false)`, `chain !== <positive literal>`, `chain === <falsy
literal>`); `enabled === true` throws on an enabled entitlement and is not a
closed condition. A callee is bound by declaration, not by name: it must be a
top-level function or const of the gate's own module, or an import from the
module the gate lists (`fetchBoundedJson` from `./http`), and never a name the
gate declares locally.

"Absent" rests on an allowlist, not on a list of hazards. A verdict is
`not_reachable` only when the whole handler is provably inert: literals,
`const` bindings of inert values, primitive parameters, plain object and array
literals, operators on primitive operands, `if` / `else`, `return`, and
`throw new Error(<inert>)`. It holds no call at all (a global or a dependency
can be patched, so no builtin is trusted), no property read on a non-literal,
no `await`, no spread, no getter, and no cast (`as`, `satisfies`, `!`), since
a cast overrides the static type the proof trusts. Anything else is `limit`, so an aliased
`fetch`, a patched `console`, a `valueOf`, an interface-typed getter or a
`Proxy` trap can never produce an absence. The call walk still finds
`reachable`; request reads are decided by the type of the value (`Request`,
`NextRequest`, `Headers`), and cache targets match by declaration identity.
The model is a static lint over honest code: patching `Object.prototype` or
replacing a global such as `Error` from another module is outside it (it is
not a defence against a malicious committer). `GET /health` calls `NextResponse.json`, so its `token_shape` is `null` with a
gaps entry (manual review), not absent.

## Coverage

12 REST surfaces across 8 `route.ts` files under `src/app/api/` (the
NextAuth catch-all is represented as a single `api_route` row).

Two families, by how they reach ops:

| Family             | Files                                                                     | Auth pattern                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Direct (own fetch) | `auth/[...nextauth]`, `auth/organizations`, `auth/switch-org`, `feedback` | Inline `auth()` check, own `fetch()` to ops                                                                                              |
| ACR-issuing        | `acr/device`, `agent-context/*`                                           | `auth()` inside `src/lib/acr/service.ts`, then **mints and sends an `acr_web_assertion`** to the ACR service (see "web as issuer" below) |

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

### Ask Dev route (CHAOS-11921)

`POST /api/ask-dev/investigations` is a fourth minting route. It has no `capabilities` pre-call: one
assertion (`context:read`, bound to the exact body bytes and the caller's repository scopes) is
signed per request in `AcrRuntimeClient.openInvestigationStream`, with the same key custody as above
(only the web server holds the key). The auth chain runs on every call and caches nothing: session,
impersonation refusal (`real_org_id` differs: 403), both entitlements `agent_context_runtime` and
`ask_dev` read from ops (`requireAskDevEntitlements`), the repository scopes (empty: `no_repository`),
then the pinned request schema. `/api/ask-dev` is excluded from the Ops rewrite (`shouldProxyToOps`
in `src/proxy.ts`); `/api/v1/dev` stays blocked.

## FINDING: inconsistent mutation CSRF/Origin checks

Two postures remain across mutating routes:

- `acr/device` (`route.ts:94-99`) explicitly checks the `Origin` header
  against `AUTH_URL`/`NEXTAUTH_URL` (or a same-site fallback)
  (`hasValidMutationOrigin()`, deleted with `v1/dev/_proxy.ts`, had the same
  check).
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
directive (18 files) and emits one `serverActions`
record per exported function — `export async function NAME(...)` or the
async-arrow form, `export type`/`export interface` lines correctly excluded
since Next.js erases them at compile time and does not require them to be
async functions. Current count: **145** actions across those 18 files, all
now carrying rows in `endpoint-profiles.web.json`, bringing the file's total
row count to 157 (12 REST + 145 server\_action).

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
