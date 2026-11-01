# Authorization decision client (server-only)

Asks the Auth Control Plane policy decision point one question (`authorize`) or up to 100 (`authorizeBatch`) and returns an
allow only for a valid, unexpired, unambiguous answer. Every other path is a deny.

- `request.ts`: builds `authorization_request.v1`. The principal is an opaque reference; no roles, scopes or actor can be set.
- `decision.ts`: parses `authorization_decision.v1` and `authorization_batch_response.v1` from raw text. Refuses a duplicate member,
  a non-integer number, an unknown reason, an expired decision, an unknown member, and a batch whose count or index order differs
  from the request. One bad entry refuses the whole batch.
- `client.ts`: `transport` and `timeoutMs` are required arguments. No module default exists. The deny-default double lives in tests.

## Two kinds of deny

`source: "pdp"` is the decision point saying no (a wire `reason_code`). `source: "client"` is a failure to obtain a valid answer
(`LocalDenyReason`). The two types never mix, and local reasons never pass through `parseDecision`.

## Wire reason codes

Only the 4 values of `decision_reason_code` are valid. Any other value is an invalid decision and a deny. A new wire value denies
until web moves `ci/ops-contract.pin`.

## Golden corpus

`__tests__/corpus.test.ts` runs the ops `examples/authorization_*` manifests through the client and pins the `golden/decision`
directory by DIGEST (`__tests__/testdata/decision-golden.digest`). Go runs the pdp and pep rows; this client runs none.

## For the first cache reader (no cache exists in this module)

1. A cache key must carry the session. A delegated allow keeps the base cache bound, which is right at the decision point.
2. An allow that carries Audit (owner exempt) is never served from cache. The wire has no audit member today, so a cache cannot
   honour that rule until it does.
3. Stale-revision rows join the golden corpus with that reader.
