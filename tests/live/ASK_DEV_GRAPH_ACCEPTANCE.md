# Graph-assisted Ask Dev acceptance

`playwright.ask-dev-graph-acceptance.config.ts` is an explicitly armed,
production-shaped gate. The canonical Ops Compose launcher/CI job opts in by
setting `ASK_DEV_GRAPH_LIVE_ACCEPTANCE=1` and `ASK_DEV_COMPOSE_WEB_READY=1`,
then invokes:

```sh
./node_modules/.bin/playwright test --config=playwright.ask-dev-graph-acceptance.config.ts
```

It must run against a backend whose runtime capabilities response exposes
`backend_sha`, `build_sha`, `commit_sha`, or `x-backend-sha`; the value is
compared with `ASK_DEV_GRAPH_ACCEPTANCE_BACKEND_SHA`. An environment variable
alone is never accepted as backend identity.

Required oracle values are supplied by the launcher:

- graph, fallback, and ambiguity questions;
- expected graph and fallback states;
- backend SHA.

The graph and fallback questions must be distinct. The launcher must also set
`ASK_DEV_GRAPH_ACCEPTANCE_FALLBACK_ARM=1` only after it has armed a
deterministic graph-unavailable seam for the fallback question. Repeating the
graph question and assuming runtime state changes between requests is not an
acceptance oracle.

The gate fails closed when any value or the Compose readiness arm is missing.
It does not intercept browser routes, replace the provider, or turn an
unavailable graph into a passing native answer. It proves one stream/run and
client-side continuity from the app-wide `/diagnose` surface to `/dev`,
explicit fallback, ambiguity through the existing clarification/error terminal
without first-candidate selection, and absence of internal graph terminology
in SSE, rendered copy, console output, and URLs. Ambiguity must not fabricate
an `answer.completed` payload: the authorized `scope.resolved` frame carries
the ambiguous outcome and candidates before the safe error terminal.
