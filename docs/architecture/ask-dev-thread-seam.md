# Architecture: Ask Dev thread seam (history, reattach, feedback)

**Status:** Authoritative. History and reload recovery are built (CHAOS-11956). Reattach and cancel (CHAOS-11957) and answer feedback (CHAOS-11958) follow this design.
**Scope:** dev-health-web: how the browser reads, restores, deletes and observes Ask Dev conversations held by ACR.
**Design of record:** E6 web design v5. It went through three astra review rounds, with the triage on Linear CHAOS-11956. This page is its repo summary.
**Code:** `src/components/ask-dev/conversation/` (the seam is `transport.ts`; the store is `conversationStore.ts`).

## The one rule

**ACR owns every conversation and every owner check.** The browser calls ACR directly through one seam, `AskDevTransport`. There is no web route. The store decides when to call and what each answer means. The browser keeps a session-storage hint and no copy of a thread. ACR's 404 is the same for every cause (another principal's thread, or an unknown, deleted, expired or malformed id), and the browser shows one neutral state for all of them.

## Seam calls

| Call                                     | ACR route                                            | Answer the store reads                                                                         |
| ---------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `listThreads`                            | `GET /api/v1/context-fabric/threads?limit&cursor`    | one page, newest first; the cursor is opaque, and a 400 means "read again from the first page" |
| `readThread`                             | `GET …/threads/{thread_id}?before`                   | the latest ≤ 100 turns in `(admitted_at, submission_id)` order, or `null` for a 404            |
| `deleteThread`                           | `DELETE …/threads/{thread_id}`                       | 204 for any well-formed id (a foreign id too); delete is not Stop                              |
| `readResult`                             | `GET …/investigations/{result_id}`                   | the replayed answer; 404 → "not available to you now"                                          |
| `submissionStatus`                       | `GET …/submissions/{submission_id}`                  | `running`, `done`, `done_unsaved` or `abandoned`                                               |
| `attach` _(11957)_                       | `GET …/submissions/{id}/events` with `Last-Event-ID` | the leased run's own events; 410 means fall back to status, then replay                        |
| `cancel` _(11957)_                       | `POST …/submissions/{id}/cancel`                     | 202 running, 204 final, 409 `not_leased`                                                       |
| `readFeedback` / `setFeedback` _(11958)_ | `GET`/`POST …/feedback/{result_id}`                  | `correct` and `useful`, each yes, no or unset                                                  |

`ACR_BROWSER_TRANSPORT` is `null` until T14 (CHAOS-12104). Test mode supplies `testModeTransport.ts`. The live proofs are CHAOS-12232, 12233 and 12234.

## Contract checks in the browser: Ajv standalone

Production CSP has no `unsafe-eval` (`src/proxy.ts`). The runtime Ajv of `src/lib/acr/contracts.ts` compiles with `new Function`, so it cannot run in the browser. Test mode allows eval, so runtime Ajv would pass every e2e and fail only live. Instead:

- `scripts/acr-contract-artifacts.mjs` generates `src/lib/acr/threadValidators.js` (and its `.d.ts`). This is Ajv standalone code for the thread schemas, built with the options of `contracts.ts`.
- The code is generated, not hand-written, so it cannot drift: `pnpm acr:contracts:check` fails on any edit, and the vitest suite runs it.
- `src/lib/acr/threadContract.ts` only maps a body that passed.
- A body that fails is `TransportFailure("invalid_upstream")`, and the conversation shows "could not be read".
- `threadContract.differential.test.ts` holds the generated code equal to `validateAcrContract`, over cases built from the schema files. It also checks that the code answers with `eval` and `Function` disabled.

Add a browser-read schema to `STANDALONE_VALIDATORS` in the generator. Never import `ajv` or `contracts.ts` into browser code.

## Selection: URL, storage and store

1. **Nothing is selected before the partition is known.** The partition is (org, principal, impersonated user).
2. **On `/dev`, the URL wins.** `/dev?thread=<id>` selects that thread. Back and forward select again.
3. **Bare `/dev`** keeps the store's conversation and names it in the URL. Expand pushes bare `/dev`.
4. **Elsewhere,** with no conversation shown, the session hint `ask-dev:thread` restores the last one. The hint holds `{thread_id, partition tag, expires_at}`. It is written when ACR admits a turn and on each read. It is cleared on delete, on a 404, on a new conversation and on a partition change. It is a hint, never authorization.
5. **Only a local selection writes the URL:** a history row, a new conversation, the first submit or a delete. An incoming selection (from the URL or the hint) never writes it, so back is never undone. The URL sync reads the store's current snapshot, not the render's.
6. **Selecting the thread already shown is a no-op.** A malformed or unavailable id gives a read-only neutral state with "New conversation".

7. **A composer draft belongs to one selection.** Any selection change or partition clear drops it, so it is never sent into another conversation or org.

## Store rules

- **Turn identity.** Each turn carries `threadId`, `origin` (`submitted` or `restored`) and `submissionId`, its stable key across pages. A restored turn has no request: it is never sent again, and its only action is "Load again", a GET. A question ACR did not record shows as "Question not recorded". It is left out of `conversation`, and its clarification is read-only. The parent reference reads only the immediate predecessor.
- **Restore barrier.** While a thread is read and its answers are replayed (at most 4 at a time, kept in the served order), the thread is `restoring` and submit is refused. A turn still `running` is observed through its status every 3 s, for at most 10 minutes. At that cap it says "The current state could not be confirmed". The composer stays closed while any run of the thread is running or observed.
- **Ownership tokens.** Every async commit first checks the token of what it writes. A late answer that fails the check is dropped, and Info logs `ask-dev stale answer dropped`.

    | Work                                                                 | Token                                            | Survives a thread switch                                     |
    | -------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------ |
    | Transcript (thread read, replays, earlier pages, observed runs, URL) | partition + selection                            | no                                                           |
    | History pages                                                        | partition + history revision                     | yes                                                          |
    | Delete tombstones                                                    | partition                                        | yes (a delete that lands after a switch still hides its row) |
    | Feedback _(11958)_                                                   | partition + `result_id` + write revision         | yes                                                          |
    | Attach _(11957)_                                                     | selection + run revision + attachment generation | no                                                           |

- **Leaving a conversation does not stop its run.** A switch, a new conversation or a delete _detaches_ the submitted run: the store keeps reading its stream to the terminal and commits nothing from it. ACR's run lease is behind a flag, and without a lease a disconnect ends the run. The store closes a detached stream at the run's deadline D. Only a partition change (org switch, impersonation, sign-out) or leaving the shell aborts it. A restored running turn stays observed until its final answer is read, so a follow-up always carries it.
- **History.** There is one list per partition, shared by the panel and `/dev`. Its tombstones filter every page, so a late page cannot bring a deleted row back.

## Reattach and cancel (CHAOS-11957, planned)

- **Attach.** A reload drops the stream, and a leased run continues on ACR. On attach, the store checks each event in a fixed order:
    1. ownership;
    2. `request_id`;
    3. an older event with the same payload: a duplicate, dropped with no `elapsed` check;
    4. a gap;
    5. for a new event, `elapsed` (non-decreasing, and at most 11 s more).

    After a gap or a protocol error, the store reattaches up to twice, then falls back to status.

- **Deadline.** Each observed run has one absolute D: in memory, the run's own; after a reload with `accepted`, `started_at` + `budget_seconds` + 30 s; otherwise the 10-minute observation window. Every wait is clamped to the time left.
- **Cancel state machine.**
    - Stop sends `cancel` and keeps the stream as the completion channel.
    - 202 → "Canceling…" until the terminal. A result that wins the race is kept.
    - 204 → the store reads the status and maps `done`, `done_unsaved` and `abandoned`.
    - 409 `not_leased` → "This run cannot be stopped. It ends on its own." No automatic second cancel.
    - `t_req` is ACR's time.

## Feedback (CHAOS-11958, planned)

- **One slice per `result_id`**, shared by every turn that shows the same answer.
- **Writes** are serialized and coalesced, each with a local revision. A failure rolls back only its own revision, and later choices are kept.
- **Not rated or not shown:** a never-rated answer reads `unset/unset`. A 404 hides the controls.
- **Telemetry:** none.

## Logs

There is no product telemetry. Info events are content-free: operation, outcome, counts, duration and ids, never a question, an answer, a URL or a flag value.

- Built: `ask-dev thread restored`, `ask-dev thread restore failed`, `ask-dev stale answer dropped` and `ask-dev observed run expired`.
- Planned: `attach selected` / `attach fell back` (11957) and `feedback saved` / `feedback not saved` (11958).

## Tests

- **Store:** `conversationStore.history.test.ts`.
- **Views:** `src/components/ask-dev/__tests__/AskDevHistory.test.tsx`.
- **Contract oracle:** `src/lib/acr/__tests__/threadContract.differential.test.ts`.
- **E2E:** `tests/ask-dev-history.spec.ts`.
