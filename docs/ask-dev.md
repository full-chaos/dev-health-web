# Ask Dev in web

Ask Dev is the product surface over Context Fabric (ACR). ACR resolves, authorizes and answers. There is one render, in the ask-dev repo: web mounts `AskDevChat` from `@full-chaos/ask-dev/render` on the panel, the mobile sheet and `/dev` (`src/components/ask-dev/AskDevRender.tsx`, CHAOS-12378). Web draws only its frame around it.

Web keeps what only a host has, behind ask-dev's `ChatSource` seam (`src/components/ask-dev/conversation/chatSource.tsx`): the conversation store and the ACR transport, the silent authorization, the partition and clear rules, the 401 rule, impersonation hiding and page context. A part the render lacks is built once, in ask-dev, never in web.

## Where Ask Dev is entered

From the launcher in the top bar (and the ⌘J / Ctrl+J shortcut and the command palette), which opens the panel; or from the left-nav row "Ask Dev", right after AI, which opens the full page `/dev` (CHAOS-12210, chris 2026-10-31). Both are listed only when the organization has `ask_dev` and `agent_context_runtime` on.

## Page context

A page can tell Ask Dev which entities it shows. The next question then sends them to ACR as hints. Sources: CHAOS-11936 (the registry), CHAOS-3584 (the chips and the hints), CHAOS-11938 (the pages).

- **How a page registers.** A server page renders `AskDevPageEntities` (`src/components/ask-dev/pageContext/AskDevPageEntities.tsx`). A client component calls `useAskDevPageContext`. Registering sends nothing.
- **ACR canonical ids only.** Build each `id` with `SUBJECT_ID` (`src/lib/ask-dev/page-context-ids.ts`) from the natural keys that ops serves:
    - `organization:<org id>`
    - `repository:<repos.id>`
    - `team:<teams.id>`
    - `pull_request:<repo id>:<number>`

    Never use a URL id, a GraphQL row id or a name. ACR commits a hint on the caller's identity only when the hint has its exact canonical id. Any other id falls back to a statistical match on the label.

    `SUBJECT_ID` is tested against the canonical-id vectors that ACR generates from its own builders, vendored at the ACR pin (CHAOS-12280). A new kind needs a builder there and a check against those vectors. ACR logs at most one counts-only Info line per subject resolution, `context fabric resolution trace: page hint lookup` (exact hit, label fallback and unresolved, by kind; acr `graphrank/tracer.go`), which shows any drift live.

- **One of each, bounded by the route map.** A page proposes each entity it shows, and only when there is exactly one of it. The approved routes, and the kinds each route takes, are in `PAGE_CONTEXT_ROUTES` (`src/lib/ask-dev/page-context.ts`). For example, complexity takes repositories only.
    - The organization goes first. It is proposed only when the shell and the session name the same organization.
    - A team or a repository is the scope that the page settles on after its scope bar's lock (`loadScopePageEntities`). A filter repository name becomes its id only when the served id-to-name map gives exactly one id for it.
- **Never sent:** filters, the time window, the role, a comparison, fingerprints, DOM text, or a person.
- **Chips.** The proposal shows as chips above the composer, before submit. The user can remove each chip.
    - Opening the panel sends nothing, and nothing is submitted on its own.
    - Navigation changes the proposal; it never changes a question that was already sent.
    - The chips that are left go with each next question as `requested_scope.subject_hints[]`, with `source: "ask_dev_page_context"`.
    - A hint never binds a subject: ACR resolves and authorizes it again on every call.
- **Gate.** The organization feature `ask_dev_contextual_entrypoints` must be on. Without it there are no chips and no page hints.

## Conversations: history, reload, reattach, feedback

A conversation is ACR's thread. The panel and `/dev` share one history; a reload or `/dev?thread=<id>` restores a conversation with no new investigation, and a delete works from either surface (CHAOS-11956). The seam calls, the selection rules, the restore barrier, the ownership tokens, the cancel state machine and the browser contract checks are in [`architecture/ask-dev-thread-seam.md`](architecture/ask-dev-thread-seam.md).

A history row is titled by its thread's first question when ACR serves `first_question` (CHAOS-12238). ACR serves it only while `ACR_THREAD_LIST_FIRST_QUESTION_ENABLED` is on, which is off by default.

- The question is inert text on one line, with the full text on hover or focus. The date and the question count are below it.
- With no first question (a legacy turn, or the switch off), or only blanks, the row keeps its name "Conversation of <date> · <n> questions". A row is never blank.
- The question is never logged and never reported.

An answer has "Correct?" and "Useful?" controls (CHAOS-11958). A clarification or a no-match has none.

- Each is yes or no. Pressing the chosen value again clears it. There is no free text.
- One state per answer, in the panel and on `/dev`. ACR stores it and authorizes every read and write. ACR's 404 hides the controls.
- A failed save is rolled back and says "Feedback was not saved."
- No feedback goes to product telemetry. The logs carry the result id and a status, never a choice.

## The browser's ACR transport

The browser calls ACR directly; no web route carries its data (CHAOS-12104). The design, the stream grammar, the caps, the deadline rules and the token rules are in [`architecture/ask-dev-thread-seam.md`](architecture/ask-dev-thread-seam.md) ("Seam calls").

- **Dark until the T13 roll.** With `ACR_OAUTH_ISSUER` unset, there is no transport: no composer, no request.
- **No connect step.** A user signed in to web never sees one: they ask, and the answer comes. "Authorizing silently" below says how.
- **Nothing on panel open.** A panel open sends 0 requests (P1-6). At the panel's width the rail is hidden, so a History read waits for the History toggle.

### Authorizing silently (CHAOS-12474)

This amends the direct browser design (Linear "Ask Dev: browser calls ACR directly with an ACR OAuth credential" §2.1, §2.2, §7). The redirect to ACR's `/authorize` is gone, with the `/ask-dev/oauth/start` and `/ask-dev/oauth/callback` pages. `/authorize` now runs from web's server, by a same-origin `POST /api/ask-dev/authorize`.

The browser stays the OAuth public client. It holds the PKCE verifier and runs the `/token` exchange. So this is not a data proxy, and the ruling against a server hop in front of ACR (CHAOS-3743) still holds: data calls go from the browser to ACR, with no web route between them.

1. The browser makes the verifier and the state, in the memory of one call, and reads ACR's metadata. It needs that for the token endpoint, and for the revocation endpoint the family keeps for sign-out.
2. It POSTs `{code_challenge, state}`. The shape is strict. The route takes the client, the redirect, the resource and the scope from its own config.
3. The route checks `Origin` and the session, reads Ops for impersonation, and refuses an impersonating session before any ACR call. It answers `no-store`, and logs one line: an enum and a status.
4. The route calls ACR's existing `GET /authorize` with the same parameters the browser sent before, on `ACR_API_ORIGIN`, like every server call. There is no cookie, and `redirect: "manual"`. A 302 to `{web origin}/acr/authorize?handle=<43 characters>`, with nothing else in it, is a success. Anything else is a named failure, and a 303 refusal is never followed.
5. `openOAuthConsent` approves the first-party client with no click. A client that reaches review is a loud failure. The route checks that the redirect URL is web's own callback, and answers `{code, state, iss}`. It never returns or logs the URL.
6. The browser checks `state`, the tab, the expiry and `iss` against the configured issuer, exchanges the code at `/token` with a form POST, and stores the tokens by the same rules as before.

The redirect URI stays registered, and the metadata document is unchanged: ACR requires both. ACR puts the code on that URL and web's server reads it there, so no browser lands on it and no page serves it. The proxy keeps the path public and `no-referrer`, so a stale URL with a code in it gets a 404 and never a sign-in redirect that copies the code.

`ACR_OAUTH_CONSENT_URL` must be `AUTH_URL`'s exact origin plus `/acr/authorize`, or every attempt is `bad_location`. `ACR_API_ORIGIN` may differ from the public issuer, and either may be http on a loopback host, where the config allows it.

**When it runs.** Only at a user act, or after a 401. `getAcrAccessToken()` never starts it; the transport does.

| Moment                                                                         | Runs the silent step                                          |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| A question, and its Retry                                                      | Yes                                                           |
| History on screen (the toggle, the rail on `/dev`)                             | Yes. The render asks for the list only while it is on screen. |
| A conversation opened by a row or by the `/dev` URL                            | Yes                                                           |
| Evidence opened, and Try again on it or on a thread                            | Yes                                                           |
| A 401 on any call                                                              | Yes, once. One resend, then a failure: never a loop.          |
| A panel open                                                                   | No: it sends 0 requests                                       |
| A restore from the tab's hint, a status poll, a replay, feedback, Stop, delete | No. With no token, these send nothing.                        |

**One at a time.** One attempt runs per tab, and every caller that comes while it runs shares it, a failure too. Each tab holds its own family.

**When it fails.**

| What happened                    | What the user sees                                                                                  |
| -------------------------------- | --------------------------------------------------------------------------------------------------- |
| ACR, web or the network failed   | "The question could not be sent. Try again." with Retry. History and evidence keep their Try again. |
| ACR's limit (429)                | "Too many questions in a short time." with Retry. Nothing retries or waits by itself.               |
| The web session has ended        | The normal sign-in, then back to this page                                                          |
| Impersonating, or a race into it | Ask Dev says it is not available. No code and no token.                                             |
| No Agent Context Runtime         | "Ask Dev is not available for this organization."                                                   |

History before a token is never `ready`, so it never reads "No conversations yet.": it reads "Loading conversations…" while the silent step runs, then the list, or "History could not be read." with Try again. Each Try again is one click and one attempt.

**Limits.** ACR limits `/authorize` per source, at 10 a minute, and all users now share web's address. That stays as it is for now (the lead's ruling on CHAOS-12474). Web's route gives each user 6 attempts a minute, so one user cannot take all of ACR's bucket. An attempt is per tab, every act in a tab shares it, and a reload keeps the family, so a person meets this only with more than 6 new tabs in a minute, Try again clicks included.

- The check runs after the session and impersonation checks, and before any ACR call. A caller with no session, or an impersonating one, spends nothing.
- A refused call is 429 `user_rate_limited`, with `Retry-After` and `no-store`. The browser shows the same words and Try again as for ACR's limit, and tries nothing by itself.
- The limiter is the one `/api/acr/authorize` uses: a fixed window in Redis, keyed by user id, so every web replica counts in one budget. It has no in-memory fallback, and it fails closed: while Redis is unreachable, each attempt is refused, and a tab that holds a token or a family is not affected. A production boot needs `REDIS_URL`. A local `next dev` with no Redis refuses every attempt.

## Evidence

Each reference under an answer is a button, with ACR's served label. It opens the app's one evidence drawer, and web reads that reference with its own ACR access, scoped to the answer that cited it (CHAOS-12105). Two answers that cite one reference each open their own citation. Ask-dev's render draws the body; it holds no token and reads nothing.

- **One right drawer at a time.** The drawer takes the right edge from the panel. The conversation stays in the store, and closing the drawer brings the panel back. If another drawer takes the edge, the panel stays closed.
- **Each state has its own words:** the evidence, out of date, partly withheld, not available (the same words for a reference that is gone and one the viewer may not see, with no id), no access, no repository in scope, and could not be read.
- **Try again** shows only when ACR says another read can help, or when the silent step failed. It reads the same reference for the same answer.
- **An org switch** closes the drawer, so one org's evidence never stays on screen in another.

## The live acceptance suite

`tests/live/ask-dev` holds Phase 1's live cases (CHAOS-11933). It runs against a deployed stack, not in CI: `pnpm test:e2e:live:ask-dev`. It has no skips: with no ACR, no stream, no data or no oracle it goes red, and `ci/live-e2e-skip-gate.mjs` reads its report.

- **`phase1.spec.ts`** sends no question.
- **`routed.spec.ts`** sends real questions, so a run needs acr's `modeloracle` (acr `docs/fullstack-acceptance.md` §6.2), never a real model. Write each run's plan with `npx tsx tests/live/ask-dev/make-plan.ts <acr plan> <output> <nonce>`: ACR reuses a stored answer, so a run needs fresh questions.
- **The stack needs** the oracle env of §6.2, `ACR_CONTEXT_FABRIC_RUN_LEASE_ENABLED=true`, and the egress block as a second guard. Check ACR's model receipts after a run.
- **Env:** `ASK_DEV_LIVE_WEB`, `ASK_DEV_LIVE_ACR`, `ASK_DEV_LIVE_EMAIL`, `ASK_DEV_LIVE_PASSWORD_FILE` (a 0600 file), `ASK_DEV_LIVE_THREAD` (a stored conversation with one ref cited by two answers), `ASK_DEV_LIVE_ORACLE` and `ASK_DEV_LIVE_NONCE`.
- **Limits:** the auth service allows 20 logins in 15 minutes per IP, so each spec file signs in once. ACR allows one principal 60 requests a minute, and web allows one user 6 silent authorizations a minute, so the suite waits 10 s between cases.

## Answer completeness

An ACR answer's `completeness.state` (`complete`, `partial`, `degraded`, `not_derived`) is a machine field for programs. The render never shows it (CHAOS-12245, chris 2026-10-31). The rules live in ask-dev's render (`src/lib/missing-data.ts`, `CompletenessPanel`, CHAOS-12429):

| State                                           | The Completeness panel                                                                                                                          |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `complete`                                      | nothing extra                                                                                                                                   |
| `not_derived`, or no completeness on the result | nothing about completeness                                                                                                                      |
| `partial`, `degraded`                           | at most one plain sentence from the requirement rows: "Missing data: state narrowed (2 of 5); ranking unavailable." None if no row names a gap. |

- The state word never appears in the sentence. A row with an empty obligation is named by its requirement; a row that names nothing is skipped. There is no table over `outcome`: the sentence uses the generic path until ACR serves labels (CHAOS-12416, CHAOS-12417).
- The raw values stay in `data-terminal-status` and `data-completeness-state`, for programs. `terminal_reason` sits in a closed fold, because a value can hold a state word.
- A cohort member's `data_completeness` is never shown either. The ranking column and the unranked summary show the member's served driver rows, "3 of 5 drivers" (`memberDriversText`), never a number mapped from the state. A member that serves no driver rows shows nothing.
- The status pill and the correction note wait for served labels (CHAOS-12417): no table over `status`. Their behavior stays CHAOS-12245's: "Full answer" only when the status and the completeness are both complete.
