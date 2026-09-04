# Ask Dev — default web CI coverage delta (CHAOS-3219 Phase 4 input)

Re-derived 2026-08-06 on `dev-health-web@main` (`c6491d07`) against
`dev-health-ops@main`. This replaces the lost Phase-0b artifact
`p0b-webci-delta.md`. It is the authoritative MISSING list for Phase 4
Lane 4b.

## What this audit compares

**Claim under audit** — Wave 3.1 manifest row `gate.web-default-ci`
(status `deferred`, `ops/scripts/acceptance/wave31_manifest.py:1638`):

> Default required Playwright CI covers answer-v2 outcomes, subjects,
> rendering, and window/`/dev` semantic equivalence.

**Against** — CHAOS-3219 required acceptance groups 2 (app-wide window),
3 (full `/dev` workspace), 4 (cross-surface continuity), 5 (contextual
interaction), plus the launch thresholds that are web-observable
(zero internal-enum/reason leakage; zero silent organization widening;
100% correct typed outcome or deterministic fallback; zero blank/refused
result when a valid frame exists).

**Scope of this list**: the _default_, mock-backed Playwright tier
(`playwright.config.ts` → `tests.yml` `e2e-default`). Rows that can only
be proven on the live compose stack are out of scope here and belong to
Phase 4 lanes 4a/4c/4d.

## Standing facts established by the audit

1. **Web consumes `dev_answer.v1` only.** `dev_answer.v2` exists in ops
   (`ops/contracts/ask-dev/v2/schemas/dev_answer.v2.schema.json`) but is
   projected down to v1 before it reaches the wire by the single
   authorised projector `ops/src/dev_health_ops/api/dev/contracts_v2/compat.py`.
   `public_outcome` appears zero times in web `src/`. "answer-v2 outcome
   coverage" in web therefore means **coverage of the projected v1 shapes**,
   not of a v2 payload. The eight `PublicOutcome` values project as:

    | v2 `public_outcome`       | v1 wire shape | v1 value                                                 |
    | ------------------------- | ------------- | -------------------------------------------------------- |
    | `answered`                | `DevAnswer`   | `complete` if coverage satisfied, else `partial`         |
    | `answered_with_gaps`      | `DevAnswer`   | `partial`                                                |
    | `needs_clarification`     | `DevAnswer`   | `insufficient_evidence` + scope `ambiguous`/`unresolved` |
    | `not_found`               | `DevError`    | `scope_not_found` (not retryable)                        |
    | `temporarily_unavailable` | `DevError`    | `source_unavailable` (retryable)                         |
    | `unsupported`             | `DevError`    | `feature_not_enabled` (not retryable)                    |
    | `denied`                  | `DevError`    | `forbidden` (not retryable)                              |
    | `failed`                  | `DevError`    | `internal_error` (not retryable)                         |

2. **What the default suite actually runs today**: 34 Playwright tests in
   four files — `ask-dev-outcomes.spec.ts` (10), `ask-dev-shared.spec.ts`
   (14), `ask-dev-continuity.spec.ts` (3), `ask-dev-vocabulary.spec.ts` (7,
   pure data/filesystem assertions, no browser). All four land in the
   `authenticated` project and always execute — sharding is per-file and
   all three shards are required checks. They are driven by one mock,
   `tests/mocks/devScenario.ts`, built from
   `src/lib/dev/contracts/examples/positive/dev_answer.v1.json`.

3. **Vocabulary actually exercised by the default mock**:
    - `AnswerStatus`: `complete`, `partial`, `degraded`,
      `insufficient_evidence`, `refused` — 5 of 6 (`error` excluded by
      documented decision).
    - `ScopeResolutionOutcome`: `exact`, `ambiguous`,
      `forbidden_or_not_found` — 3 of 7.
    - `DevErrorCode`: `scope_forbidden`, `source_unavailable` — **2 of 24**.
    - `DevCapabilitiesReadiness`: `ready`, `missing_credentials`,
      `disabled` — 3 of 5.

4. **Surface split**: `ask-dev-outcomes.spec.ts` and
   `ask-dev-shared.spec.ts` drive the **window only**. Exactly one default
   test touches `/dev` for an outcome (entitlement-off), plus the three
   continuity tests. The `/dev` full page has **no answer-state-matrix
   coverage in the default tier**.

5. **Out-of-band finding — THE LIVE ACCEPTANCE SPEC RUNS IN NO WORKFLOW.**
   `tests/live/ask-dev-acceptance.spec.ts` is excluded by
   `playwright.config.ts` (`testIgnore: "live/**"`) _and_ by
   `playwright.live.config.ts` (`testIgnore: /ask-dev-acceptance\.spec\.ts/`).
   It executes only via a manual `pnpm test:ask-dev-acceptance`. Any claim
   resting on it is a claim about a manually-run artifact. This is why
   CHAOS-3435's two stale selectors survived on main for a full wave.

    **This is a Phase 5 CI-lane input, not a Phase 4 fix.** It is recorded
    here because it changes how every other row should be read: the live tier
    cannot be relied on to catch a rendering regression, so anything that
    must not regress belongs in the default tier or the unit tier. That is
    why row W11 exists at all, and why the CHAOS-3435 fix shipped with a
    unit-tier control beside it.

6. **Out-of-band finding — a product defect, not a test gap.**
   `coverage.degraded_required_sources` exists in both v1 and v2, blocks a
   `complete` answer identically to `unavailable`/`stale`
   (`compat.py:308`), and is **never rendered**. `showCoverage`
   (`src/components/ask-dev/AskDevAnswer.tsx:408-412`) omits it from its
   predicate and the block body omits it from its output, so an answer
   degraded-only shows **no coverage block at all** — the user sees a
   downgraded answer with no explanation. Needs a `src/` fix, ticketed
   separately, tracked here as W4.

## MISSING (14 rows)

Priority is by customer-visible risk and by which launch threshold the row
protects. "Closes" names the CHAOS-3219 group or threshold.

| #   | Row                                                                                                                                                                                                                                                                                                                                                                           | Closes                                                                                                            | Why it is missing                                                                                                                                                                                                                                     | Risk     |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| W1  | **No-answer outcome projection matrix** — `not_found`, `unsupported`, `denied`, `failed` each render their canonical copy (`ops/.../no_answer_policy.py:74-82`), and the Retry affordance appears only for the retryable one. (The server's matching `remediation` is NOT rendered by the UI at all — that is CHAOS-3474, so this row asserts only what is renderable today.) | G3, "100% correct typed outcome or deterministic fallback"; "zero blank/refused result when a valid frame exists" | The mock emits 2 of 24 `DevErrorCode`s. Four of the eight v2 outcomes have **no user-visible assertion anywhere in web**.                                                                                                                             | HIGH     |
| W2  | **Clarification projection fidelity** — the ambiguous scenario must serve the shape the backend actually produces: `status: "insufficient_evidence"` + `resolved_scope.outcome: "ambiguous"`, and the UI must render the clarification pill/caption for it.                                                                                                                   | G3; mocks-mirror-real-vocabulary                                                                                  | `devScenario.ts:136-165` mutates `direct_summary` and `resolved_scope` but leaves `status: "complete"`. The one clarification test today asserts against a payload the backend **cannot emit** — this is a false-coverage row, not merely a thin one. | HIGH     |
| W3  | **Candidate selection outcome** — "Use this scope" commits the chosen subject, does **not** auto-submit, and the next question is scoped to it.                                                                                                                                                                                                                               | G5 ("no auto-submit"), G2 ("visible committed subjects")                                                          | `ask-dev-outcomes.spec.ts:73` clicks the button and then asserts **nothing**. The click's entire effect is unverified.                                                                                                                                | HIGH     |
| W4  | **Coverage block truth** — `complete`-vs-`partial` follows coverage, and `degraded_required_sources` is rendered rather than silently dropped.                                                                                                                                                                                                                                | G3 ("source observations… conflicts, freshness")                                                                  | The `showCoverage` predicate and body both ignore `degraded_required_sources`; a degraded-only answer renders no coverage block. Requires a `src/` fix plus its RED-first test.                                                                       | HIGH     |
| W5  | **Internal-token denylist over prose fields** — poisoned `direct_summary`, `claim.text`, `conflict.summary`, `warnings[]`, `suggested_follow_up_questions[]` are withheld, with the three named negative controls (`factual_completion`, `cannot_ready`, `prev1_state`) proving the guard is word-boundary/shape-based and not over-eager.                                    | "zero internal-enum/reason leakage"                                                                               | Default CI checks only the **failed-run alert** and exact-text status/scope pills. `safeCopy()` guards five prose fields; none is driven with a poisoned payload in the browser tier.                                                                 | HIGH     |
| W6  | **`/dev` answer-state matrix** — the full outcome table rendered on the `/dev` workspace, not only in the window.                                                                                                                                                                                                                                                             | G3 (complete answer state matrix)                                                                                 | The outcome table runs window-only. `/dev` has exactly one default outcome test, and it is the entitlement-off negative. Half the row's "rendering" claim is unproven.                                                                                | HIGH     |
| W7  | **Window ↔ `/dev` semantic equivalence beyond `complete`** — the same payload renders equivalent semantics on both surfaces for each status/outcome, not just the happy path.                                                                                                                                                                                                 | G4 ("identical answer-v2 payloads render equivalent semantics")                                                   | All three continuity tests drive the `complete` scenario. Equivalence is proven for 1 of 6 statuses. This is the row's fourth named area.                                                                                                             | HIGH     |
| W8  | **No user text in URLs or analytics payloads** — question text never reaches the URL, `history.pushState`, or any analytics call.                                                                                                                                                                                                                                             | G4 (explicit)                                                                                                     | No assertion anywhere in web.                                                                                                                                                                                                                         | HIGH     |
| W9  | **Route exclusions** — no ordinary Ask Dev window on `/superadmin/context-fabric/validation`; the launcher renders on ordinary authenticated routes.                                                                                                                                                                                                                          | G2 (explicit), G6 (admin separation)                                                                              | No default test asserts either half. No spec even asserts the launcher is present on an ordinary page.                                                                                                                                                | HIGH     |
| W10 | **Proposed vs committed scope, and navigation without mutation** — the proposed row ("Commits when you ask") and the committed label render correctly, and a route change does not silently mutate committed subject/scope.                                                                                                                                                   | G2, G4; "zero silent organization widening"                                                                       | Proven only at the unit tier (`AskDevTrigger.integration.test.tsx`). No browser-tier assertion.                                                                                                                                                       | MED-HIGH |
| W11 | **Citation ordinals and answer-scoped anchors on the rendered surface** — a cited ref at a non-zero index numbers as `E{index+1}` and opens `ask-dev-evidence-{answer_id}-{index+1}`.                                                                                                                                                                                         | G3 (citation precision)                                                                                           | Unit-tier only. The default browser tier has no citation-anchor assertion, which is precisely why CHAOS-3435's positional assumption survived: the only spec that exercised it runs in no workflow.                                                   | MED      |
| W12 | **Self-contradiction guards rendered** — the CHAOS-3367 no-match presentation ("No match found", "Closest matches", no Refused chip) and the CHAOS-3377 refused-with-grounding presentation ("Inconsistent result", claims withheld, metrics/evidence retained).                                                                                                              | G3; "zero unresolved-subject fabrication"                                                                         | Both are customer-visible defect classes with unit-tier-only regression cover.                                                                                                                                                                        | MED      |
| W13 | **Ordered sections and limits** — the full section order (scope → coverage → claims → conflicts → metrics → evidence → limitations → follow-ups) and the truncation/limitation copy for capped answers.                                                                                                                                                                       | G3 ("ordered answer sections", limits)                                                                            | The hierarchy test proves only "direct summary precedes Evidence coverage". No test renders a truncated answer.                                                                                                                                       | MED      |
| W14 | **Remaining closed-vocabulary states** — scope outcomes `unresolved`, `organization_fallback`, `filtered`, `inherited`, and readiness `unsupported_model`, `degraded`.                                                                                                                                                                                                        | G2/G3; "zero silent organization widening"                                                                        | 4 of 7 scope outcomes and 2 of 5 readiness states are documented-excluded from any rendered assertion. `organization_fallback` and `unresolved` are in `NEVER_ATTESTABLE_TOKENS` and map directly to the widening threshold.                          | MED      |

## Below the line (candidates, not rows)

Real gaps, but either cheaper to cover inside a row above or better owned
by a live lane. Recorded so they are not silently dropped.

- **At-most-one-canonical-run under route change, expand/minimize, and
  cancellation races** (G4). Duplicate double-submit _is_ covered
  (`ask-dev-shared.spec.ts:78`); the other three race shapes are not.
  Reconnect races need the live stack — split the mockable half into W7 if
  the lead wants it in the default tier.
- **Automated a11y (axe) sweep** of both surfaces in both themes (G2, G3).
  Mock-backed and therefore default-tier-capable, but Phase 4 Lane 4a
  already owns the accessibility report; assign to avoid duplication.
- **`/dev` missing from the nav-reachability sweep**
  (`tests/nav-reachability.spec.ts:5-77`). One-line fix, low risk.

## Verification standard for every row

Each row lands as a spec with a positive control and a negative control:
the assertion must be observed failing against a deliberately wrong
payload or a mutated renderer before it counts as coverage. A row whose
test passes both before and after the defect it names is not coverage and
is not recorded as such.

Two mutations were run against this changeset, each restored and the
restore verified by checksum:

- Hardcoding the citation ordinal to 1 in `AskDevAnswer.tsx` killed exactly
  the new unit test and left the other 35 green.
- Hiding the coverage block only on the compact (window) surface killed the
  W7 equivalence clause on all five statuses while **both pre-existing
  continuity tests stayed green** — the old-pass/new-fail pair showing W7
  closes a gap they did not cover.

## Status

All 14 rows are implemented in this changeset. Most are test-and-mock work;
`src/` changed in three places, all of them defect fixes rather than row
implementation:

- `AskDevAnswer.tsx` — the `showCoverage` predicate and the coverage block
  (CHAOS-3469, row W4);
- `contractValidation.ts` — the `fully_covered` mirror (CHAOS-3469, third
  site, found while reviewing the first fix);
- `AskDevProvider.tsx` — the surface/answer proposal split (CHAOS-3470,
  found by row W3 and fixed under an explicit product ruling; a
  product-behavior change, called out in the PR body).

Findings raised while closing the rows, each filed rather than folded in
silently:

- **CHAOS-3469** — `degraded_required_sources` never rendered. Fixed here
  (row W4), RED-first observed. **Three sites, one class**: the field was
  missing from the `showCoverage` predicate, from the coverage block's
  output, and — found while reviewing the first fix — from
  `validateAskDevSemanticInvariants`, which mirrors ops' `fully_covered`
  and so was accepting a `complete` answer with degraded required sources
  that ops cannot emit (`compat.py:303-309`). Rather than patch a third
  time and stop, the closure argument: web reasons about coverage in
  exactly two files — `AskDevAnswer.tsx` (predicate and render) and
  `contractValidation.ts` (the ops mirror). `grep` for
  `available_source_count|required_source_count` outside generated code,
  pinned contracts and tests returns those two files and nothing else, so
  all sites are now covered and there is no fourth.
- **CHAOS-3470** — the clarification "Use this scope" CTA is inert when
  `ask_dev_contextual_entrypoints` is off. Found by W3, the first
  assertion ever placed on that button. Not fixed: the two candidate fixes
  point in opposite directions and it needs a product ruling.
- **CHAOS-3471** — the canonical no-answer copy lives in Python constants
  exported into no artifact web pins, so W1's mirror of it cannot detect
  ops-side drift. The mirror's own comment states this limitation rather
  than implying a link that does not exist.

Two observations not yet ticketed, pending a ruling:

- **Server `remediation` is never rendered.** The failed-run alert shows
  `safe_message` plus a client-derived `errorGuidance` covering only the
  allowance and provider-contract cases. For all five no-answer outcomes
  the server supplies remediation and the UI drops it, leaving the user a
  sentence and no next step.
- **Readiness `degraded` is treated as a hard block.** `AskDevProvider`
  gates on `readiness !== "ready"`, so a degraded provider that may still
  answer disables Ask Dev entirely. W14 deliberately asserts only what is
  correct under either ruling (administrator-safe copy, no raw enum), so
  the test does not enshrine the current behaviour.

## Process notes from building these rows

Recorded because each cost a real cycle and the next person should not
repeat it.

- **Assertions must match the guard's own matching semantics.** The first
  denylist assertion used a substring check, which flags `cannot_ready` as a
  leak of `not_ready` — exactly the false positive the guard's word-boundary
  matching exists to avoid. The three negative controls caught it on the
  first run.
- **A scope outcome is a shape, not a field.** Stamping an enum onto the
  happy-path fixture produces payloads the browser client rejects outright
  (`organization_fallback` needs an organization-shaped `surface_context`
  too) or, worse, payloads it accepts that production cannot emit
  (`unresolved` beside a completed answer with claims). Build each scenario
  from what the projector actually constructs.
- **Server-owned copy is not yours to invent.** `needs_clarification` and
  the five no-answer outcomes carry copy the server supplies and the
  projector passes through. A mock that writes its own sentence tests
  nothing, and it is the same defect W2 was created to fix.
- **`git add -A` is unsafe in this repo.** Running the e2e suite regenerates
  the tracked `public/runtime-config.js` with test-mode values
  (`NEXT_PUBLIC_DEV_HEALTH_TEST_MODE=true`, production Sentry/telemetry/
  analytics settings dropped), so a blanket add sweeps a test-mode artifact
  into the commit. It happened twice on this branch — reverted by hand, then
  regenerated by the next e2e run and swept in again — and was caught by
  adversarial review rather than by any gate. Stage explicit paths. The
  underlying question of whether the file should be tracked at all is
  CHAOS-3477.
- **Run ask-dev specs with `--workers=1`.** See below.

## A note on running these locally

The ask-dev specs share mock-server global state (capabilities and the
entitlement scenario). CI gets away with it by pinning `workers: 1`; a
local multi-worker run of these four files produces false reds — three,
reproducibly, in continuity/not_ready/retry. Run them with `--workers=1`.
