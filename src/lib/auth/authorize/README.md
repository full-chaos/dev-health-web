# Authorization decision client (server-only)

Asks the Auth Control Plane policy decision point one question (`authorize`) or up to 100 (`authorizeBatch`) and returns an
allow only for a valid, unexpired, unambiguous answer. Every other path is a deny.

- `request.ts`: builds `authorization_request.v1`. The principal is an opaque reference; no roles, scopes or actor can be set.
- `decision.ts`: parses `authorization_decision.v1` and `authorization_batch_response.v1` from raw text. Refuses a duplicate member,
  a non-integer number, an unknown reason, an expired decision, an unknown member, and a batch whose count or index order differs
  from the request. One bad entry refuses the whole batch.
- `client.ts`: `transport` and `timeoutMs` are required arguments. No module default exists. The deny-default double lives in tests.
  Its consumers are `../shadow` (advisory, off by default) and `../decide` (single decisions for the platform admin actions and
  the GitHub App routes, off by default, a missing transport denies). `transport.ts` is the real transport; it is wired only when `AUTH_INTERNAL_URL`,
  `AUTH_WORKLOAD_SUBJECT_FILE` and `AUTH_WORKLOAD_ISSUER` are all set, and every other state is no transport. `client.ts`,
  `transport.ts`, `shadow/run.ts` and `decide/decide.ts` are rows of `SERVER_ONLY_MODULES` in `scripts/check-client-bundle.mjs`.

## Two kinds of deny

`source: "pdp"` is the decision point saying no (a wire `reason_code`). `source: "client"` is a failure to obtain a valid answer
(`LocalDenyReason`). The two types never mix, and local reasons never pass through `parseDecision`.

## Wire reason codes

Only the 24 values of `decision_reason_code` in the pinned `vocabulary/reason-codes.json` are valid (`WIRE_REASON_CODES`). Any other
value is an invalid decision and a deny. `allowed` must agree with the reason: the 3 `allowed_by_*` reasons
(`allowed_by_role`, `allowed_by_membership_default`, `allowed_by_repository_grant`) are the only allows; every other reason is a deny.
A new wire value denies until web moves `ci/ops-contract.pin`. `__tests__/corpus.test.ts` fails when the client set and the pinned file differ.

## Golden corpus

`__tests__/corpus.test.ts` runs the ops `examples/authorization_*` manifests through the client and pins the `golden/decision`
directory by DIGEST (`__tests__/testdata/decision-golden.digest`). Go runs the pdp and pep rows; this client runs none.

## For the first cache reader (no cache exists in this module)

1. A cache key must carry the session. A delegated allow keeps the base cache bound, which is right at the decision point.
2. An allow that carries Audit (owner exempt) is never served from cache. The wire has no audit member today, so a cache cannot
   honour that rule until it does.
3. Stale-revision rows join the golden corpus with that reader.

## Server-only guard

Each module starts with `import "server-only"`; `__tests__/serverOnly.test.ts` holds that. `client.ts` is a row of
`SERVER_ONLY_MODULES` (client-bundle scan); the other modules of this directory are reached through it.
