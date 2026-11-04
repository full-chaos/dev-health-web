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
    - `work_item.v2:<repo id>:<work_item_id>`, each segment with `%` as `%25` and `:` as `%3A`, and none over 256 characters. The issue page states it only when ops serves the work item's one repository (CHAOS-12240, CHAOS-12563).

    Never use a URL id, a GraphQL row id or a name. ACR commits a hint on the caller's identity only when the hint has its exact canonical id. Any other id falls back to a statistical match on the label.

    `SUBJECT_ID` is tested against the canonical-id vectors that ACR generates from its own builders, vendored at the ACR pin (CHAOS-12280). A new kind needs a builder there and a check against those vectors. ACR logs at most one counts-only Info line per subject resolution, `context fabric resolution trace: page hint lookup` (exact hit, label fallback and unresolved, by kind; acr `graphrank/tracer.go`), which shows any drift live.

- **One of each, bounded by the route map.** A page proposes each entity it shows, and only when there is exactly one of it. The approved routes, and the kinds each route takes, are in `PAGE_CONTEXT_ROUTES` (`src/lib/ask-dev/page-context.ts`). For example, complexity takes repositories only.
    - The organization is proposed only when the page has no narrower entity (`proposePageContext`), and only when the shell and the session name the same organization. A page that shows one repository or one team is about that entity: with the organization beside it, a repository ACR cannot resolve falls to an organization-level answer and nothing says so (CHAOS-12215).
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

1. The browser reads the web principal. If it cannot, it makes no attempt: no POST and no code. A code is bound to the session that asked, and the exchange compares the two, so another user can never get it.
2. The browser makes the verifier and the state, in the memory of one call, and reads ACR's metadata. It needs that for the token endpoint, and for the revocation endpoint the family keeps for sign-out.
3. It POSTs `{code_challenge, state}`. The shape is strict. The route takes the client, the redirect, the resource and the scope from its own config.
4. The route checks `Origin` and the session, reads Ops for impersonation, and refuses an impersonating session before any ACR call. It answers `no-store`, and logs one line: an enum and a status.
5. The route calls ACR's existing `GET /authorize` with the same parameters the browser sent before, on `ACR_API_ORIGIN`, like every server call. There is no cookie, and `redirect: "manual"`. A 302 to `{web origin}/acr/authorize?handle=<43 characters>`, with nothing else in it, is a success. Anything else is a named failure, and a 303 refusal is never followed.
6. `openOAuthConsent` approves the first-party client with no click. A client that reaches review is a loud failure. The route checks that the redirect URL is web's own callback, and answers `{code, state, iss}`. It never returns or logs the URL.
7. The browser checks `state`, the tab, the expiry and `iss` against the configured issuer, exchanges the code at `/token` with a form POST, and stores the tokens by the same rules as before.

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

| What happened                                                             | What the user sees                                                                                  |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| ACR, web or the network failed                                            | "The question could not be sent. Try again." with Retry. History and evidence keep their Try again. |
| ACR's limit, or this user's budget (429)                                  | "Too many questions in a short time." with Retry. Nothing retries or waits by itself.               |
| The web session has ended                                                 | The normal sign-in, then back to this page                                                          |
| The session cannot be read, and `/api/auth/session` does not say it ended | "The question could not be sent. Try again." with Retry, and no attempt.                            |
| Impersonating, or a race into it                                          | Ask Dev says it is not available. No code and no token.                                             |
| No Agent Context Runtime                                                  | "Ask Dev is not available for this organization."                                                   |

ACR's over-limit 503 (CHAOS-12469) cannot reach the silent step: ACR's `/authorize`, `/authorize/consent` and `/token` run no access read. It comes on the first data call after it, and that call keeps its own no-retry state.

The 60 s session validation can end a session during an attempt. Then `auth()` holds no access token, so the proxy or the route refuses it, no code is given, and the browser goes to sign-in.

History before a token is never `ready`, so it never reads "No conversations yet.": it reads "Loading conversations…" while the silent step runs, then the list, or "History could not be read." with Try again. Each Try again is one click and one attempt.

**Limits.** ACR limits `/authorize` per source, at 10 a minute, and all users now share web's address. That stays as it is for now (the lead's ruling on CHAOS-12474). Web's route gives each user 6 attempts a minute, so one user cannot take all of ACR's bucket. An attempt is per tab, every act in a tab shares it, and a reload keeps the family, so a person meets this only with more than 6 new tabs in a minute, Try again clicks included.

- The check runs after the session and impersonation checks, and before any ACR call. A caller with no session, or an impersonating one, spends nothing.
- A refused call is 429 `user_rate_limited`, with `Retry-After` and `no-store`. The browser shows the same words and Try again as for ACR's limit, and tries nothing by itself.
- The limiter is the one `/api/acr/authorize` uses: a fixed window in Redis, keyed by user id, so every web replica counts in one budget. It has no in-memory fallback, and it fails closed: while Redis is unreachable, each attempt is refused, and a tab that holds a token or a family is not affected. A production boot needs `REDIS_URL`. A local `next dev` with no Redis refuses every attempt.

## Charts in an answer

Ask-dev's render checks each rich shape against the answer's own rows, then hands web only a verified shape through its `slots.shape` seam. Web's adapter, `askDevShapeChart` (`src/components/ask-dev/askDevShapeCharts.tsx`), maps that shape to the props of an existing web chart. It draws nothing itself and derives no number: every value and every word comes from the shape.

- **Treemap** (`investment_theme_share`, CHAOS-12496): `TreemapChart`, one tile per theme share above 0.
- **Sankey** (`investment_repository_flow`, CHAOS-12581): `SankeyChart`, one team's effort from its repositories to the themes. A node is a repository word or a theme word, a link is a point's exact value, and a zero link stays in the value table. The node names are drawn as served (`verbatimNodeNames`). Web's entity-label rule keeps only a path's last segment, so it would draw "acme/web" as "web", and two repositories could share a word (CHAOS-4690). The tooltip shows a small value as "<0.1", never "0".
- **No chart** for any other shape, or for a shape the adapter cannot draw (a sankey with fewer than 2 repositories with effort, a unit on a sankey). The adapter returns `null`, and ask-dev then shows its value table and the line that says the chart is not shown here (CHAOS-12538).
- **On demand:** each chart module loads only when its shape draws, so an answer with no rich shape loads no chart code.
- **Reduced motion:** a reader who asks for reduced motion gets no chart animation.

## Evidence

Each reference under an answer is a button, with ACR's served label. It opens the app's one evidence drawer, and web reads that reference with its own ACR access, scoped to the answer that cited it (CHAOS-12105). Two answers that cite one reference each open their own citation. Ask-dev's render draws the body; it holds no token and reads nothing.

- **One right drawer at a time.** The drawer takes the right edge from the panel. The conversation stays in the store, and closing the drawer brings the panel back. If another drawer takes the edge, the panel stays closed.
- **Each state has its own words:** the evidence, out of date, partly withheld, not available (the same words for a reference that is gone and one the viewer may not see, with no id), no access, no repository in scope, and could not be read.
- **Try again** shows only when ACR says another read can help, or when the silent step failed. It reads the same reference for the same answer.
- **An org switch** closes the drawer, so one org's evidence never stays on screen in another.

## The live acceptance suite

`tests/live/ask-dev` holds Phase 1's live cases (CHAOS-11933). It runs against a deployed stack, not in CI: `pnpm test:e2e:live:ask-dev`. It has no plain skips: with no ACR, no stream, no data or no oracle it goes red, and `ci/live-e2e-skip-gate.mjs` reads its report. The gate lists two outcomes on their own and never counts them as a pass (CHAOS-11946): **NOT RUN**, a skipped case with a `NOT RUN` annotation (a view behind a flag that is off), and **KNOWN GAP**, a `test.fail` case with a `KNOWN GAP` annotation. A KNOWN GAP that starts to pass turns red, and the case is flipped. Only the case itself counts, because Playwright copies `describe` and file annotations onto every case: a NOT RUN case's own title contains `[behind a flag]` and every `test.skip` reason starts with `NOT RUN`; a KNOWN GAP case's own title contains `[KNOWN GAP` and every `test.fail` reason starts with `KNOWN GAP`. `pnpm test:e2e:live:ask-dev` does not run the gate itself: after a run, `node ci/live-e2e-skip-gate.mjs "$LIVE_E2E_JSON" ask-dev` judges its report.

- **`phase1.spec.ts`** sends no question.
- **`phase2.spec.ts`** (CHAOS-11940) holds exits P2-1 to P2-5 and sends 8 questions through the oracle. P2-4 is CHAOS-3598's: the review-latency question from a repository page and from `/dev`, twice each. "A repository page" is `/metrics` scoped to one repository: web has no repository detail page (lead's ruling on CHAOS-11899). P2-6 is CHAOS-11939's. Traces stay off, because bearers are on these pages: a page that never draws fails with what it was waiting for (`watchPageLoad`).
- **`phase3.spec.ts`** (CHAOS-11946) proves each rich view renders live from the answer's served `render_shapes`: the completion forecast and its dated trend on an elapsed-time axis, the investment treemap, the side-by-side comparison table (two repositories on pull request window measures), and the cohort ranking with its charts in served rank order, 2 replicates each, plus axe AA on the panel and `/dev` with charts open. A drawn view's value table must state every served point exactly (`tests/live/ask-dev/rich-views.ts`); a view the answer did not serve fails as NOT CAPTURED. The quadrant case asks for a stated range that ends on a day both teams hold landscape rows (CHAOS-12676: a current-axis question reads each team at its own newest day, and acr serves a quadrant only for teams on one day). Sankey and sunburst are NOT RUN unless `ASK_DEV_LIVE_SANKEY=1` / `ASK_DEV_LIVE_SUNBURST=1`. With the flag on, the sankey case (CHAOS-12582) asks for one team's effort across its repositories, checks the drawn value table against the served shape in the panel and on `/dev`, and takes a desktop and a phone screenshot of each. The sunburst case (CHAOS-12554, CHAOS-12910) asks for one repository's effort by theme and subcategory, checks that no treemap is served beside the sunburst, and checks the drawn value table and takes the screenshots the same way. Its questions are `RICH_CASES` in `questions.ts`, scripted by `make-plan.ts` (`claim_fields` and `claim_first_only` need acr's modeloracle from main bbe95afa or later; the sankey's and the sunburst's `claim_detail_tables` need the one with CHAOS-12857).
- **`history.spec.ts`** (CHAOS-12232) proves history and reload recovery through the browser transport. A hard reload, then back and forward, on `/dev?thread=<id>` draws the thread's turns once each, in order, from the thread read, with no create; the panel then goes on with the same thread. A hard reload while the thread's first turn is held finds it through the thread read, with no create. A delete in the panel takes the thread off `/dev`'s History, and the reverse. A list or a read that ACR answered before a delete, held in the browser with `page.route` until the delete's 204, does not bring the thread back. Its AC-3 (another principal of the same org) is `other-principal.spec.ts` (CHAOS-12883).
- **`reattach.spec.ts`** (CHAOS-12233) proves reattach and cancel with the run lease on. An attach after a lost create stream resumes the events with no `seq` gap; ACR's log (read by the stack operator) says which replica served it. An attach with a `Last-Event-ID` ACR never issued gets 410 `cursor_expired`, then the store reads the status and replays. Stop on a long run is taken, and the oracle sees no synthesis start after it; ACR's own `t_req`, `t_eff` and attempt lines are read from its log. A cancel after a finished result changes nothing. A reload during a long run restores it: its cursorless attach replays `accepted` (the run's deadline D), sends `: keepalive` through its silences, and no wait outlives D. Pod loss is `[behind a flag]` (`ASK_DEV_LIVE_POD_LOSS=1`): the stack operator deletes the run's pod during the case. Its streams are read in the page (`stream-chunks.ts`), each chunk with its arrival time.
- **`other-principal.spec.ts`** (CHAOS-12883) proves INV-1 live with a second principal of the owner's organization (`ASK_DEV_LIVE_OTHER_EMAIL`, `ASK_DEV_LIVE_OTHER_PASSWORD_FILE`; the same grants, an admin where the owner is the owner). Threads: the other principal's read of the owner's thread is ACR's neutral 404 (equal to the 404 of a thread that never existed), its History list (API pages and the panel's rows) does not include the thread, and its DELETE is 204 with the owner's thread unchanged. Runs: its attach to, and cancel of, the owner's in-flight run are 404 (equal to those of a run that never existed), and the owner's run completes. Each case first does the same call on the other principal's OWN thread or run (a 200, a 204 that removes the thread, a 202 or 204 cancel), because a 404 alone could mean the other principal reads nothing at all.
  CHAOS-11960 adds AC-10 here: the other principal makes two creates by hand with its own bearer. A turn whose `parent_result_id` is the OWNER's result is refused, with the same answer as a parent that never existed. A turn naming the OWNER's `thread_id` changes nothing in the owner's thread (the same turns and results before and after), and what the other principal reads under that id holds none of the owner's turns.
- **`usage-retention.spec.ts`** (CHAOS-11960, E6 AC-6) runs in two stack windows (`ASK_DEV_LIVE_WINDOW=ac6_prepare`, then `ac6_after` with `ASK_DEV_LIVE_AC6_THREAD`). `ac6_prepare` admits one retention-0 turn and prints the conversation's id. The stack operator then sets the month's allowance to the current usage, back-dates that conversation and runs ACR's retention purge. `ac6_after` finds the conversation gone (404, not listed). With `ASK_DEV_LIVE_ALLOWANCE_GATED=1` it also asks for a new submit and expects 429 with `Retry-After`: the purge did not return the allowance. That half holds only for runs the allowance counts (the platform model's); on askdev-1 org 70d529e0, answered by its own BYO model, a submit at usage == allowance was admitted (2026-11-04), so it is not asserted there. The operator restores the allowance and reads it back.

### Phase 4 acceptance map (CHAOS-11960, plan v5 E6 AC-1..12)

| AC                                                                                             | Proof                                                                                                                                 | Where                                                                                                                                        |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 pins at the train SHA                                                                        | web's pin-drift CI check (the pins moved on to a later acr main; the check holds them equal to acr main)                              | web `ci/` pin check                                                                                                                          |
| 2 reload and back recover turns, zero POST                                                     | live                                                                                                                                  | `history.spec.ts`                                                                                                                            |
| 3 INV-1 negatives (thread, feedback, attach, cancel)                                           | live                                                                                                                                  | `other-principal.spec.ts`, `feedback.spec.ts`                                                                                                |
| 4 retention 0 and 30 on back-dated rows, org purge                                             | acr integration drill, real Postgres                                                                                                  | acr `pginvestigation/retention_drill_integration_test.go`                                                                                    |
| 5 lifecycle: attach from the other replica, cancel `t_eff` bound, pod kill, 410, event-log cap | live for attach, 410, cancel, pod loss (`ASK_DEV_LIVE_POD_LOSS=1`); the 128-event cap and a cancel in the retry backoff are acr tests | `reattach.spec.ts`; acr `TestTheRunLogIsBoundedAndGoesWithItsRecordOnPostgres`, `TestNoModelAttemptStartsAfterTheRunIsCancelledInTheBackoff` |
| 6 usage survives retention                                                                     | live on the deployed stack; acr integration test                                                                                      | `usage-retention.spec.ts`; acr `TestTheUsageAggregateGatesAndOutlivesItsRecords`                                                             |
| 7 attach keepalive and nested budgets                                                          | live                                                                                                                                  | `reattach.spec.ts` 4a/4c                                                                                                                     |
| 8 project-only org completes an investigation                                                  | NOT PROVEN: blocked by CHAOS-11959 (web serves no-repository organizations)                                                           | none yet                                                                                                                                     |
| 9 Phase 4 web routes: production-build reachability                                            | the owning issues (CHAOS-11956, 11957, 11958)                                                                                         | per route                                                                                                                                    |
| 10 parent result re-authorized, another principal's thread id does not join                    | live                                                                                                                                  | `other-principal.spec.ts` AC-10                                                                                                              |
| 11 feedback set, read back, owner-checked                                                      | live                                                                                                                                  | `feedback.spec.ts`                                                                                                                           |
| 12 delete from either surface                                                                  | live                                                                                                                                  | `history.spec.ts`                                                                                                                            |

- **`routed.spec.ts`** sends real questions, so a run needs acr's `modeloracle` (acr `docs/fullstack-acceptance.md` §6.2), never a real model. Write each run's plan with `npx tsx tests/live/ask-dev/make-plan.ts <acr plan> <output> <nonce>`: ACR reuses a stored answer, so a run needs fresh questions.
- **The stack needs** the oracle env of §6.2, `ACR_CONTEXT_FABRIC_RUN_LEASE_ENABLED=true`, and the egress block as a second guard. Check ACR's model receipts after a run.
- **Env:** `ASK_DEV_LIVE_WEB`, `ASK_DEV_LIVE_ACR`, `ASK_DEV_LIVE_EMAIL`, `ASK_DEV_LIVE_PASSWORD_FILE` (a 0600 file), `ASK_DEV_LIVE_THREAD` (a stored conversation with one ref cited by two answers), `ASK_DEV_LIVE_ORACLE` and `ASK_DEV_LIVE_NONCE`.
- **A real model (CHAOS-11960):** `other-principal.spec.ts` and `usage-retention.spec.ts` accept `ASK_DEV_LIVE_REAL_MODEL=1` in place of the oracle, for a stack whose organization is answered by its own saved model. A question then costs a real call, so each case asks the fewest turns it needs. With neither the oracle nor the flag, no question is sent.
- **Limits:** the auth service allows 20 logins in 15 minutes per IP, so each spec file signs in once. ACR allows one principal 60 requests a minute, and web allows one user 6 silent authorizations a minute, so the suite waits 10 s between cases.

## Answer completeness

An ACR answer's `completeness.state` (`complete`, `partial`, `degraded`, `not_derived`) is a machine field for programs. The render never shows it (CHAOS-12245, chris 2026-10-31). The rules live in ask-dev's render (`src/lib/missing-data.ts`, `CompletenessPanel`, CHAOS-12429):

| State                                           | The Completeness panel                                                                                                                          |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `complete`                                      | nothing extra                                                                                                                                   |
| `not_derived`, or no completeness on the result | nothing about completeness                                                                                                                      |
| `partial`, `degraded`                           | at most one plain sentence from the requirement rows: "Missing data: state narrowed (2 of 5); ranking unavailable." None if no row names a gap. |

- The state word never appears in the sentence. A row with an empty obligation is named by its requirement; a row that names nothing is skipped. There is no table over `outcome`: the sentence reads the word ACR serves in `vocabulary_labels`, else the generic path (CHAOS-12417).
- The raw values stay in `data-terminal-status` and `data-completeness-state`, for programs. `terminal_reason` sits in a closed fold, because a value can hold a state word.
- A cohort member's `data_completeness` is never shown either. The ranking column and the unranked summary show the member's served driver rows, "3 of 5 drivers" (`memberDriversText`), never a number mapped from the state. A member that serves no driver rows shows nothing.
- The status pill and the correction note read `vocabulary_labels` (CHAOS-12417): no table over `status`. ACR composes the words, so "Full answer" shows only when the status and the completeness are both complete. With no map, or no status key, an answered status reads the neutral "Answer", the note is left out, and `no_match` and `clarification_required` have no pill. The labels flag is off by default, so this is the path until it is on. A withheld ranking arrives with no map too.
- The requirement outcomes table, the plan family and `rollup_basis` are in closed folds. With no outcomes there is no table and no sentence: that would only restate the state.
