import { describe, expect, it } from "vitest";

import { formatTimestamp } from "@/lib/formatters";
import { render, screen, within } from "@/test/utils";
import type { CockpitSignal, HomeResponse } from "@/lib/types";

import { EVIDENCE_CONTEXT_NOTE, EvidenceContextCard } from "./EvidenceContextCard";

const signal = (overrides: Partial<CockpitSignal> = {}): CockpitSignal => ({
    id: "metric:review_latency",
    title: "Review Latency appears up",
    metric: "review_latency",
    current_value: "0.9 hours",
    prior_value: "0.1 hours",
    delta: "+1,041%",
    direction: "up",
    severity: "critical",
    confidence: "medium",
    affected_scope: "org-wide",
    evidence_count: 7,
    why_it_matters: "w",
    recommended_action: "a",
    category: "delivery",
    ...overrides,
});

const makeHome = (overrides: Partial<HomeResponse> = {}): HomeResponse => ({
    freshness: {
        last_ingested_at: INGEST_AT,
        latest_successful_sync_at: SYNC_AT,
        sources: {},
        coverage: {
            repos_covered_pct: 0,
            prs_linked_to_issues_pct: 0,
            issues_with_cycle_states_pct: 0,
        },
    },
    deltas: [],
    summary: [],
    tiles: {},
    constraint: { title: "", claim: "", evidence: [], experiments: [] },
    events: [],
    signals: [signal()],
    data_confidence: {
        level: "medium",
        connected_sources: ["github"],
        missing_sources: [],
        caveats: [],
    },
    ...overrides,
});

const SYNC_AT = "2026-09-09T10:30:00Z";
const INGEST_AT = "2026-09-09T08:00:00Z";

const fact = (label: string) => {
    const row = screen
        .getAllByTestId("evidence-fact")
        .find((el) => within(el).queryByText(label) !== null);
    if (!row) throw new Error(`no fact row "${label}"`);
    return row;
};

// The "Evidence & context" card of Home (CHAOS-8063): approved prototype `app.js:100`.
describe("EvidenceContextCard", () => {
    it("has the approved title, description and the three fact rows in order (no Identity confidence row)", () => {
        render(<EvidenceContextCard home={makeHome()} />);
        expect(screen.getByRole("heading", { name: "Evidence & context" })).toBeInTheDocument();
        expect(screen.getByText("Keep uncertainty beside the claim.")).toBeInTheDocument();
        const labels = screen
            .getAllByTestId("evidence-fact")
            .map((row) => row.querySelector("dt")?.textContent);
        expect(labels).toEqual(["Source", "Signal quality", "Last sync"]);
    });

    it("reads Not reported for Source: the Home API does not serve it", () => {
        render(<EvidenceContextCard home={makeHome()} />);
        for (const label of ["Source"]) {
            expect(fact(label)).toHaveAttribute("data-reported", "false");
            expect(fact(label)).toHaveTextContent("Unknown");
        }
    });

    it.each([
        ["high", "High"],
        ["medium", "Medium"],
        ["low", "Low"],
    ] as const)(
        "Signal quality is the primary signal's served confidence (%s), the served word",
        (confidence, word) => {
            render(
                <EvidenceContextCard
                    home={makeHome({
                        signals: [signal({ confidence }), signal({ id: "b", confidence: "high" })],
                    })}
                />,
            );
            expect(fact("Signal quality")).toHaveAttribute("data-reported", "true");
            expect(screen.getByTestId("evidence-context-quality").textContent).toBe(word);
        },
    );

    it("Signal quality reads Not reported when no signal is served", () => {
        render(<EvidenceContextCard home={makeHome({ signals: [] })} />);
        expect(fact("Signal quality")).toHaveTextContent("Unknown");
        expect(screen.queryByTestId("evidence-context-quality")).toBeNull();
    });

    it("Last sync is the served last successful sync time", () => {
        render(<EvidenceContextCard home={makeHome()} />);
        expect(fact("Last sync")).toHaveAttribute("data-reported", "true");
        // The page's own timestamp format (local time zone), of the sync time and not the ingest.
        expect(fact("Last sync").querySelector("dd")?.textContent).toBe(
            formatTimestamp(SYNC_AT, SYNC_AT),
        );
        expect(formatTimestamp(SYNC_AT, SYNC_AT)).not.toBe(formatTimestamp(INGEST_AT, INGEST_AT));
    });

    it("Last sync reads Not reported with no successful sync: an ingest time is not a sync", () => {
        render(
            <EvidenceContextCard
                home={makeHome({
                    freshness: {
                        last_ingested_at: INGEST_AT,
                        latest_successful_sync_at: null,
                        sources: {},
                        coverage: {
                            repos_covered_pct: 0,
                            prs_linked_to_issues_pct: 0,
                            issues_with_cycle_states_pct: 0,
                        },
                    },
                })}
            />,
        );
        expect(fact("Last sync")).toHaveAttribute("data-reported", "false");
        expect(fact("Last sync").querySelector("dd")?.textContent).toBe("Unknown");
    });

    it("holds the approved sentence and the served caveats in the inset", () => {
        render(
            <EvidenceContextCard
                home={makeHome({
                    data_confidence: {
                        level: "low",
                        connected_sources: [],
                        missing_sources: [],
                        caveats: [
                            "Coverage appears partial; treat cockpit signals as directional.",
                        ],
                    },
                })}
            />,
        );
        const note = screen.getByTestId("evidence-context-note");
        expect(note).toHaveTextContent(EVIDENCE_CONTEXT_NOTE);
        expect(within(note).getByTestId("data-confidence-caveats")).toHaveTextContent(
            "Coverage appears partial; treat cockpit signals as directional.",
        );
    });

    it("has no caveat list when the API served none, and every row reads Not reported with no payload", () => {
        const { unmount } = render(<EvidenceContextCard home={makeHome()} />);
        expect(screen.queryByTestId("data-confidence-caveats")).toBeNull();
        unmount();

        render(<EvidenceContextCard home={null} />);
        const rows = screen.getAllByTestId("evidence-fact");
        expect(rows).toHaveLength(3);
        for (const row of rows) expect(row).toHaveAttribute("data-reported", "false");
    });
});
