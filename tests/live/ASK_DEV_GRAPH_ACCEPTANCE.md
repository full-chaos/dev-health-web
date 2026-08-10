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

The gate fails closed when any value or the Compose readiness arm is missing.
It does not intercept browser routes, replace the provider, or turn an
unavailable graph into a passing native answer. It proves one stream/run and
client-side continuity from the app-wide `/diagnose` surface to `/dev`,
explicit fallback, ambiguity without first-candidate selection, and absence of
internal graph terminology in SSE, rendered copy, console output, and URLs.
