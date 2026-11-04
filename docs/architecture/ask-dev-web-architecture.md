# Ask Dev in web: architecture and runbook

This page describes what is built on web main (`fd309c90`), ask-dev as web pins it (`6124ba52`, `package.json:56`; every ask-dev path below was read at that commit), acr main (`b164f9792`) and ops main (`6a9c19282b`) when it was written. It covers the data path, the deadline chain, the run lifecycle, the partition, the admission states, the gates, and the order to turn it on and off. Sibling pages: [Ask Dev in web](../ask-dev.md) (what the user sees) and [the thread seam](ask-dev-thread-seam.md) (the conversation store).

## Status

- **Built** on web main. The askdev-1 stack is set up for it (deploy values files, below); this page did not re-test askdev-1.
- **Off in prod.** The browser client is configured only when `ACR_OAUTH_ISSUER` is set; the code comments state that prod sets it only in the T13 roll (`src/lib/ask-dev/acr-browser-config.ts:23`, `src/lib/ask-dev/acr-transport/index.ts:32`), and the check is `src/lib/acr/config.ts:161`. With it unset, the panel draws no composer. In the deploy repo, a test fails if the prod ACR values turn the event stream flag on (`tests/test-acr-prod-direct-browser.sh:31-32`, CHAOS-11967). No date is promised here.
- The askdev-1 values files in the deploy repo (`kiac/askdev-1/values/values.askdev-web-acr.yaml`) cite older pins than web main, so askdev-1 can lag what this page describes.

## Data path

The browser calls ACR directly with an ACR OAuth credential (`fcacr_` token). Web serves no data route for Ask Dev.

| Step                                                                                     | Where                                                                                                                                      |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Web mounts the one render, `AskDevChat`, from `@full-chaos/ask-dev/render` (CHAOS-12378) | `src/components/ask-dev/AskDevRender.tsx`, `AskDevPanel.tsx`, `AskDevFullPage.tsx`                                                         |
| The host seam: conversation store and transport                                          | `src/components/ask-dev/conversation/chatSource.tsx`, `src/lib/ask-dev/acr-transport/browserTransport.ts`                                  |
| Silent authorization gets the token                                                      | `src/lib/ask-dev/acr-auth.ts`; the only web route is `POST /api/ask-dev/authorize` (`src/app/api/ask-dev/authorize/route.ts`, CHAOS-12474) |
| The page may call ACR's issuer origin                                                    | CSP `connect-src` gains exactly that origin, and only when `ACR_OAUTH_ISSUER` is set (`src/proxy.ts:200-210`)                              |
| The authorize route is rate-limited per user: 6 per window, fail closed                  | `src/lib/acr/service.ts:41-43`                                                                                                             |

Built: the Ops token is removed from browser session responses and a copy under another key fails closed (T19; `src/lib/authBrowserSession.ts:75-89,109-123`). Not found built: removing the web authorize route (T17).

## Deadline chain

Constants live in ask-dev `src/acr-client/deadline.ts`:

| Constant                      | Value                                                | Line             |
| ----------------------------- | ---------------------------------------------------- | ---------------- |
| `RUN_TIMEOUT_DEFAULT_MS`      | 120 s, how long the browser waits on one run         | `deadline.ts:4`  |
| `WAIT_BUDGET_HEADROOM_MS`     | 5 s kept back for ACR to compose a degraded answer   | `deadline.ts:7`  |
| `ACR_MIN_WAIT_BUDGET_SECONDS` | 10 s, the smallest budget ACR honours                | `deadline.ts:9`  |
| `HEADER_WAIT_MAX_MS`          | 15 s to wait for response headers (admission)        | `deadline.ts:12` |
| `STALL_MS`                    | 30 s with no bytes on an open stream means `stalled` | `deadline.ts:15` |

How they combine (`src/acr-client/transport.ts`): the transport sends the budget in `X-ACR-Wait-Budget-Seconds` (`:466`), computed from the deadline minus the headroom. A budget under 10 s is not sent at all: the call fails as `budget_exhausted` (`:446-473`). A stalled stream ends as `stalled` (`:638`). The web store adds `BUDGET_GRACE_MS` = 30 s, because ACR ends a run at its budget plus 30 s (`conversationStore.ts:85-86`).

ACR keeps the stream open with heartbeat and keepalive events at `ContextFabricInvestigationEventHeartbeatInterval` (acr `internal/api/context_fabric_event_stream.go:112-116`, `context_fabric_run_lease.go:83-87`). This page does not state that interval in seconds, because it was not checked.

Not found: a web-side keepalive timer, and a web outer deadline read from an environment variable. The 120 s is a constant in ask-dev.

## Run lifecycle

- **Streaming needs a flag.** With `ACR_CONTEXT_FABRIC_EVENT_STREAM_ENABLED` off (the default, `config.go:260`), a create request that asks for the event stream gets `406 stream_unavailable` before any admission work, and the panel says Ask Dev is not available.
- **Cancel by run id, detach and re-attach need the run lease.** `ACR_CONTEXT_FABRIC_RUN_LEASE_ENABLED` is off by default (`config.go:276`) and also needs the stream flag (`context_fabric_run_lease.go:125-127`). With it off the run routes answer not found (`context_fabric_run_routes.go:78-80`). The web Stop control is still offered for a running turn: for a run ACR cannot stop (no lease), and before ACR admitted the run, the disconnect is the cancel (`conversationStore.ts:603-604,1015-1020`). With the lease on, Stop asks ACR to cancel the run and keeps the stream open for the result, and a reload can attach to a running turn; ACR answers `410 cursor_expired` when a cursor is too old.
- **The store handles a lost run.** `run_lost` becomes `interrupted` (`conversationStore.ts:348`); a stall after the run was accepted tries one attach and up to two reattaches (`:77`, `:2211-2221`); a dropped run whose status shows no answer ends as `interrupted` (`:174-175`).
- **Retention is off by default.** The purge job needs `ACR_ASK_DEV_RETENTION_ENABLED` (`config.go:266`); web sends only `X-ACR-Thread-ID` per turn (`src/components/ask-dev/conversation/keys.ts:5`) and no retention header, so a web thread gets ACR's default.
- **Thread titles** use the first question only when `ACR_THREAD_LIST_FIRST_QUESTION_ENABLED` is on (default off, `config.go:284`).

## Partition

One conversation exists per (organization, user, impersonated user). The key is built in `partitionKey()` (`src/components/ask-dev/conversation/AskDevConversationContext.tsx:122`). A partition change clears the store (`conversationStore.ts:45`, `setPartition` at `:889`). Sign-out cancels and clears (`src/lib/ask-dev/acr-sign-out.ts`, `signOutCancel.ts`). Ask Dev is hidden while a user impersonates, but only when the browser ACR client is on: with the client off the hook returns `on` before it checks impersonation (`src/components/ask-dev/useAskDevAvailability.ts:36-38`).

Not built: revoking the previous session's ACR token when the user switches organization (T3b).

## Admission states

A submission is `running`, `done`, `done_unsaved` or `abandoned` (`conversationStore.ts:749-752`). ACR refusals the page can show (acr `internal/contextfabric/submission_limits.go:86-90`, `internal/api/context_fabric_submission.go`):

| Code                       | Meaning                                                                                                                                                                                                                                 |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `409 submission_mismatch`  | The key was reused for another request. A defect.                                                                                                                                                                                       |
| `409 submission_abandoned` | This key's run ended with no answer.                                                                                                                                                                                                    |
| `409 no_repository`        | The organization has no repository the caller may use.                                                                                                                                                                                  |
| `429 concurrency_limited`  | A per-principal or per-organization running-run limit: `ACR_ASK_DEV_MAX_RUNNING_PER_PRINCIPAL` (default 2, at most 16) and `ACR_ASK_DEV_MAX_RUNNING_PER_ORG` (default 4, at most 64) (acr `internal/config/config.go:329-334,590-594`). |
| `429 allowance_exhausted`  | The monthly platform run allowance. Default 1000, set by `ACR_ASK_DEV_MONTHLY_RUN_ALLOWANCE` (`config.go:334`).                                                                                                                         |

Refusals before a run are mapped to a reason in the store (`conversationStore.ts:243-276`):

| Reason           | ACR code it comes from                      | Same-key retry offered |
| ---------------- | ------------------------------------------- | ---------------------- |
| `access_denied`  | `access_denied`                             | no                     |
| `no_repository`  | `no_repository`                             | no                     |
| `not_entitled`   | `feature_not_enabled`, `insufficient_scope` | no                     |
| `repo_forbidden` | `repo_forbidden`                            | no                     |
| `budget_refusal` | `budget_refusal`                            | no                     |
| `rate_limited`   | `rate_limited`                              | yes                    |

The store also handles `submission_unsaved`, `submission_required`, `budget_exhausted` and `thread_closed` (`conversationStore.ts:2483-2521`). Web adds its own limit on the authorize route (see Data path). A USD cost ceiling is not found in code.

## Gates: who sees Ask Dev

| Flag                             | Effect                        | Source                                                                                                           |
| -------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `ask_dev`                        | ACR admits the caller         | ops `internal/apiservice/acr/access_store.go:225-228`: `AgentContextRuntime = askDev.Allowed OR runtime.Allowed` |
| `agent_context_runtime`          | the legacy grant; also admits | same lines                                                                                                       |
| `ask_dev_contextual_entrypoints` | page-context chips            | `CONTEXTUAL_ENTRYPOINTS_FEATURE`, `src/components/ask-dev/pageContext/AskDevPageContext.tsx:42`                  |

Web draws the launcher only when `ask_dev` AND `agent_context_runtime` are both on (`src/lib/ask-dev/surface.ts:49-51`). ACR admits on either. From that code, an organization with only `ask_dev` would be admitted by ACR and would not be shown the UI by web. This follows from reading `surface.ts:49-51` and `access_store.go:225-228`; it has not been reproduced. Both flags are registered in ops `internal/api/licensing/registry.go:17-18`.

ACR checks access on every call; the web gate only decides whether to draw the button.

## Turn it on and off

Order to enable (plan of record section 2.10 in Linear; no code enforces this order): the ACR event-stream flag, then the organization flags (`ask_dev`, `agent_context_runtime`), then `ask_dev_contextual_entrypoints`. Disable in the reverse order.

| Step turned off                     | What the user sees                                                                                                                                                                                                          |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ask_dev_contextual_entrypoints`    | No chips. Plain questions still work.                                                                                                                                                                                       |
| `ask_dev` / `agent_context_runtime` | The launcher is hidden.                                                                                                                                                                                                     |
| ACR event-stream flag               | `406 stream_unavailable`; the panel says Ask Dev is not available.                                                                                                                                                          |
| Retention job                       | Expired threads and results are still not served on any read after their `expires_at` (24 hours or 30 days after the last turn); the rows stay stored until the job removes them (`src/lib/acr/threadValidators.js:67-73`). |

ACR database migrations roll back with the ACR release, not with these flags. The prod enable steps (CHAOS-11967 for the stream flag, CHAOS-11968 for organization entitlements) are not done and wait on a prod decision.

## Environment

Web: `ACR_OAUTH_ISSUER`, `NEXT_PUBLIC_ACR_OAUTH_ISSUER`, `NEXT_PUBLIC_ACR_WEB_ORIGIN`, `ACR_API_ORIGIN`, `ACR_WEB_ASSERTION_AUDIENCE`, `ACR_WEB_ASSERTION_ISSUER`, `ACR_WEB_ASSERTION_KEY_FILE`, `ACR_WEB_ASSERTION_KID` (required by the authorize route, `src/lib/acr/config.ts:100-105`), `ACR_REQUEST_TIMEOUT_MS` (`src/lib/acr/config.ts`). ACR: `ACR_CONTEXT_FABRIC_EVENT_STREAM_ENABLED`, `ACR_CONTEXT_FABRIC_RUN_LEASE_ENABLED`, `ACR_ASK_DEV_RETENTION_ENABLED`, `ACR_THREAD_LIST_FIRST_QUESTION_ENABLED`, `ACR_ASK_DEV_MONTHLY_RUN_ALLOWANCE`, `ACR_ASK_DEV_MAX_RUNNING_PER_PRINCIPAL`, `ACR_ASK_DEV_MAX_RUNNING_PER_ORG`, `ACR_OAUTH_RESOURCES`, `ACR_OAUTH_BROWSER_CLIENTS`, `ACR_CORS_ALLOWED_ORIGINS`.

## Not built

T17 (remove the web authorize route), T3b (revoke the previous session on organization switch), a USD cost ceiling, a web-side keepalive timer. The 0-day and 30-day retention behaviour beyond the flag was not traced here.
