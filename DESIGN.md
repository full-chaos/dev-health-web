# ACR Context Packet Explorer Design

## 0. Research Log

- The ACR PRD defines one web surface, Context Packet Explorer, with goal/repository/branch/task inputs; State, Pressure, Cause, Evidence, and Action groups; evidence expansion; and freshness, coverage, fallback, partial, and not-entitled states.
- `docs/design-system.md` remains binding for existing Dev Health tokens and primitives. `docs/agent-context-runtime-entitlement.md` establishes that the web is an inspection surface, never an ACR authorization authority.

## 1. Route and Navigation

- **Route:** `/agent-context/context-packet` is the sole Context Packet Explorer destination.
- **Diagnose navigation placement:** it is a Diagnose child named **Context Packet**, positioned after Bottlenecks and before People. It is a destination, not a horizontal tab, so Diagnose remains the single active primary-navigation area even though the route pathname begins with `/agent-context`.
- The page title, breadcrumb, and navigation label use the same “Context Packet” name. The only back link is `Back to Diagnose`.

## 2. User Goals and Form Primitive

The explorer helps an authenticated operator inspect one server-authorized context packet. The request form has four labeled fields:

1. **Goal** — required plain-language task objective.
2. **Repository** — required repository slug selected from server-authorized repositories; it is not a trusted organization or repository identity claim.
3. **Branch or commit** — optional scope refinement. Commit SHA takes precedence when both are present.
4. **Task reference** — optional issue or work reference.

The submit action is `Generate context`. Loading disables only that action and preserves editable form values. The client never displays, accepts, or persists a bearer token, credential secret, license artifact, raw transcript, or customer-selected organization as authorization input.

## 3. Packet Primitives

### Shared Primitives

- **Request form:** Goal, Repository, Branch or commit, and Task reference fields plus the `Generate context` submit control are the shared request primitive.
- **Packet header:** the shared packet identity and metadata primitive.
- **Category group:** one reusable group shell for State, Pressure, Cause, Evidence, and Action.
- **Evidence disclosure:** the shared sanitized-evidence expansion primitive.
- **Packet diagnostics:** Status, Freshness, Coverage, Budget, Checks, and next-step primitives.
- **Controlled state:** the shared `DataState` primitive for loading, empty, degraded, error, not-entitled, and unavailable states.

### Packet Header

Render packet metadata in a compact, non-primary detail row: packet status, repository display label, resolved branch or commit, generated time, query version, ranking version, and compatibility summary. IDs remain copy-only debug details and never become primary labels.

### Context Categories

Render one ordered group for each category: **State**, **Pressure**, **Cause**, **Evidence**, and **Action**. Every packet item displays title, summary, claim kind, severity, confidence, and `Why included`. Observed claims expose linked evidence; inferred and recommendation claims state their claim kind visibly.

### Evidence Primitive

Evidence expansion is an on-demand detail panel, not automatic remote fetching. It displays only server-sanitized citation, source label, safe URI, availability, observed time, excerpt, and redaction reason. It never renders raw source, raw transcript, secret, credential, evidence body, or untrusted content as executable instruction.

### Packet Diagnostics

Render the following packet metadata as named primitives:

- **Status:** complete, partial, degraded, or empty.
- **Freshness:** as-of time, stale-after interval, and per-source watermarks.
- **Coverage:** considered, available, unavailable, partial flag, and degraded reasons.
- **Budget:** item count, output-token estimate, serialized-byte estimate, and truncation flag.
- **Checks and next steps:** required checks and recommended next steps remain separate from evidence.

Retrieval debug information is admin-only, visually subordinate, and never shown in the customer-facing packet body.

## 4. State Contract

| State        | Required behavior                                                                                                                                                      |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loading      | Keep the submitted form visible, show a non-blocking progress state, and reserve packet layout space without fabricated values.                                        |
| Not entitled | Show `DataState` explaining that the signed-in operator is not entitled to use Agent Context Runtime. Do not infer access from tier or expose credential requirements. |
| Unavailable  | Show `DataState` with customer-safe service-unavailable copy and a retry affordance. Do not expose transport URLs, credentials, or dependency details.                 |
| Empty        | Show `DataState` explaining that no context matched the authorized scope; preserve the submitted scope for refinement.                                                 |
| Partial      | Render available groups and an explicit coverage/fallback explanation.                                                                                                 |
| Degraded     | Render safe packet content with freshness, unavailable-source, and degraded-reason primitives.                                                                         |
| Error        | Show a recoverable `DataState`; do not render transport payloads, URLs, secrets, or raw server errors.                                                                 |
| Complete     | Render all packet primitives in the hierarchy above.                                                                                                                   |

## 5. Tokens, Layout, and Responsive Behavior

All implementation uses the existing semantic color roles, locked typography scale, 4px spacing scale, radius scale, `DataState`, `EntityLabel`, `BackLink`, and CTA registry from `docs/design-system.md`.

- **375px:** form fields stack; category groups are one column; packet metadata wraps beneath the title; evidence opens inline; focus order follows form then packet order.
- **768px:** goal remains full width; repository and branch-or-commit share a row; task reference remains full width; category groups remain one column with denser metadata.
- **1280px:** form uses a two-column grid; packet categories use a readable two-column layout while Evidence and Action preserve their full-width detail affordances; the diagnostic rail may align beside the packet only when it remains keyboard reachable after the packet header.

No motion is required. If later added, motion communicates evidence-panel expansion only and respects reduced-motion preferences.

## 6. Accessibility and Keyboard Contract

- Every field has a visible label, required-state text, and inline validation message associated through native semantics.
- Submit, group expansion, evidence expansion, feedback, and back link are keyboard reachable with visible tokenized focus states.
- Category headings use semantic heading order; expanded evidence controls expose `aria-expanded` and a named controlled region.
- Status, freshness, coverage, budget, and degraded reasons are text equivalents, not color-only signals.
- Loading and request-result changes announce through a concise status region without moving focus unexpectedly.
- Evidence excerpts and debug information preserve text selection, do not trap focus, and never rely on hover alone.

## 7. Accepted Debt and Delivery Boundary

This contract is complete for the route and shared primitives; later implementation must follow it rather than redefine states or navigation. No visual component ships in this task, so visual QA is deferred until a rendered explorer exists. Accepted debt: no current screenshot or component showcase because the route is not implemented; screen-reader announcements and the 375/768/1280 layouts are specified here but require real-browser verification when Todo 6 renders them; retrieval-debug disclosure remains admin-only and is deferred to the authorized runtime work. All future explorer primitives require the existing visual QA gate before shipment.

## 8. Contract Artifact Boundary

The copied primary inputs have this exact order: `contracts/openapi/acr-v1.json`, `capabilities.v1.schema.json`, `context_packet.v1.schema.json`, `context_packet_item.v1.schema.json`, `context_packet_request.v1.schema.json`, `error.v1.schema.json`, `evidence_ref.v1.schema.json`, `expanded_evidence.v1.schema.json`, `context_packet.v1.json`, and `expanded_evidence.v1.json`. After those inputs, the sync script appends a documented deterministic dependency closure: `agent_episode.v1.schema.json` and `agent_episode_create.v1.schema.json`, because the copied OpenAPI document references them. The closure is schema-only; it is not an implicit expansion to unrelated REST or MCP families. `context_packet_item` and `evidence_ref` are primary inputs because they are local `$ref` dependencies of packet and expanded-evidence contracts. During copying, OpenAPI external schema references are rebased from the source tree to the committed `schemas/` artifact directory and tested for local resolution. MCP-only schemas and examples are deliberately excluded from this REST boundary.
