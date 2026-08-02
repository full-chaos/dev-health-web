import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { DevAnswer } from "@/lib/dev/generated";

import { ANSWER_STATUS_LABELS, AskDevAnswer, SCOPE_OUTCOME_LABELS } from "./AskDevAnswer";

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
        [
            "refused",
            "Refused: Ask Dev did not answer this question. A result with limitations, not a silent success.",
        ],
    ] as const)("shows the sanctioned explanation for a %s answer", (status, expectedText) => {
        const statusAnswer = { ...answer, status } as unknown as DevAnswer;
        render(<AskDevAnswer answer={statusAnswer} />);

        expect(screen.getByText(expectedText)).toBeVisible();
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

        expect(screen.getByText("Not accessible")).toBeVisible();
        expect(screen.queryByText(/forbidden/iu)).not.toBeInTheDocument();
        expect(screen.queryByText(/not found/iu)).not.toBeInTheDocument();
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
