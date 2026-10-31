# Ask Dev in web

Ask Dev is the product surface over Context Fabric (ACR). web draws it: the panel, the `/dev` full page and the chips. ACR resolves, authorizes and answers.

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

    `SUBJECT_ID` is tested against the canonical-id vectors that ACR generates from its own builders, vendored at the ACR pin (CHAOS-12280). A new kind needs a builder there and a check against those vectors. ACR logs a counts-only `page hint lookup` line per request (exact hit, label fallback, unresolved), which shows any drift live.

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

## Answer completeness

An ACR answer's `completeness.state` (`complete`, `partial`, `degraded`, `not_derived`) is a machine field for programs. Web never shows it (CHAOS-12245, chris 2026-10-31). `missingDataSentence` and `quickStatus` (`src/components/ask-dev/answer/`) apply these rules:

| State                                           | The coverage block and the quick answer                                                                                                                                                      | The status pill, for a `complete` status            |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `complete`                                      | nothing extra                                                                                                                                                                                | "Full answer"                                       |
| `not_derived`, or no completeness on the result | nothing about completeness                                                                                                                                                                   | "Answer": it claims neither a full answer nor a gap |
| `partial`, `degraded`                           | at most one plain sentence that names what was missing, from the requirement rows: "Missing data: status read in part (2 of 5); ranking not available." No sentence when no row names a gap. | "Answer, not fully covered"                         |

- The sentence is said once, in the coverage block ("How complete this answer is"), never also beside the pill. The state word never appears in it. A row with an empty obligation is named by its requirement; a row that names nothing is skipped. The coverage details keep their own block ("What limits this answer").
- A served status correction names each status by the same function that labels the pill (`statusLabel`), never by the machine word: for example, "from Answer to Partial answer" when the completeness was not derived.
- A cohort member's `data_completeness` is never shown either. The ranking column and the unranked summary show the member's served driver rows, "3 of 5 drivers" (`memberDriversText`), never a number mapped from the state. A member that serves no driver rows shows nothing.
- The Ask Dev Workbench (an engineering inspector) is not in this rule.
