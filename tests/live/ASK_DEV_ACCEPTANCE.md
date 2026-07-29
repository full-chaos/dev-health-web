# Ask Dev full-stack acceptance

This gate proves the canonical retained Ask Dev workflow through real browser,
Web BFF, Ops REST/SSE, Postgres persistence, ClickHouse-backed tools, and the
deterministic OpenAI-compatible acceptance provider. It must not use MSW,
Playwright route interception, or an Ops dependency override.

## Runtime contract

The canonical Ops acceptance launcher boots the migrated and fixture-seeded
Compose stack, including Web, Ops, PostgreSQL, ClickHouse, and the scripted
OpenAI-compatible provider. It explicitly enables the fixture organization,
runs the real readiness action, and arms the browser gate. The acceptance
provider is exposed through the normal production-compatible provider path:

```text
ENVIRONMENT=acceptance
ASK_DEV_LIVE_ACCEPTANCE=1
LLM_PROVIDER=openai
ASK_DEV_ACCEPTANCE_OPENAI_BASE_URL=http://ask-dev-scripted-openai:8001/v1
ASK_DEV_ACCEPTANCE_OPENAI_API_KEY=<non-empty acceptance-only credential>
```

Ops must require both `ENVIRONMENT=acceptance` and
`ASK_DEV_LIVE_ACCEPTANCE=1` before enabling the loopback acceptance provider.
The product provider family remains `openai` with source `platform`; the test
does not select the internal scripted provider through production policy.

The deterministic provider must return a grounded `dev_answer.v1` for:

```text
How did completed work change in this scope during the selected time range, and
what evidence supports it?
```

The question and required answer parts come from the checked-in versioned Ops
oracle and are supplied to Web as `ASK_DEV_ACCEPTANCE_QUESTION` plus the three
`ASK_DEV_ACCEPTANCE_EXPECTED_*` fields. The browser
independently reconstructs the exact `direct_summary` from the returned current
and comparison values and requires one observed claim to cite that exact metric
and a `meridian/web-app` evidence reference. Capabilities must report
`ask_dev`, `can_read`, `contextual_entrypoints`, and `evidence_resolver` enabled,
`agent_context_runtime` disabled, `readiness=ready`, and
`effective_model_label=ask-dev-scripted-v1`.

## Run

```console
/path/to/dev-health-ops/scripts/acceptance/run_ask_dev_compose.sh \
  --web-root /path/to/dev-health-web
```

The Playwright command fails during configuration unless the launcher supplies
the acceptance opt-in, the Compose-Web readiness marker, and the exact question
oracle. The ordinary `test:e2e:live` suite excludes this spec because
its generic Ops service does not start the deterministic provider.

The browser assertion opens the typed Data Health entry point without
submitting, explicitly asks the fixture question in the permanent window,
validates the raw versioned SSE stream, continues the same in-memory run into
`/dev`, reloads, reopens retained history, and rejects any duplicate
conversation or message POST.
