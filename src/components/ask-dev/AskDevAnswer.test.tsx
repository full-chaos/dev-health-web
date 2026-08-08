import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { DevAnswer, DevError } from "@/lib/dev/generated";

import { findInternalToken } from "@/lib/dev/internalTokens";

import {
    ANSWER_STATUS_LABELS,
    AskDevAnswer,
    INTERNAL_TOKEN_DENYLIST,
    SCOPE_OUTCOME_LABELS,
} from "./AskDevAnswer";

type DevErrorCode = NonNullable<DevError>["code"];

const actions = vi.hoisted(() => ({
    expandEvidence: vi.fn(),
    selectProposedEntity: vi.fn(),
    submitAnswerFeedback: vi.fn(),
    submitQuestion: vi.fn(),
}));

vi.mock("./AskDevProvider", () => ({ useAskDev: () => actions }));

const answer = {
    answer_id: "answer-1",
    as_of: "2026-07-29T00:00:00Z",
    claims: [
        {
            claim_id: "claim-internal-1",
            confidence: 0.91,
            evidence_ref_ids: ["evidence-internal-1"],
            flags: {
                conflicting: true,
                stale: true,
                uncertain: true,
                untrusted_source: true,
            },
            kind: "observation",
            metric_ref_ids: ["metric-internal-1"],
            text: "Cycle time appears to have improved.",
            validity_scope: {
                direct_scope: "repository",
                entity_refs: [
                    {
                        display_label: "Web application",
                        entity_id: "repository-internal-1",
                        entity_type: "repository",
                    },
                ],
                organization_id: "org-internal-1",
                repositories: ["repository-internal-1"],
            },
        },
    ],
    conversation_id: "conversation-1",
    coverage: {
        available_source_count: 1,
        required_source_count: 1,
    },
    direct_summary: "The evidence suggests delivery flow improved.",
    evidence: [
        {
            citation_text: "Pull request 451 merged after review.",
            confidence: 0.94,
            display_label: "Pull request 451",
            entity_id: "451",
            entity_type: "pull_request",
            evidence_ref_id: "evidence-internal-1",
            flags: {},
            freshness: "fresh",
            observed_at: "2026-07-28T12:00:00Z",
            provenance: "github",
            source_system: "github",
            source_version: "v1",
        },
    ],
    metrics: [
        {
            aggregation: "median",
            coverage: 1,
            current_window: {
                start: "2026-07-01T00:00:00Z",
                end: "2026-07-29T00:00:00Z",
                timezone: "UTC",
            },
            definition_version: "v1",
            display_precision: 1,
            evidence_ref_ids: ["evidence-internal-1"],
            freshness: "fresh",
            label: "Cycle time",
            metric_id: "cycle_time",
            metric_ref_id: "metric-internal-1",
            query_version: "v1",
            source_version: "v1",
            unit: "hours",
            value: 18.5,
        },
    ],
    status: "complete",
    warnings: [],
} as unknown as DevAnswer;

describe("AskDevAnswer citations", () => {
    beforeAll(() => {
        window.requestAnimationFrame = (callback: FrameRequestCallback) => {
            callback(0);
            return 0;
        };
    });

    beforeEach(() => {
        Object.values(actions).forEach((action) => action.mockReset());
        actions.expandEvidence.mockResolvedValue({
            evidence_ref_id: "evidence-internal-1",
            safe_excerpt: "The authorized evidence excerpt.",
            state: "available",
        });
    });

    it("opens claim-level evidence and metric citations without exposing raw reference IDs", async () => {
        const user = userEvent.setup();
        render(<AskDevAnswer answer={answer} />);

        await user.click(
            screen.getByRole("button", {
                name: "Open evidence citation 1 for claim",
            }),
        );

        expect(actions.expandEvidence).toHaveBeenCalledWith("evidence-internal-1", "answer-1");
        expect(await screen.findByText("The authorized evidence excerpt.")).toBeVisible();
        await waitFor(() =>
            expect(document.getElementById("ask-dev-evidence-answer-1-1")).toHaveFocus(),
        );

        await user.click(
            screen.getByRole("button", {
                name: "Open metric citation 1 for claim",
            }),
        );

        const metricDefinition = screen.getByText("Metric definition").closest("details");
        expect(metricDefinition).toHaveAttribute("open");
        expect(document.getElementById("ask-dev-metric-answer-1-1")).toHaveFocus();
        expect(screen.queryByText("evidence-internal-1")).not.toBeInTheDocument();
        expect(screen.queryByText("metric-internal-1")).not.toBeInTheDocument();
        expect(screen.getByText("Applies to Web application")).toBeVisible();
        expect(screen.getByText("Stale")).toBeVisible();
        expect(screen.getByText("Uncertain")).toBeVisible();
        expect(screen.getByText("Conflicting")).toBeVisible();
        expect(screen.getByText("Untrusted source")).toBeVisible();
        expect(screen.queryByText("repository-internal-1")).not.toBeInTheDocument();
    });

    it("lets a material metric open its own authorized evidence reference", async () => {
        const user = userEvent.setup();
        render(<AskDevAnswer answer={answer} />);

        await user.click(
            screen.getByRole("button", {
                name: "Open evidence citation 1 for metric Cycle time",
            }),
        );

        expect(actions.expandEvidence).toHaveBeenCalledWith("evidence-internal-1", "answer-1");
        expect(await screen.findByText("The authorized evidence excerpt.")).toBeVisible();
    });

    it("scopes detail-panel and article ids to the answer id so multiple answers in a transcript never collide, and actually activates the second answer's panel", async () => {
        const user = userEvent.setup();
        const secondAnswer = { ...answer, answer_id: "answer-2" } as unknown as DevAnswer;
        render(
            <>
                <AskDevAnswer answer={answer} />
                <AskDevAnswer answer={secondAnswer} />
            </>,
        );

        // Position-based ids (pre-fix: "ask-dev-evidence-1"/"ask-dev-metric-1")
        // would collide across every answer in the transcript, so
        // getElementById would silently resolve to the first answer's panel
        // for both. Scoping by answer_id keeps each answer's ids unique.
        expect(document.getElementById("ask-dev-evidence-answer-1-1")).toBeInTheDocument();
        expect(document.getElementById("ask-dev-evidence-answer-2-1")).toBeInTheDocument();
        expect(document.getElementById("ask-dev-metric-answer-1-1")).toBeInTheDocument();
        expect(document.getElementById("ask-dev-metric-answer-2-1")).toBeInTheDocument();
        expect(document.getElementById("ask-dev-answer-answer-1")).toBeInTheDocument();
        expect(document.getElementById("ask-dev-answer-answer-2")).toBeInTheDocument();

        // Each answer's "Evidence" section heading is linked via
        // aria-labelledby to *that answer's own* heading id, not shared or
        // swapped with the other answer's section.
        const firstHeading = document.getElementById("ask-dev-evidence-heading-answer-1");
        const secondHeading = document.getElementById("ask-dev-evidence-heading-answer-2");
        expect(firstHeading?.closest("section")).toHaveAttribute(
            "aria-labelledby",
            "ask-dev-evidence-heading-answer-1",
        );
        expect(secondHeading?.closest("section")).toHaveAttribute(
            "aria-labelledby",
            "ask-dev-evidence-heading-answer-2",
        );

        // Both answers share the same underlying evidence_ref_id, so both
        // citation buttons have the identical accessible name — activating
        // the *second* answer's button must open and focus the second
        // answer's own detail panel, never the first answer's.
        const openButtons = screen.getAllByRole("button", {
            name: "Open evidence citation 1 for claim",
        });
        expect(openButtons).toHaveLength(2);
        await user.click(openButtons[1]!);

        await waitFor(() =>
            expect(document.getElementById("ask-dev-evidence-answer-2-1")).toHaveFocus(),
        );
        expect(document.getElementById("ask-dev-evidence-answer-1-1")).not.toHaveFocus();
    });

    // CHAOS-3435. `answer.evidence` carries no ordering contract: it is
    // first-seen assembly order across tool results, and the upstream evidence
    // search ranks by relevance/source precedence/freshness independently of
    // what the model cites. A cited ref therefore lands at an arbitrary index,
    // and the citation ordinal + detail-panel anchor must both follow that
    // index. This is the unit-tier control for the live acceptance spec's
    // id-derived assertions.
    it("numbers a citation by the cited ref's index in answer.evidence, not by assuming it is first", async () => {
        const user = userEvent.setup();
        const citedEvidence = answer.evidence![0]!;
        const decoyEvidence = Array.from({ length: 23 }, (_, index) => ({
            ...citedEvidence,
            display_label: `Pull request ${500 + index}`,
            entity_id: String(500 + index),
            evidence_ref_id: `evidence-decoy-${index + 1}`,
        }));
        // Cited ref sits at index 23 -> ordinal 24, exactly the live shape.
        const rankedAnswer = {
            ...answer,
            evidence: [...decoyEvidence, citedEvidence],
        } as unknown as DevAnswer;

        render(<AskDevAnswer answer={rankedAnswer} />);

        expect(
            screen.queryByRole("button", { name: "Open evidence citation 1 for claim" }),
        ).not.toBeInTheDocument();

        await user.click(
            screen.getByRole("button", { name: "Open evidence citation 24 for claim" }),
        );

        expect(actions.expandEvidence).toHaveBeenCalledWith("evidence-internal-1", "answer-1");
        await waitFor(() =>
            expect(document.getElementById("ask-dev-evidence-answer-1-24")).toHaveFocus(),
        );
        expect(document.getElementById("ask-dev-evidence-answer-1-1")).not.toHaveFocus();
    });

    // The metric half of the same contract. The evidence control above left
    // metrics unguarded: a renderer hardcoded to metric citation 1 passes
    // whenever the cited metric happens to be first, which it is in every
    // other fixture here (codex adversarial review, MEDIUM). The live
    // acceptance spec derives the metric ordinal too, but it runs in no
    // workflow, so this is the control that can actually gate.
    it("numbers a metric citation by the cited ref's index in answer.metrics, not by assuming it is first", async () => {
        const user = userEvent.setup();
        const citedMetric = answer.metrics![0]!;
        const decoyMetrics = Array.from({ length: 4 }, (_, index) => ({
            ...citedMetric,
            label: `Decoy metric ${index + 1}`,
            metric_id: `decoy_${index + 1}`,
            metric_ref_id: `metric-decoy-${index + 1}`,
        }));
        // Cited ref sits at index 4 -> ordinal 5.
        const rankedAnswer = {
            ...answer,
            metrics: [...decoyMetrics, citedMetric],
        } as unknown as DevAnswer;

        render(<AskDevAnswer answer={rankedAnswer} />);

        expect(
            screen.queryByRole("button", { name: "Open metric citation 1 for claim" }),
        ).not.toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Open metric citation 5 for claim" }));

        expect(document.getElementById("ask-dev-metric-answer-1-5")).toHaveFocus();
        expect(document.getElementById("ask-dev-metric-answer-1-1")).not.toHaveFocus();
    });
});

describe("AskDevAnswer status explanations (CHAOS-3215)", () => {
    beforeAll(() => {
        window.requestAnimationFrame = (callback: FrameRequestCallback) => {
            callback(0);
            return 0;
        };
    });

    beforeEach(() => {
        Object.values(actions).forEach((action) => action.mockReset());
    });

    // Copy grounded in ops/docs/use/ai-workflows/index.md ("Ask Dev: window
    // and full-page workspace"): "A partial, degraded, refused, or
    // insufficient-evidence answer is a result with limitations, not a
    // silent success."
    it.each([
        [
            "partial",
            "Partial: the investigation did not fully complete. A result with limitations, not a silent success.",
        ],
        [
            "degraded",
            "Degraded: part of the investigation could not complete as expected. A result with limitations, not a silent success.",
        ],
        [
            "insufficient_evidence",
            "Insufficient evidence: there isn't enough evidence to answer with confidence. A result with limitations, not a silent success.",
        ],
    ] as const)("shows the sanctioned explanation for a %s answer", (status, expectedText) => {
        const statusAnswer = { ...answer, status } as unknown as DevAnswer;
        render(<AskDevAnswer answer={statusAnswer} />);

        expect(screen.getByText(expectedText)).toBeVisible();
    });

    // CHAOS-3377: a GENUINE refusal (no claim/metric/evidence grounding at
    // all) still gets the sanctioned "Refused:" caption -- the shared
    // `answer` fixture above carries real claims/metrics/evidence, so it is
    // no longer a valid fixture for this case (see the
    // `refusedDespiteMaterialGrounding` describe block below for what
    // happens when `status: "refused"` is combined with THAT fixture).
    it("shows the sanctioned Refused explanation for a genuine refusal with no grounding", () => {
        const statusAnswer = {
            ...answer,
            status: "refused",
            claims: [],
            metrics: [],
            evidence: [],
        } as unknown as DevAnswer;
        render(<AskDevAnswer answer={statusAnswer} />);

        expect(
            screen.getByText(
                "Refused: Ask Dev did not answer this question. A result with limitations, not a silent success.",
            ),
        ).toBeVisible();
    });

    it("renders no status explanation for a complete answer", () => {
        render(<AskDevAnswer answer={answer} />);

        expect(screen.queryByText(/not a silent success/u)).not.toBeInTheDocument();
    });
});

describe("AskDevAnswer answer hierarchy (CHAOS-3291)", () => {
    beforeAll(() => {
        window.requestAnimationFrame = (callback: FrameRequestCallback) => {
            callback(0);
            return 0;
        };
    });

    beforeEach(() => {
        Object.values(actions).forEach((action) => action.mockReset());
    });

    // Regression guard for the reported inversion: the direct answer must
    // carry the primary (display-font, heading-scale) typography, while an
    // Evidence entry's label must NOT carry that same primary treatment —
    // it is supporting material, not the headline. Planting the old classes
    // back on either element is exactly the defect this issue fixed.
    it("gives the direct answer primary typographic weight and keeps evidence entries secondary", () => {
        const thinAnswer = {
            ...answer,
            claims: [],
            direct_summary: "Status: partial.",
            metrics: [],
            status: "partial",
        } as unknown as DevAnswer;
        render(<AskDevAnswer answer={thinAnswer} />);

        const summaryEl = screen.getByText("Status: partial.");
        expect(summaryEl.className).toMatch(/text-h3/u);

        const evidenceLabelEl = screen.getByText("Pull request 451");
        expect(evidenceLabelEl.className).not.toMatch(/text-h3/u);
        expect(evidenceLabelEl.className).not.toMatch(/font-medium/u);
        expect(evidenceLabelEl.className).not.toMatch(/text-\(--text-primary\)/u);
    });
});

describe("AskDevAnswer sanctioned copy (CHAOS-3291)", () => {
    beforeAll(() => {
        window.requestAnimationFrame = (callback: FrameRequestCallback) => {
            callback(0);
            return 0;
        };
    });

    beforeEach(() => {
        Object.values(actions).forEach((action) => action.mockReset());
    });

    // The status pill previously rendered answer.status verbatim
    // (`insufficient_evidence`, underscores and all). It must go through
    // the sanctioned copy map instead.
    it("renders sanctioned copy for the status pill, never the raw enum value", () => {
        const statusAnswer = {
            ...answer,
            status: "insufficient_evidence",
        } as unknown as DevAnswer;
        render(<AskDevAnswer answer={statusAnswer} />);

        expect(screen.getByText("Insufficient evidence")).toBeVisible();
        expect(screen.queryByText("insufficient_evidence")).not.toBeInTheDocument();
        expect(screen.queryByText(/insufficient_evidence/u)).not.toBeInTheDocument();
    });

    // The reported leak: scope outcome "forbidden_or_not_found" rendered
    // verbatim as "forbidden or not found". The backend deliberately
    // collapses forbidden vs. not-found into one outcome (so scope
    // resolution can't be used to enumerate what exists); the sanctioned
    // copy must preserve that, never re-split or expose the raw member.
    it("renders sanctioned copy for a forbidden_or_not_found scope outcome, never the raw enum value", () => {
        const forbiddenAnswer = {
            ...answer,
            resolved_scope: {
                authorized_repository_ids: [],
                candidates: [],
                outcome: "forbidden_or_not_found",
                resolved_at: "2026-07-29T00:00:00Z",
                schema_version: "dev_scope_resolution.v1",
                warnings: [],
            },
        } as unknown as DevAnswer;
        render(<AskDevAnswer answer={forbiddenAnswer} />);

        // CHAOS-3367 changed this label from "Not accessible" to the TRD §7.1
        // public class for the same outcome. It still collapses forbidden and
        // not-found into one statement, which is what this test guards; what
        // changed is that "Not accessible" additionally asserted an access
        // denial the backend cannot actually distinguish, and PRD §12 forbids
        // an authorization-shaped statement unless access was really denied.
        expect(screen.getByText("No authorized match found")).toBeVisible();
        expect(screen.queryByText(/forbidden/iu)).not.toBeInTheDocument();
        expect(screen.queryByText(/not accessible/iu)).not.toBeInTheDocument();
    });

    // Totality guard, independent of any single render: these reference
    // records exist purely so TypeScript re-enforces exhaustiveness here
    // too. If AnswerStatus or ScopeResolutionOutcome ever gains a member,
    // this file fails to compile until it's added below (mirroring the
    // TOTAL Record in AskDevAnswer.tsx), and the Object.keys comparison
    // catches any drift between the two lists even if both happened to
    // compile.
    it("ANSWER_STATUS_LABELS has exactly one sanctioned entry per AnswerStatus member", () => {
        const knownStatuses: Record<DevAnswer["status"], true> = {
            complete: true,
            degraded: true,
            error: true,
            insufficient_evidence: true,
            partial: true,
            refused: true,
        };
        expect(Object.keys(ANSWER_STATUS_LABELS).sort()).toEqual(Object.keys(knownStatuses).sort());
    });

    it("SCOPE_OUTCOME_LABELS has exactly one sanctioned entry per ScopeResolutionOutcome member", () => {
        const knownOutcomes: Record<DevAnswer["resolved_scope"]["outcome"], true> = {
            ambiguous: true,
            exact: true,
            filtered: true,
            forbidden_or_not_found: true,
            inherited: true,
            organization_fallback: true,
            unresolved: true,
        };
        expect(Object.keys(SCOPE_OUTCOME_LABELS).sort()).toEqual(Object.keys(knownOutcomes).sort());
    });
});

// --- CHAOS-3367: the Wave 3.1 PRD §12 prohibitions, as string-level negative
// --- controls against the exact payload a live screenshot showed rendering.

const noMatchAnswer = {
    ...answer,
    claims: [],
    conflicts: [],
    coverage: { available_source_count: 0, required_source_count: 0 },
    direct_summary:
        "I couldn't find an authorized project named 'Falcon' in the selected " +
        "organization. I did not substitute organization-wide data. Here are the " +
        "closest matches, if any.",
    evidence: [],
    metrics: [],
    resolved_scope: {
        authorized_repository_ids: [],
        candidates: [],
        outcome: "forbidden_or_not_found",
        resolved_at: "2026-07-29T00:00:00Z",
        schema_version: "dev_scope_resolution.v1",
        warnings: [],
    },
    status: "insufficient_evidence",
    warnings: [],
} as unknown as DevAnswer;

describe("AskDevAnswer no-match presentation (CHAOS-3367)", () => {
    beforeAll(() => {
        window.requestAnimationFrame = (callback: FrameRequestCallback) => {
            callback(0);
            return 0;
        };
    });

    it("never shows a Refused chip for a no-match result", () => {
        // The live screenshot: the model marked its own answer `refused` after
        // a not-found resolution. Keyed off the resolution outcome rather than
        // the status, so a replayed row written before the server fix still
        // renders honestly.
        render(<AskDevAnswer answer={{ ...noMatchAnswer, status: "refused" } as DevAnswer} />);

        expect(screen.getByText("No match found")).toBeVisible();
        expect(screen.queryByText("Refused")).not.toBeInTheDocument();
        expect(screen.queryByText(/Ask Dev did not answer this question/u)).not.toBeInTheDocument();
    });

    it("never shows an Exact match scope outcome beside a no-match summary", () => {
        render(<AskDevAnswer answer={noMatchAnswer} />);

        expect(screen.getByText("No authorized match found")).toBeVisible();
        expect(screen.queryByText("Exact match")).not.toBeInTheDocument();
    });

    it("hides the sources line entirely when no source plan ran", () => {
        render(<AskDevAnswer answer={noMatchAnswer} />);

        // The live defect read "Coverage: 1 of 1 sources" for a subject that
        // was never resolved. "0 of 0 sources" is no better: it still reads as
        // a measurement that happened.
        expect(screen.queryByText(/sources/u)).not.toBeInTheDocument();
        expect(screen.queryByLabelText("Evidence coverage")).not.toBeInTheDocument();
    });

    // NOT a RED control, and labelled as one: the pre-change component
    // rendered direct_summary verbatim too, so this stays green with the
    // component reverted. It is a compatibility check — the new token guard
    // must not mangle the server's own sentence — and it earns its place for
    // that, not as evidence the fix works.
    it("passes the PRD's own no-match sentence through the token guard unaltered", () => {
        render(<AskDevAnswer answer={noMatchAnswer} />);

        expect(
            screen.getByText(/I couldn't find an authorized project named 'Falcon'/u),
        ).toBeVisible();
        expect(screen.getByText(/I did not substitute organization-wide data\./u)).toBeVisible();
    });

    it("calls a no-match candidate list closest matches, not possible scope matches", () => {
        // CHAOS-3366 fills this list; the contract slot and its copy exist now
        // so that work is additive.
        render(
            <AskDevAnswer
                answer={
                    {
                        ...noMatchAnswer,
                        resolved_scope: {
                            ...noMatchAnswer.resolved_scope,
                            candidates: [
                                {
                                    entity_ref: {
                                        display_label: "Falcon Nine",
                                        entity_id: "project-falcon-nine",
                                        entity_type: "project",
                                    },
                                    reason: "Closest authorized name match.",
                                },
                            ],
                        },
                    } as unknown as DevAnswer
                }
            />,
        );

        expect(screen.getByText("Closest matches")).toBeVisible();
        expect(screen.queryByText("Possible scope matches")).not.toBeInTheDocument();
    });
});

describe("AskDevAnswer refused-with-grounding presentation (CHAOS-3377)", () => {
    beforeAll(() => {
        window.requestAnimationFrame = (callback: FrameRequestCallback) => {
            callback(0);
            return 0;
        };
    });

    it("never shows a Refused chip, and withholds the rejected-shaped body instead of inventing Answered around it", () => {
        // The live defect: the model self-declared `status=refused` while
        // `answer` above carries a real claim, metric, and evidence entry.
        // CHAOS-3377 HIGH (round 2): an earlier revision relabeled this
        // "Answered" while STILL rendering the model's original prose --
        // the ops contract never does that (it discards rejected narrative,
        // never shows it under an invented label). The chip must read
        // neutrally AND the original summary/claims must be withheld.
        render(<AskDevAnswer answer={{ ...answer, status: "refused" } as DevAnswer} />);

        expect(screen.queryByText("Refused")).not.toBeInTheDocument();
        expect(screen.queryByText("Answered")).not.toBeInTheDocument();
        expect(screen.queryByText(/Ask Dev did not answer this question/u)).not.toBeInTheDocument();
        expect(screen.getByText("Inconsistent result")).toBeVisible();
        // The rejected-shaped body/claims are withheld, never rendered.
        expect(
            screen.queryByText("The evidence suggests delivery flow improved."),
        ).not.toBeInTheDocument();
        expect(screen.queryByText("Cycle time appears to have improved.")).not.toBeInTheDocument();
        expect(screen.getByText("This part of the answer could not be shown.")).toBeVisible();
    });

    it("still shows Refused for a genuine refusal with no grounding (negative control)", () => {
        const genuineRefusal = {
            ...answer,
            status: "refused",
            claims: [],
            metrics: [],
            evidence: [],
        } as unknown as DevAnswer;
        render(<AskDevAnswer answer={genuineRefusal} />);

        expect(screen.getByText("Refused")).toBeVisible();
        expect(screen.getByText(/Ask Dev did not answer this question/u)).toBeVisible();
    });

    it("catches material grounding carried only by a claim's metric_ref_ids", () => {
        // A claim can ground itself with a metric reference alone (no
        // evidence_ref_ids, and no top-level metrics/evidence arrays either)
        // -- the guard must still catch that shape as "material grounding".
        const claimMetricOnlyGrounding = {
            ...answer,
            status: "refused",
            metrics: [],
            evidence: [],
            claims: [
                {
                    ...answer.claims?.[0],
                    evidence_ref_ids: [],
                    metric_ref_ids: ["metric-internal-1"],
                },
            ],
        } as unknown as DevAnswer;
        render(<AskDevAnswer answer={claimMetricOnlyGrounding} />);

        expect(screen.queryByText("Refused")).not.toBeInTheDocument();
    });
});

describe("AskDevAnswer CHAOS-3377 acceptance", () => {
    beforeAll(() => {
        window.requestAnimationFrame = (callback: FrameRequestCallback) => {
            callback(0);
            return 0;
        };
    });

    // PRD-prohibited strings for a substantive project-status answer, bound
    // as literals -- never derived from the module under test.
    const PROHIBITED_STRINGS = [
        "actual_completion",
        "not_ready",
        "open_blocker",
        "required_child_incomplete",
        "required_release_evidence_missing",
        "ev1_",
        "}}}{",
    ];

    it("a substantive project-status answer is never Refused and never leaks internal vocabulary", () => {
        const projectStatusAnswer = {
            ...answer,
            status: "partial",
            direct_summary:
                "39 of 69 required items are complete for Falcon Nine. Open items: one or more blocking items are still open; one or more required sub-items are not complete.",
            resolved_scope: {
                outcome: "exact",
                authorized_repository_ids: [],
                authorized_entity_ids: ["project-falcon-nine"],
                candidates: [],
                requested_scope: {
                    direct_scope: "project",
                    entity_refs: [
                        {
                            display_label: "Falcon Nine",
                            entity_id: "project-falcon-nine",
                            entity_type: "project",
                        },
                    ],
                    organization_id: "org-internal-1",
                    repositories: [],
                },
                resolved_scope: {
                    direct_scope: "project",
                    entity_refs: [
                        {
                            display_label: "Falcon Nine",
                            entity_id: "project-falcon-nine",
                            entity_type: "project",
                        },
                    ],
                    organization_id: "org-internal-1",
                    repositories: [],
                },
            },
        } as unknown as DevAnswer;

        const { container } = render(<AskDevAnswer answer={projectStatusAnswer} />);

        expect(screen.queryByText("Refused")).not.toBeInTheDocument();
        const rendered = container.textContent ?? "";
        for (const forbidden of PROHIBITED_STRINGS) {
            expect(rendered).not.toContain(forbidden);
        }
        // Defect 4: a project scope renders its subject, not a repository
        // count.
        expect(screen.getByText("Falcon Nine")).toBeVisible();
        expect(screen.queryByText(/authorized repositories/u)).not.toBeInTheDocument();
    });

    it("a genuinely refused/no-match result still renders its canonical copy (negative control)", () => {
        render(<AskDevAnswer answer={{ ...noMatchAnswer, status: "refused" } as DevAnswer} />);

        expect(screen.getByText("No match found")).toBeVisible();
        expect(screen.queryByText("Refused")).not.toBeInTheDocument();
    });
});

describe("AskDevAnswer internal-token guard (CHAOS-3367)", () => {
    beforeAll(() => {
        window.requestAnimationFrame = (callback: FrameRequestCallback) => {
            callback(0);
            return 0;
        };
    });

    // ops fails these terminals closed at the server boundary. This is the
    // last layer before a human reads it, and it is the only one that covers
    // a row persisted before that server check existed.
    it.each([
        [
            "direct_summary",
            {
                direct_summary:
                    "Scope resolution for the requested entity returned " +
                    "forbidden_or_not_found. No authorized entity matched.",
            },
        ],
        [
            "a warning",
            { warnings: ["The request was rejected with scope_forbidden for this repository."] },
        ],
        [
            "a claim",
            {
                claims: [
                    {
                        claim_id: "claim-leak-1",
                        confidence: 0.5,
                        evidence_ref_ids: [],
                        flags: {},
                        kind: "inferred",
                        metric_ref_ids: [],
                        text: "The scope came back forbidden_or_not_found for this project.",
                    },
                ],
            },
        ],
        [
            "a conflict",
            {
                conflicts: [
                    { evidence_ref_ids: [], summary: "Two sources disagree: scope_forbidden." },
                ],
            },
        ],
    ])("never renders an internal token that arrived in %s", (_field, overrides) => {
        render(<AskDevAnswer answer={{ ...noMatchAnswer, ...overrides } as DevAnswer} />);

        for (const token of ["forbidden_or_not_found", "scope_forbidden"]) {
            expect(document.body.textContent).not.toContain(token);
        }
        expect(screen.getByText("This part of the answer could not be shown.")).toBeVisible();
    });

    it("leaves ordinary prose untouched", () => {
        // The guard must not fire on English that happens to contain the enum
        // members' individual words -- otherwise it silently eats real answers.
        const prose =
            "The exact match was filtered because the source was unavailable, so " +
            "nothing was found.";
        render(<AskDevAnswer answer={{ ...noMatchAnswer, direct_summary: prose } as DevAnswer} />);

        expect(screen.getByText(prose)).toBeVisible();
    });
});

describe("AskDevAnswer token-guard provenance (CHAOS-3367)", () => {
    beforeAll(() => {
        window.requestAnimationFrame = (callback: FrameRequestCallback) => {
            callback(0);
            return 0;
        };
    });

    // Codex adversarial review round 1: a substring scan with no provenance
    // blanks a healthy answer whose authorized entity is genuinely named like
    // an enum member. The exemption is earned by the answer carrying that
    // name as an authorized label, not by a hard-coded exception.
    const attestedAnswer = {
        ...answer,
        claims: [],
        conflicts: [],
        direct_summary: "The insufficient_evidence branch was merged last week.",
        evidence: [{ ...answer.evidence![0], display_label: "insufficient_evidence" }],
        metrics: [],
        warnings: [],
    } as unknown as DevAnswer;

    it("keeps copy naming an authorized entity that looks like an enum member", () => {
        render(<AskDevAnswer answer={attestedAnswer} />);

        expect(
            screen.getByText("The insufficient_evidence branch was merged last week."),
        ).toBeVisible();
    });

    it("still blanks a real leak in the same answer", () => {
        render(
            <AskDevAnswer
                answer={
                    {
                        ...attestedAnswer,
                        direct_summary: "The project not_found returned forbidden_or_not_found.",
                    } as DevAnswer
                }
            />,
        );

        expect(document.body.textContent).not.toContain("forbidden_or_not_found");
        expect(screen.getByText("This part of the answer could not be shown.")).toBeVisible();
    });
});

describe("AskDevAnswer legacy contradictory payload (CHAOS-3367)", () => {
    beforeAll(() => {
        window.requestAnimationFrame = (callback: FrameRequestCallback) => {
            callback(0);
            return 0;
        };
    });

    // The reported screenshot's actual shape, and the one the first revision
    // of this fix missed: `resolved_scope.outcome` is "exact", so keying the
    // no-match presentation off that field alone left every §12 violation on
    // screen. The row is already persisted and still schema-valid, so no
    // server-side change can reach it — the client has to notice that the
    // summary and the scope row cannot both be true.
    const legacyAnswer = {
        ...answer,
        claims: [],
        conflicts: [],
        coverage: { available_source_count: 1, required_source_count: 1 },
        direct_summary:
            "Scope resolution for the requested entity returned forbidden_or_not_found. " +
            "No authorized entity matched the requested name under the current authorization.",
        evidence: [],
        metrics: [],
        resolved_scope: {
            authorized_repository_ids: [],
            candidates: [],
            outcome: "exact",
            resolved_at: "2026-07-29T00:00:00Z",
            schema_version: "dev_scope_resolution.v1",
            warnings: [],
        },
        status: "refused",
        warnings: [],
    } as unknown as DevAnswer;

    it("shows none of the four prohibited elements for the live legacy payload", () => {
        render(<AskDevAnswer answer={legacyAnswer} />);

        const body = document.body.textContent ?? "";
        expect(body).not.toContain("forbidden_or_not_found");
        expect(screen.queryByText("Refused")).not.toBeInTheDocument();
        expect(screen.queryByText("Exact match")).not.toBeInTheDocument();
        expect(screen.queryByText(/sources/u)).not.toBeInTheDocument();
        expect(screen.getByText("No match found")).toBeVisible();
    });

    it("does not reclassify an ordinary answer that merely mentions a source", () => {
        // The classifier keys off scope-resolution tokens only, so a normal
        // committed-scope answer keeps its own presentation.
        render(<AskDevAnswer answer={answer} />);

        expect(screen.queryByText("No match found")).not.toBeInTheDocument();
        expect(screen.getByText(/1 of 1/u)).toBeVisible();
    });
});

describe("AskDevAnswer coverage suppression (CHAOS-3367)", () => {
    beforeAll(() => {
        window.requestAnimationFrame = (callback: FrameRequestCallback) => {
            callback(0);
            return 0;
        };
    });

    it("keeps the coverage block when zero were required but sources are unavailable", () => {
        // The contract permits required_source_count: 0 beside a non-empty
        // unavailable list. Hiding the whole block on the count alone would
        // take the only source-specific explanation with it.
        render(
            <AskDevAnswer
                answer={
                    {
                        ...answer,
                        coverage: {
                            available_source_count: 0,
                            required_source_count: 0,
                            unavailable_required_sources: ["github"],
                        },
                    } as unknown as DevAnswer
                }
            />,
        );

        expect(screen.getByText("1 required sources unavailable")).toBeVisible();
    });

    // CHAOS-3219 W4. `degraded_required_sources` is a real DevCoverage field
    // in both v1 and v2, and it blocks a `complete` answer exactly as
    // `unavailable`/`stale` do (ops contracts_v2/compat.py). It was absent
    // from both the `showCoverage` predicate and the rendered block, so a
    // degraded-only answer showed no coverage section at all — a downgraded
    // answer with nothing on screen to explain the downgrade.
    it("reports degraded required sources, and keeps the coverage block for a degraded-only answer", () => {
        render(
            <AskDevAnswer
                answer={
                    {
                        ...answer,
                        status: "degraded",
                        coverage: {
                            available_source_count: 0,
                            required_source_count: 0,
                            degraded_required_sources: ["work_graph", "deployments"],
                            stale_required_sources: [],
                            unavailable_required_sources: [],
                        },
                    } as unknown as DevAnswer
                }
            />,
        );

        expect(screen.getByLabelText("Evidence coverage")).toBeVisible();
        expect(screen.getByText("2 required sources degraded")).toBeVisible();
    });
});

describe("internal-token guard vocabulary (CHAOS-3367)", () => {
    it("never lets provenance exempt a scope-resolution token", () => {
        // Codex round 2: an evidence label named `scope_forbidden` would
        // otherwise exempt a genuinely leaked `scope_forbidden` elsewhere in
        // the same answer.
        expect(
            findInternalToken(
                "Resolution returned scope_forbidden.",
                INTERNAL_TOKEN_DENYLIST,
                "scope_forbidden",
            ),
        ).toBe("scope_forbidden");
    });

    it("pins the DevError code vocabulary against the generated union", () => {
        // The hand-written half of the denylist. Anything here that stops
        // being a real code, or any underscore-bearing code missing from it,
        // fails at build time rather than becoming a silent gap.
        const codes: Record<NonNullable<DevErrorCode>, true> = {
            answer_validation_failed: true,
            byo_llm_not_enabled: true,
            cancelled: true,
            concurrency_limited: true,
            conversation_expired: true,
            conversation_not_found: true,
            cost_limit_reached: true,
            feature_not_enabled: true,
            forbidden: true,
            insufficient_evidence: true,
            internal_error: true,
            invalid_request: true,
            model_not_supported: true,
            provider_contract_violation: true,
            provider_not_configured: true,
            provider_unavailable: true,
            rate_limited: true,
            refused: true,
            scope_ambiguous: true,
            scope_forbidden: true,
            scope_not_found: true,
            source_unavailable: true,
            tool_limit_reached: true,
            tool_unavailable: true,
            unauthenticated: true,
        };
        for (const code of Object.keys(codes).filter((value) => value.includes("_"))) {
            expect(INTERNAL_TOKEN_DENYLIST.has(code)).toBe(true);
        }
    });
});
