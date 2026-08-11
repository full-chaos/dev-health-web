import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { DevAnswer } from "@/lib/dev/generated";

import graphAssistanceFixture from "@/lib/dev/contracts/examples/positive/dev_answer_graph_assistance.v1.json";

import { AskDevAnswer } from "../AskDevAnswer";

const actions = vi.hoisted(() => ({
    expandEvidence: vi.fn(),
    selectProposedEntity: vi.fn(),
    submitAnswerFeedback: vi.fn(),
    submitQuestion: vi.fn(),
}));

vi.mock("../AskDevProvider", () => ({ useAskDev: () => actions }));

const evidence = {
    citation_text: "A supporting work item was completed.",
    confidence: 0.94,
    display_label: "Completed work item",
    entity_id: "work-item-1",
    entity_type: "work_unit",
    evidence_ref_id: "evidence-1",
    flags: {},
    freshness: "fresh",
    observed_at: "2026-07-28T12:00:00Z",
    provenance: "Work graph",
    source_system: "work_graph",
    source_version: "v1",
};

const graphAssistance = {
    ...graphAssistanceFixture,
    ranked_drivers: graphAssistanceFixture.ranked_drivers?.map((driver) => ({
        ...driver,
        evidence_ref_ids: ["evidence-1"],
    })),
} as unknown as NonNullable<DevAnswer["graph_assisted"]>;

const baseAnswer = {
    answer_id: "answer-graph-1",
    as_of: "2026-07-28T12:00:00Z",
    claims: [],
    conflicts: [],
    conversation_id: "conversation-graph-1",
    coverage: {
        available_source_count: 1,
        required_source_count: 1,
    },
    direct_summary:
        "The available evidence suggests delivery pressure is concentrated in Platform.",
    evidence: [evidence],
    generated_at: "2026-07-28T12:00:00Z",
    metrics: [],
    model: {
        model_fingerprint: "model-1",
        provider_family: "openai_compatible",
        provider_source: "platform",
    },
    resolved_scope: {
        authorized_entity_ids: [],
        authorized_repository_ids: [],
        candidates: [],
        outcome: "exact",
        resolved_at: "2026-07-28T12:00:00Z",
        schema_version: "dev_scope_resolution.v1",
        warnings: [],
    },
    schema_version: "dev_answer.v1",
    status: "complete",
    suggested_follow_up_questions: [],
    versions: {
        metric_definition_version: "v1",
        prompt_version: "v1",
        query_version: "v1",
        tool_contract_version: "v1",
    },
    warnings: [],
} as unknown as DevAnswer;

type GraphState = NonNullable<DevAnswer["graph_assisted"]>["state"];

function answerForState(state: GraphState): DevAnswer {
    return {
        ...baseAnswer,
        graph_assisted: {
            ...graphAssistance,
            limitations: state === "truncated" ? graphAssistance.limitations : [],
            state,
        },
    } as unknown as DevAnswer;
}

describe("AskDevAnswer graph assistance rendering", () => {
    beforeAll(() => {
        window.requestAnimationFrame = (callback: FrameRequestCallback) => {
            callback(0);
            return 0;
        };
    });

    beforeEach(() => {
        Object.values(actions).forEach((action) => action.mockReset());
        actions.expandEvidence.mockResolvedValue({
            evidence_ref_id: "evidence-1",
            safe_excerpt: "The authorized evidence excerpt.",
            state: "available",
        });
    });

    it("renders cohort rationale, ranked drivers, lineage, limitations, and shared evidence focus", async () => {
        const user = userEvent.setup();
        const { container } = render(<AskDevAnswer answer={answerForState("truncated")} />);

        expect(screen.getByText("Additional evidence context")).toBeVisible();
        expect(screen.getByText("Source health:")).toBeVisible();
        expect(screen.getAllByText("Partial context")).toHaveLength(2);
        expect(screen.getByText("Platform")).toBeVisible();
        expect(
            screen.getByText("Included based on the team's current pressure signal."),
        ).toBeVisible();
        expect(screen.getByRole("heading", { name: "Ranked drivers" })).toBeVisible();
        expect(screen.getByText("60% contribution")).toBeVisible();
        expect(screen.getByRole("heading", { name: "Evidence lineage" })).toBeVisible();
        expect(screen.getByText("Team")).toBeVisible();
        expect(screen.getByText("Project")).toBeVisible();
        expect(screen.getByText("The evidence path is partial.")).toBeVisible();

        await user.click(
            screen.getByRole("button", {
                name: "Open evidence citation 1 for driver 1",
            }),
        );

        expect(actions.expandEvidence).toHaveBeenCalledWith("evidence-1", "answer-graph-1");
        expect(await screen.findByText("The authorized evidence excerpt.")).toBeVisible();
        await waitFor(() =>
            expect(document.getElementById("ask-dev-evidence-answer-graph-1-1")).toHaveFocus(),
        );

        const rendered = container.textContent ?? "";
        for (const token of [
            "enabled",
            "team_pressure",
            "truncated_traversal",
            "graph_assisted",
            "Graphiti",
            "Cypher",
        ]) {
            expect(rendered).not.toContain(token);
        }
    });

    it.each([
        ["enabled", "Available", "Additional evidence context is ready for this answer."],
        [
            "unavailable",
            "Not available",
            "Additional context could not be read, so this answer uses the evidence currently available.",
        ],
        [
            "stale",
            "Needs review",
            "Additional context may be out of date; review the dates shown with the evidence.",
        ],
        [
            "lagging",
            "Catching up",
            "Additional context is still catching up, so this answer uses the evidence currently available.",
        ],
        [
            "truncated",
            "Partial context",
            "Only part of the related context was available. The answer includes the resulting limits below.",
        ],
        [
            "fallback",
            "Available evidence only",
            "Additional context could not be used, so this answer uses the evidence currently available.",
        ],
    ] as const)("uses customer-safe source-health copy for %s", (state, label, explanation) => {
        const { container } = render(<AskDevAnswer answer={answerForState(state)} />);

        expect(screen.getAllByText(label)).toHaveLength(2);
        expect(screen.getByText(explanation)).toBeVisible();
        const rendered = container.textContent ?? "";
        expect(rendered).not.toMatch(new RegExp("\\b" + state + "\\b", "iu"));
        expect(rendered).not.toContain("graph_assisted");
        expect(rendered).toContain(baseAnswer.direct_summary);
    });

    it("renders the canonical available-evidence answer when graph context is unavailable", () => {
        render(<AskDevAnswer answer={answerForState("unavailable")} />);

        expect(
            screen.getByText(
                "Additional context could not be read, so this answer uses the evidence currently available.",
            ),
        ).toBeVisible();
        expect(screen.getByText(baseAnswer.direct_summary)).toBeVisible();
        expect(screen.queryByText("unavailable")).not.toBeInTheDocument();
    });

    it.each([
        ["missing_source", "A required source was unavailable."],
        ["stale_source", "Some supporting data may be out of date."],
        ["conflicting_evidence", "The available sources did not fully agree."],
        ["authorization_filtered", "Some related records were not included."],
        ["truncated_traversal", "The evidence path is partial."],
        ["absent_staffing_denominator", "Staffing context was not available."],
        [
            "historical_slice_not_comparable",
            "The historical comparison is not directly comparable.",
        ],
        ["interpretation_uncertainty", "This result needs interpretation alongside the evidence."],
    ] as const)("maps the %s limitation to sanctioned copy", (limitation, copy) => {
        render(
            <AskDevAnswer
                answer={{
                    ...answerForState(
                        limitation === "truncated_traversal" ? "truncated" : "enabled",
                    ),
                    graph_assisted: {
                        ...graphAssistance,
                        limitations: [limitation],
                        state: limitation === "truncated_traversal" ? "truncated" : "enabled",
                    },
                }}
            />,
        );

        expect(screen.getByText(copy)).toBeVisible();
        expect(screen.queryByText(limitation)).not.toBeInTheDocument();
    });

    it("renders the sanctioned project-capacity inclusion rationale", () => {
        const cohort = graphAssistance.cohort;
        if (!cohort) throw new Error("canonical graph fixture must include a cohort");
        render(
            <AskDevAnswer
                answer={{
                    ...answerForState("enabled"),
                    graph_assisted: {
                        ...graphAssistance,
                        cohort: {
                            ...cohort,
                            members: [
                                {
                                    ...cohort.members[0],
                                    display_label: "Mobile",
                                    entity_id: "project-mobile",
                                    inclusion_basis: "project_capacity",
                                },
                            ],
                        },
                    },
                }}
            />,
        );

        expect(screen.getByText("Mobile")).toBeVisible();
        expect(
            screen.getByText("Included based on the project's current capacity signal."),
        ).toBeVisible();
        expect(screen.queryByText("project_capacity")).not.toBeInTheDocument();
    });

    it("renders ranked canonical cohort facts without exposing machine vocabulary", () => {
        const cohort = graphAssistance.cohort;
        if (!cohort) throw new Error("canonical graph fixture must include a cohort");
        const answer = {
            ...answerForState("enabled"),
            graph_assisted: {
                ...graphAssistance,
                cohort: {
                    ...cohort,
                    members: [
                        {
                            ...cohort.members[0],
                            disposition: "unknown",
                            inclusion_rationale:
                                "This project shares relevant delivery evidence with the comparison group.",
                            pressure_dimensions: ["cognitive_workload_pressure"],
                            rank: 1,
                            signals: [
                                {
                                    attribution_present: false,
                                    coverage: 0.4,
                                    data_semantics: "no_data",
                                    denominator_present: false,
                                    dimension: "cognitive_workload_pressure",
                                    evidence_source_classes: ["work_graph"],
                                    observed_states: ["available_stale"],
                                    signal_id: "health:capacity_internal_id",
                                    source: "health",
                                    state: "unknown",
                                },
                                {
                                    coverage: 0.4,
                                    data_semantics: "measured_zero",
                                    freshness: "stale",
                                    observed_states: ["available_stale"],
                                    signal_id: "metrics:delivery_internal_id",
                                    source: "metrics",
                                },
                                {
                                    data_semantics: "no_data",
                                    gap: "no_data",
                                    observed_states: ["available_unknown"],
                                    signal_id: "status",
                                    source: "status",
                                },
                            ],
                        },
                    ],
                },
            },
        } as unknown as DevAnswer;

        const { container } = render(<AskDevAnswer answer={answer} />);
        const renderedAnswer = within(container);
        const includedContext = within(
            renderedAnswer.getByRole("region", { name: "Included context" }),
        );

        expect(includedContext.getByLabelText("Rank 1")).toBeVisible();
        expect(includedContext.getByText("Insufficient current data")).toBeVisible();
        expect(
            includedContext.getByText(
                "This project shares relevant delivery evidence with the comparison group.",
            ),
        ).toBeVisible();
        expect(includedContext.getAllByText(/Cognitive workload pressure/u).length).toBeGreaterThan(
            0,
        );
        const canonicalSignals = includedContext.getByRole("list", {
            name: "Canonical signals",
        });
        expect(canonicalSignals).toHaveTextContent(
            /Health · Cognitive workload pressure · Unknown/u,
        );
        expect(canonicalSignals).toHaveTextContent(
            /Out of date · No matching data · 40% coverage/u,
        );
        expect(includedContext.getByText("Staffing baseline unavailable.")).toBeVisible();
        expect(includedContext.getByText("Attribution coverage unavailable.")).toBeVisible();
        expect(includedContext.getByText("Evidence: Work graph")).toBeVisible();
        expect(canonicalSignals).toHaveTextContent(
            /MetricsOut of date · Measured value available/u,
        );
        expect(canonicalSignals).toHaveTextContent(/StatusCoverage unknown · No matching data/u);

        expect(container.textContent).not.toMatch(
            /health:capacity_internal_id|cognitive_workload_pressure|available_stale|no_data|work_graph/iu,
        );
    });

    it.each(["not_ready", "Graphiti", "Cypher"])(
        "preserves the authorized cohort label %s",
        (displayLabel) => {
            const cohort = graphAssistance.cohort;
            if (!cohort) throw new Error("canonical graph fixture must include a cohort");
            render(
                <AskDevAnswer
                    answer={{
                        ...answerForState("enabled"),
                        graph_assisted: {
                            ...graphAssistance,
                            limitations: [],
                            cohort: {
                                ...cohort,
                                members: [
                                    {
                                        ...cohort.members[0],
                                        display_label: displayLabel,
                                    },
                                ],
                            },
                        },
                    }}
                />,
            );

            expect(screen.getByText(displayLabel)).toBeVisible();
        },
    );

    it("withholds graph labels and notes containing internal terminology", () => {
        const cohort = graphAssistance.cohort;
        expect(cohort).toBeTruthy();
        if (!cohort) throw new Error("canonical graph fixture must include a cohort");
        const leaked = {
            ...baseAnswer,
            graph_assisted: {
                ...graphAssistance,
                cohort: {
                    ...cohort,
                    members: [
                        {
                            ...cohort.members[0],
                            display_label: "team_pressure",
                        },
                    ],
                    warnings: ["absent_staffing_denominator", "work_unit"],
                },
                evidence_lineage: [
                    { label: "project_capacity" },
                    { label: "conflicting_evidence" },
                    { label: "pull_request" },
                ],
            },
        } as unknown as DevAnswer;

        const { container } = render(<AskDevAnswer answer={leaked} />);

        expect(container.textContent).not.toMatch(
            /team_pressure|project_capacity|absent_staffing_denominator|conflicting_evidence|work_unit|pull_request/iu,
        );
        expect(screen.getAllByText("This part of the answer could not be shown.")).toHaveLength(6);
    });
});
