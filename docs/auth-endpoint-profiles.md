# Auth endpoint profiles (CHAOS-3273 Wave 0)

Companion to [`auth-system.md`](auth-system.md) — that doc explains the auth
_architecture_; this one is the per-surface inventory Guardrail G-1 requires
("a route without a registered profile fails CI and may not ship"). Extends
it rather than duplicating it: read `auth-system.md` first.

- Machine-readable inventory: [`../contracts/auth/v1/endpoint-profiles.web.json`](../contracts/auth/v1/endpoint-profiles.web.json)
  (173 rows: 14 REST + 159 `server_action`)
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

14 REST surfaces across 9 `route.ts` files under `src/app/api/` (the
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
false, earlier_auth_gate: true, foreign_class_validator: false`. The gate
authenticates the same class (the Auth.js session) before the route's own
check, so it is defence in depth by design, not a foreign-class validator.
Every entry carries both booleans, never both true; the retired name
`reachable_but_not_owner` is refused by the ops schema and by the gate's
`reachable_validator_flags` rule.

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
service (`AcrRuntimeClient.request`). **Three** routes trigger this:
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

Every mint funnels through `signWebAssertion`: the private
`AcrRuntimeClient.request` (`src/lib/acr/client.ts`, where the `X-ACR-Web-Assertion` header is set) is
its only caller.

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

#### Rotating the web assertion key

The assertion `iss` stays `dev-health-web`. The registry row (ops
`workload_assertion_keys`) names the same signer by its https issuer URL; the
pair is stated here, not mapped in code. acr accepts a kid while its public key
is in the acr JWKS file (`ACR_WEB_ASSERTION_JWKS_FILE`). Do the steps in this
order:

1. Add the new public key (Ed25519, new kid) to the acr JWKS file next to the
   old one, and set `retire_after` on the old member (up to 24 h ahead). acr now accepts
   both kids.
2. Record the row with the ops verb: `auth-migrate workload-assertion-key-set
-workload <web workload> -issuer <https issuer of this signer> -kid <new kid>
-status active -rotated-at <RFC 3339> -retire-previous-after <up to 24h>
-confirm`. The old key becomes `retiring` with `retire_after` set.
3. Move web in one config change and one roll: `ACR_WEB_ASSERTION_KID` and
   `ACR_WEB_ASSERTION_KEY_FILE` together. Never change one without the other.
4. At `retire_after`, drop the old public key from the acr JWKS file, then set
   the old row `retired` with the same verb (`-status retired`, same
   `-rotated-at`).

No key goes into the registry, this repo or a log; names only.

acr bounds a kid by time (CHAOS-12380): a JWKS member may carry `retire_after` (RFC 3339).
acr refuses that kid at and after the instant (no clock skew) and refuses a `retire_after` more
than 24 h ahead. Put the same `retire_after` on the old member in step 1, so the overlap ends
without an operator action; step 4 then only tidies the file. A member without `retire_after`
has no time bound. The drill `scripts/drills/assertion-key-rotation/drill.sh` runs this order
against a real acr-api (CHAOS-11236): both kids are accepted inside the overlap, only the new
kid after it.

### `credential:issue` provenance and the impersonation refusal (CHAOS-12095)

The device approval flow and the approver decision are described in
[auth-acr-device-approval.md](auth-acr-device-approval.md).

Every `credential:issue` call (`previewDeviceAuthorization`, `approveDeviceAuthorization`,
`previewOAuthConsent`, `openOAuthConsent`, `decideOAuthConsent` in `src/lib/acr/service.ts`) starts
in `issuanceContext()`. The web **server** derives two values, and the browser never supplies them
(`resolveIssuanceProvenance()` in `src/lib/acr/ops.ts`):

- `sid`: the session id claim of the server's own Ops session token (the token in the sealed
  session; the browser cannot read or change it). A token with no usable `sid` signs none.
- `impersonating`: true when any of these says so: a fresh Ops status read
  (`GET /api/v1/admin/impersonate/status`, not cached; a failed read fails closed with 503), the
  session's impersonation state, an org that differs from the real org, or an Ops token that
  carries `impersonating_user_id`.

While `impersonating` is true, issuance is refused with `403 notEntitled` before any ACR call, also
for an impersonation inside the same organization (chris decision 6). Otherwise both values are
signed into the assertion as the `sid` and `impersonating` claims, which ACR parses (CHAOS-12123).
Assertions for other permissions carry neither claim. ACR's claim decoder refuses unknown claims:
an ACR without that parser refuses every `credential:issue` assertion of this web (401).

The first-party browser client (ACR's own issuer is its resource; `ACR_OAUTH_ISSUER`) gets no
consent click (chris decision 2): `openOAuthConsent()` approves it from the consent page's server
render, server to server through ACR's consent route, with the live org scope grant (`["*"]`). It
needs a session with a `sid`. The approve button route refuses that client (400). Third-party MCP
clients keep the consent page and the repository choice. Since CHAOS-12474 the first-party client
comes to `openOAuthConsent()` only from `POST /api/ask-dev/authorize`, never by that page.

### Ask Dev silent authorization (CHAOS-12474)

`POST /api/ask-dev/authorize` runs ACR's `/authorize` from the signed-in session, and answers
`{code, state, iss}` as JSON, `no-store`. It mints only through `openOAuthConsent()`, so its
assertions are the `credential:issue` ones above. The browser stays the OAuth public client: the
verifier and the `/token` exchange are the browser's, so no token reaches this route. It refuses a
POST whose `Origin` is not this site, a body that is not exactly `{code_challenge, state}`, no
session (401) and an impersonating session (403), each before any ACR call. After those checks it
spends one attempt of the user's budget, 6 a minute (429 `user_rate_limited`, `failClosed`), so a
caller with no session cannot spend it. The call to ACR's `GET /authorize` carries no web credential
and follows no redirect. See
[`ask-dev.md`](ask-dev.md) "Authorizing silently".

### Ask Dev routes

The browser calls ACR directly (CHAOS-12108 removed the server route), so `/api/ask-dev/authorize` is the only route under this prefix. `/api/ask-dev` stays excluded from the Ops rewrite (`shouldProxyToOps` in `src/proxy.ts`); `/api/v1/dev` stays blocked.

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

## Sign-in and sign-out wire (CHAOS-10876)

No row is added or removed. The `[...nextauth]` row's sign-in anchor and the `revoke-session` row
now reach auth-service through `src/lib/authServiceWire.ts` (login, logout) and read the access
token as `auth-system.md` describes. Their anchors were
re-pinned in their own commit.

The refresh in the `[...nextauth]` jwt callback also goes through `authServiceWire.ts`
(`refreshSession`, CHAOS-10876); its anchors were re-pinned in their own commit.

## Wave 11 diff against Wave 0 (CHAOS-11252)

Wave 0 is web #910, merge `11e6290acec6`: 171 rows. This inventory, regenerated against
`50667d4d85f7`, has 184 rows: 30 added, 17 removed,
154 changed, 0 unchanged. Each line names the commit that made the change; the
commit's pull request and ticket are the reason. The regeneration itself changed only the
header (`generated_at`, `source_commit`); no row changed. `source.file:line` already matches
discovery (the gate's `anchor_drift` rule). Other anchor ranges carry no marker the gate
re-locates (only `src/proxy.ts` has one, `anchor_stale`), so they were not rewritten.

### Added

| Row                                                                          | Classification | Commit                     |
| ---------------------------------------------------------------------------- | -------------- | -------------------------- |
| `POST /api/acr/authorize`                                                    | protected      | 6ade1d9e #949 CHAOS-6226   |
| `server_action:src/lib/admin/server/users.ts#createPlatformUser`             | protected      | 64280cd2 #1367 CHAOS-8967  |
| `server_action:src/lib/admin/server/orgs.ts#addOrgMemberByEmail`             | protected      | f9dfef1f #1376 CHAOS-8994  |
| `server_action:src/lib/admin/server/orgs.ts#changeOrgMemberRole`             | protected      | f9dfef1f #1376 CHAOS-8994  |
| `server_action:src/lib/admin/server/serviceAccounts.ts#createServiceAccount` | protected      | 90e1a666 #1442 CHAOS-8966  |
| `POST /api/auth/change-password`                                             | protected      | d71215bc #1449 CHAOS-9513  |
| `server_action:src/lib/admin/server/settings.ts#deleteLLMPurpose`            | protected      | 3767cb75 #1504 CHAOS-10040 |
| `server_action:src/lib/admin/server/settings.ts#upsertLLMPurpose`            | protected      | 3767cb75 #1504 CHAOS-10040 |
| `server_action:src/lib/admin/server/sync.ts#getSyncConfigDatasetAttention`   | protected      | e8fe93d9 #1505 CHAOS-10057 |
| `server_action:src/lib/admin/server/aiFeatures.ts#getServiceModelSetting`    | protected      | 2983b8de #1523 CHAOS-10243 |
| `server_action:src/lib/admin/server/aiFeatures.ts#setServiceModelSetting`    | protected      | 2983b8de #1523 CHAOS-10243 |
| `server_action:src/lib/admin/server/ownModel.ts#getOwnModelSetting`          | protected      | ca4008c0 #1539 CHAOS-10283 |
| `server_action:src/lib/admin/server/ownModel.ts#setOwnModelSetting`          | protected      | ca4008c0 #1539 CHAOS-10283 |
| `server_action:src/lib/admin/server/billing.ts#grantPlatformModelFallback`   | protected      | ac38071d #1549 CHAOS-10271 |
| `server_action:src/lib/admin/server/billing.ts#revokePlatformModelFallback`  | protected      | ac38071d #1549 CHAOS-10271 |
| `server_action:src/lib/admin/server/promptCache.ts#getPromptCacheSetting`    | protected      | 55a0d607 #1550 CHAOS-10574 |
| `server_action:src/lib/admin/server/promptCache.ts#setPromptCacheSetting`    | protected      | 55a0d607 #1550 CHAOS-10574 |
| `server_action:src/lib/onboarding/actions.ts#createWorkspace`                | protected      | c0a4b1dc CHAOS-12088       |
| `server_action:src/lib/onboarding/actions.ts#skipIntegrationStep`            | protected      | c0a4b1dc CHAOS-12088       |
| `POST /api/auth/revoke-session`                                              | protected      | b7c4f3a7 CHAOS-12096       |
| `GET /oauth/acr-client.json`                                                 | public         | a6ecb99d #1659 CHAOS-12302 |
| `POST /api/ask-dev/authorize`                                                | protected      | ec171ff6 #1714 CHAOS-12474 |
| `server_action:src/lib/admin/server/orgs.ts#inviteCurrentOrgMember`          | protected      | 9eed27b6 #1805 CHAOS-12789 |
| `server_action:src/lib/admin/server/orgs.ts#inviteOrgMember`                 | protected      | 9eed27b6 #1805 CHAOS-12789 |
| `server_action:src/lib/admin/server/orgs.ts#removeOrgMember`                 | protected      | 9eed27b6 #1805 CHAOS-12789 |
| `server_action:src/lib/admin/server/orgs.ts#transferOrgOwnership`            | protected      | 9eed27b6 #1805 CHAOS-12789 |
| `GET /api/v1/auth/oidc/[providerId]/callback`                                | public         | eac4967e #1867 CHAOS-13035 |
| `GET /auth/sso/oidc/[providerId]`                                            | public         | eac4967e #1867 CHAOS-13035 |
| `GET /auth/sso/saml/[providerId]`                                            | public         | eac4967e #1867 CHAOS-13035 |
| `POST /api/v1/auth/saml/[providerId]/acs`                                    | public         | eac4967e #1867 CHAOS-13035 |

### Removed

| Row                                                                         | Commit                     |
| --------------------------------------------------------------------------- | -------------------------- |
| `DELETE /api/v1/dev/conversations/[conversationId]`                         | d585c3b9 #955 CHAOS-6262   |
| `GET /api/v1/dev/capabilities`                                              | d585c3b9 #955 CHAOS-6262   |
| `GET /api/v1/dev/conversations`                                             | d585c3b9 #955 CHAOS-6262   |
| `GET /api/v1/dev/conversations/[conversationId]`                            | d585c3b9 #955 CHAOS-6262   |
| `GET /api/v1/dev/conversations/[conversationId]/transcript`                 | d585c3b9 #955 CHAOS-6262   |
| `GET /api/v1/dev/evidence/[evidenceRefId]`                                  | d585c3b9 #955 CHAOS-6262   |
| `PATCH /api/v1/dev/conversations/[conversationId]`                          | d585c3b9 #955 CHAOS-6262   |
| `POST /api/v1/dev/answers/[answerId]/feedback`                              | d585c3b9 #955 CHAOS-6262   |
| `POST /api/v1/dev/conversations`                                            | d585c3b9 #955 CHAOS-6262   |
| `POST /api/v1/dev/conversations/[conversationId]/messages`                  | d585c3b9 #955 CHAOS-6262   |
| `server_action:src/lib/admin/server/ask-dev.ts#getAskDevAdmin`              | d585c3b9 #955 CHAOS-6262   |
| `server_action:src/lib/admin/server/ask-dev.ts#getAskDevUsage`              | d585c3b9 #955 CHAOS-6262   |
| `server_action:src/lib/admin/server/ask-dev.ts#updateAskDevAdminSettings`   | d585c3b9 #955 CHAOS-6262   |
| `server_action:src/lib/admin/server/platform.ts#getPlatformAskDevReadiness` | d585c3b9 #955 CHAOS-6262   |
| `server_action:src/lib/admin/server/platform.ts#runPlatformAskDevReadiness` | d585c3b9 #955 CHAOS-6262   |
| `server_action:src/lib/admin/server/teams.ts#triggerTeamDriftSync`          | 3fba23b2 #1312 CHAOS-8554  |
| `server_action:src/lib/admin/server/users.ts#createUser`                    | 9eed27b6 #1805 CHAOS-12789 |

### Changed

Fields whose content changed, line hints (`source.line`, anchor `line` / `line_end`) left out:

| Row                                                                                                         | Fields changed since Wave 0                                                        | Commits                                                                                                |
| ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `GET /api/agent-context/evidence/[evidenceRefId]`                                                           | line hints only                                                                    | -                                                                                                      |
| `GET /api/agent-context/repositories`                                                                       | line hints only                                                                    | -                                                                                                      |
| `GET /api/auth/organizations`                                                                               | `disclosure_behavior`, `gaps`                                                      | 1dabbf07 #1512 CHAOS-10125; c0a4b1dc CHAOS-12088                                                       |
| `GET /health`                                                                                               | `gaps`                                                                             | 1dabbf07 #1512 CHAOS-10125; c86b4739 #1522 CHAOS-10261                                                 |
| `GET /org/admin/integrations/github-app/callback`                                                           | `gaps`, `primary_validator`                                                        | 1dabbf07 #1512 CHAOS-10125; 4313bffd #1842 CHAOS-10883                                                 |
| `GET /org/admin/integrations/github-app/install`                                                            | `gaps`, `primary_validator`                                                        | 1dabbf07 #1512 CHAOS-10125; 4313bffd #1842 CHAOS-10883                                                 |
| `POST /api/acr/device`                                                                                      | `accepted_credential_classes`, `token_shape`                                       | 45e9c502 #1519 CHAOS-10265                                                                             |
| `POST /api/agent-context/context-packets`                                                                   | line hints only                                                                    | -                                                                                                      |
| `POST /api/auth/switch-org`                                                                                 | `current_state_cache_behavior`, `disclosure_behavior`, `gaps`, `primary_validator` | 1dabbf07 #1512 CHAOS-10125; c0a4b1dc CHAOS-12088; 1938c7b9 #1692 no ticket; df9e57fc #1771 CHAOS-12894 |
| `POST /api/feedback`                                                                                        | `gaps`                                                                             | 1dabbf07 #1512 CHAOS-10125                                                                             |
| `api_route /api/auth/[...nextauth]`                                                                         | `disclosure_behavior`, `gaps`                                                      | 1dabbf07 #1512 CHAOS-10125; c0a4b1dc CHAOS-12088                                                       |
| `server_action:src/app/(app)/feature-flags/actions.ts#fetchFlagPage`                                        | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/app/(app)/superadmin/billing/audit/actions.ts#getAuditEntry`                             | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/app/(app)/superadmin/billing/audit/actions.ts#getAuditLog`                               | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/app/(app)/superadmin/billing/audit/actions.ts#resolveAuditMismatch`                      | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/app/(app)/superadmin/billing/audit/actions.ts#triggerReconciliation`                     | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/billing.ts#createFeatureOverride`                                       | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/billing.ts#deleteFeatureOverride`                                       | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/billing.ts#getOrgEntitlements`                                          | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/billing.ts#listFeatureFlags`                                            | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/billing.ts#listFeatureOverrides`                                        | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/canonicalIncidentIngestion.ts#getCanonicalIncidentIngestionEntitlement` | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/canonicalIncidentIngestion.ts#requirePagerDutyCreationEntitlement`      | `entitlement_requirement`, `gaps`, `reachable_validators`                          | 1dabbf07 #1512 CHAOS-10125; 0af83347 #1518 CHAOS-10169; 678c36c8 #1559 CHAOS-10404                     |
| `server_action:src/lib/admin/server/credentials.ts#createCredential`                                        | `entitlement_requirement`, `gaps`, `reachable_validators`                          | 1dabbf07 #1512 CHAOS-10125; 0af83347 #1518 CHAOS-10169; 678c36c8 #1559 CHAOS-10404                     |
| `server_action:src/lib/admin/server/credentials.ts#deleteCredential`                                        | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/credentials.ts#listCredentials`                                         | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/credentials.ts#testConnection`                                          | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/customer-push.ts#createCustomerPushSource`                              | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/customer-push.ts#createCustomerPushToken`                               | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/customer-push.ts#getCustomerPushBatch`                                  | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/customer-push.ts#getCustomerPushIngestEntitlement`                      | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/customer-push.ts#getCustomerPushSchema`                                 | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/customer-push.ts#getCustomerPushSource`                                 | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/customer-push.ts#listCustomerPushBatches`                               | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/customer-push.ts#listCustomerPushSchemas`                               | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/customer-push.ts#listCustomerPushSources`                               | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/customer-push.ts#listCustomerPushTokens`                                | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/customer-push.ts#revokeCustomerPushToken`                               | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/customer-push.ts#rotateCustomerPushToken`                               | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/customer-push.ts#updateCustomerPushSource`                              | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/customer-push.ts#validateCustomerPushPayload`                           | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/identities.ts#createIdentity`                                           | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/identities.ts#deleteIdentity`                                           | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/identities.ts#getIdentity`                                              | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/identities.ts#listIdentities`                                           | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/identities.ts#updateIdentity`                                           | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/orgs.ts#createOrganization`                                             | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/orgs.ts#deleteCurrentOrg`                                               | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/orgs.ts#deleteOrganization`                                             | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/orgs.ts#dryRunDeleteCurrentOrg`                                         | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/orgs.ts#dryRunDeleteOrganization`                                       | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/orgs.ts#getAuditLog`                                                    | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/orgs.ts#getCurrentOrg`                                                  | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/orgs.ts#getImpersonationStatus`                                         | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/orgs.ts#getOrganization`                                                | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/orgs.ts#getPlatformStats`                                               | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/orgs.ts#listAuditLogs`                                                  | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/orgs.ts#listOrgMembers`                                                 | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/orgs.ts#listOrganizations`                                              | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/orgs.ts#listPlatformAuditLogs`                                          | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/orgs.ts#startImpersonation`                                             | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/orgs.ts#stopImpersonation`                                              | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/orgs.ts#updateCurrentOrg`                                               | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/orgs.ts#updateOrgProfile`                                               | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/orgs.ts#updateOrganization`                                             | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/pagerduty.ts#completePagerDutyOAuth`                                    | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/pagerduty.ts#connectPagerDutyApiToken`                                  | `entitlement_requirement`, `gaps`, `reachable_validators`                          | 1dabbf07 #1512 CHAOS-10125; 0af83347 #1518 CHAOS-10169; 678c36c8 #1559 CHAOS-10404                     |
| `server_action:src/lib/admin/server/pagerduty.ts#connectPagerDutyClientCredentials`                         | `entitlement_requirement`, `gaps`, `reachable_validators`                          | 1dabbf07 #1512 CHAOS-10125; 0af83347 #1518 CHAOS-10169; 678c36c8 #1559 CHAOS-10404                     |
| `server_action:src/lib/admin/server/pagerduty.ts#disconnectPagerDuty`                                       | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/pagerduty.ts#getPagerDutyServices`                                      | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/pagerduty.ts#getPagerDutyStatus`                                        | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/pagerduty.ts#preflightPagerDuty`                                        | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/pagerduty.ts#startPagerDutyOAuth`                                       | `entitlement_requirement`, `gaps`, `reachable_validators`                          | 1dabbf07 #1512 CHAOS-10125; 0af83347 #1518 CHAOS-10169; 678c36c8 #1559 CHAOS-10404                     |
| `server_action:src/lib/admin/server/settings.ts#checkIPAllowed`                                             | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/settings.ts#createIPAllowlistEntry`                                     | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/settings.ts#createRetentionPolicy`                                      | `gaps`, `reachable_validators`                                                     | dbfd8d55 #974 CHAOS-7205; 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                       |
| `server_action:src/lib/admin/server/settings.ts#createSetting`                                              | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/settings.ts#deleteIPAllowlistEntry`                                     | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/settings.ts#deleteLLMSettings`                                          | `gaps`, `reachable_validators`                                                     | dbfd8d55 #974 CHAOS-7205; 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                       |
| `server_action:src/lib/admin/server/settings.ts#deleteRetentionPolicy`                                      | `gaps`, `reachable_validators`                                                     | dbfd8d55 #974 CHAOS-7205; 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                       |
| `server_action:src/lib/admin/server/settings.ts#deleteSetting`                                              | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/settings.ts#executeRetentionPolicy`                                     | `gaps`, `reachable_validators`                                                     | dbfd8d55 #974 CHAOS-7205; 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                       |
| `server_action:src/lib/admin/server/settings.ts#getCurrentClientIp`                                         | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/settings.ts#getLLMBudget`                                               | `gaps`, `reachable_validators`                                                     | dbfd8d55 #974 CHAOS-7205; 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                       |
| `server_action:src/lib/admin/server/settings.ts#getLLMSettings`                                             | `gaps`, `reachable_validators`                                                     | dbfd8d55 #974 CHAOS-7205; 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                       |
| `server_action:src/lib/admin/server/settings.ts#getLLMSettingsStatus`                                       | `gaps`, `reachable_validators`                                                     | dbfd8d55 #974 CHAOS-7205; 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                       |
| `server_action:src/lib/admin/server/settings.ts#getLLMSpendSummary`                                         | `gaps`, `reachable_validators`                                                     | dbfd8d55 #974 CHAOS-7205; 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                       |
| `server_action:src/lib/admin/server/settings.ts#getSecuritySettings`                                        | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/settings.ts#listIPAllowlistEntries`                                     | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/settings.ts#listRetentionPolicies`                                      | `gaps`, `reachable_validators`                                                     | dbfd8d55 #974 CHAOS-7205; 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                       |
| `server_action:src/lib/admin/server/settings.ts#listRetentionResourceTypes`                                 | `gaps`, `reachable_validators`                                                     | dbfd8d55 #974 CHAOS-7205; 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                       |
| `server_action:src/lib/admin/server/settings.ts#listSettingCategories`                                      | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/settings.ts#listSettings`                                               | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/settings.ts#runLLMSettingsReadiness`                                    | `gaps`, `reachable_validators`                                                     | dbfd8d55 #974 CHAOS-7205; 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                       |
| `server_action:src/lib/admin/server/settings.ts#updateIPAllowlistEntry`                                     | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/settings.ts#updateRetentionPolicy`                                      | `gaps`, `reachable_validators`                                                     | dbfd8d55 #974 CHAOS-7205; 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                       |
| `server_action:src/lib/admin/server/settings.ts#updateSecuritySetting`                                      | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/settings.ts#updateSetting`                                              | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/settings.ts#upsertLLMSettings`                                          | `gaps`, `reachable_validators`                                                     | dbfd8d55 #974 CHAOS-7205; 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                       |
| `server_action:src/lib/admin/server/setup.ts#getSetupStatus`                                                | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/sync.ts#batchCreateSyncConfigs`                                         | `entitlement_requirement`, `gaps`, `reachable_validators`                          | 1dabbf07 #1512 CHAOS-10125; 0af83347 #1518 CHAOS-10169; 678c36c8 #1559 CHAOS-10404                     |
| `server_action:src/lib/admin/server/sync.ts#createSyncConfig`                                               | `entitlement_requirement`, `gaps`, `reachable_validators`                          | 1dabbf07 #1512 CHAOS-10125; 0af83347 #1518 CHAOS-10169; 678c36c8 #1559 CHAOS-10404                     |
| `server_action:src/lib/admin/server/sync.ts#deleteSyncConfig`                                               | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/sync.ts#getActiveBackfillJob`                                           | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/sync.ts#getAutoImportCapabilities`                                      | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/sync.ts#getBackfillJobStatus`                                           | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/sync.ts#getSyncConfig`                                                  | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/sync.ts#getSyncConfigRepositories`                                      | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/sync.ts#getSyncCoverage`                                                | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/sync.ts#getSyncJobs`                                                    | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/sync.ts#getSyncRunStatus`                                               | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/sync.ts#getSyncRunUnits`                                                | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/sync.ts#listReposForCredential`                                         | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/sync.ts#listSyncConfigs`                                                | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/sync.ts#toggleSyncActive`                                               | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/sync.ts#triggerBackfill`                                                | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/sync.ts#triggerSync`                                                    | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/sync.ts#updateSyncConfig`                                               | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/sync.ts#updateSyncConfigRepositories`                                   | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/teams.ts#approveTeamChanges`                                            | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/teams.ts#createTeam`                                                    | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/teams.ts#deleteTeam`                                                    | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/teams.ts#discoverTeams`                                                 | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/teams.ts#dismissTeamChanges`                                            | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/teams.ts#getPendingTeamChanges`                                         | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/teams.ts#getTeam`                                                       | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/teams.ts#importTeams`                                                   | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/teams.ts#listTeams`                                                     | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/teams.ts#updateTeam`                                                    | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/users.ts#deleteUser`                                                    | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/users.ts#getUser`                                                       | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/users.ts#listPlatformUsers`                                             | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/users.ts#listUsers`                                                     | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/admin/server/users.ts#setUserPassword`                                               | `gaps`, `reachable_validators`                                                     | 5546b2ef #1448 CHAOS-9511; 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                      |
| `server_action:src/lib/admin/server/users.ts#updateUser`                                                    | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/billing/actions/checkout.ts#createBillingPlan`                                       | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/billing/actions/checkout.ts#deleteBillingPlan`                                       | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/billing/actions/checkout.ts#listBillingPlans`                                        | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/billing/actions/checkout.ts#pullPlansFromStripe`                                     | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/billing/actions/checkout.ts#syncBillingPlanToStripe`                                 | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/billing/actions/checkout.ts#updateBillingPlan`                                       | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/billing/actions/invoices.ts#getInvoice`                                              | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/billing/actions/invoices.ts#getInvoices`                                             | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/billing/actions/invoices.ts#voidInvoice`                                             | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/billing/actions/refunds.ts#createRefund`                                             | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/billing/actions/refunds.ts#getRefunds`                                               | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/billing/actions/subscription.ts#cancelSubscription`                                  | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/billing/actions/subscription.ts#changePlan`                                          | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/billing/actions/subscription.ts#getBillingPortalUrl`                                 | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/billing/actions/subscription.ts#getSubscription`                                     | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/billing/actions/subscription.ts#getSubscriptionHistory`                              | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/billing/actions/subscription.ts#getSubscriptions`                                    | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/billing/actions/subscription.ts#reactivateSubscription`                              | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
| `server_action:src/lib/billing/actions/subscription.ts#startTrialCheckout`                                  | `gaps`, `reachable_validators`                                                     | 1dabbf07 #1512 CHAOS-10125; 678c36c8 #1559 CHAOS-10404                                                 |
