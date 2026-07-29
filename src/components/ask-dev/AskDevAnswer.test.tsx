import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { DevAnswer } from "@/lib/dev/generated";

import { AskDevAnswer } from "./AskDevAnswer";

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
        await waitFor(() => expect(document.getElementById("ask-dev-evidence-1")).toHaveFocus());

        await user.click(
            screen.getByRole("button", {
                name: "Open metric citation 1 for claim",
            }),
        );

        const metricDefinition = screen.getByText("Metric definition").closest("details");
        expect(metricDefinition).toHaveAttribute("open");
        expect(document.getElementById("ask-dev-metric-1")).toHaveFocus();
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
});
