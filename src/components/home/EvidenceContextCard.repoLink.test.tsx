import { describe, expect, it } from "vitest";

import { render, screen } from "@/test/utils";
import type { HomeResponse, MetricDelta } from "@/lib/types";

import { EvidenceContextCard } from "./EvidenceContextCard";

const delta = (over: Partial<MetricDelta>): MetricDelta => ({
    metric: "cycle_time",
    label: "Cycle Time",
    value: 1,
    unit: "days",
    delta_pct: 0,
    has_data: true,
    has_prior_data: true,
    spark: [],
    ...over,
});

const home = (deltas: MetricDelta[]) =>
    ({
        freshness: { sources: {}, coverage: {} },
        deltas,
        signals: [],
        data_confidence: {
            level: "medium",
            connected_sources: [],
            missing_sources: [],
            caveats: [],
        },
    }) as unknown as HomeResponse;

const linked = {
    repo_link_state: "linked",
    repo_link_basis: { native: 56, explicit_text: 7, heuristic: 32 },
    repo_link_multi_repo_items: 22,
    repo_link_coverage: { linked_items: 6527, items_in_window: 10593 },
};

describe("EvidenceContextCard repository link notes (CHAOS-9120)", () => {
    it("draws texts 4 and 6 once for four linked metrics", () => {
        render(
            <EvidenceContextCard
                home={home(
                    ["cycle_time", "throughput", "wip_saturation", "blocked_work"].map((metric) =>
                        delta({ metric, ...linked }),
                    ),
                )}
            />,
        );
        const note = screen.getByTestId("repo-link-page-note");
        expect(note).toHaveTextContent(
            "22 of these issues are also linked to pull requests of other repositories. Repository views do not add up to the organization total.",
        );
        expect(note).toHaveTextContent(
            "6,527 of 10,593 issues in this window have a linked pull request.",
        );
        expect(screen.getAllByText(/issues in this window have a linked/)).toHaveLength(1);
    });
    it("draws only text 6 at multi 0, nothing at T = 0 or without a state", () => {
        render(
            <EvidenceContextCard
                home={home([delta({ ...linked, repo_link_multi_repo_items: 0 })])}
            />,
        );
        expect(screen.getByTestId("repo-link-page-note").textContent).not.toMatch(/also linked/);
    });
    it("draws nothing when no repository state is served", () => {
        render(<EvidenceContextCard home={home([delta({})])} />);
        expect(screen.queryByTestId("repo-link-page-note")).toBeNull();
    });
});
