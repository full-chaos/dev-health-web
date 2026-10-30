import { describe, expect, it } from "vitest";
import { render, screen, within } from "@/test/utils";

import { AskDevAnswer } from "../AskDevAnswer";
import { AskDevCoverage } from "../AskDevCoverage";
import type { AnswerResult } from "../answerModel";
import {
    COMPLETENESS_TEXT,
    COVERAGE_COPY,
    evidenceGroups,
    sourceLines,
    type CoverageResult,
} from "../coverageModel";
import ciRateComplete from "./captures/kiac_repo_ci_rate_complete.event.json";
import incidentsDegraded from "./captures/kiac_repo_incidents_degraded.event.json";
import ownerComplete from "./captures/kiac_repo_owner_complete.event.json";
import mergedPrsDegraded from "./captures/kiac_repo_merged_prs_degraded.event.json";
import projectStatusPartial from "./captures/kiac_project_status_partial.event.json";
import teamOpenWorkDegraded from "./captures/kiac_team_open_work_degraded.event.json";

/**
 * CHAOS-11932. Every result is a real ACR answer captured from the kiac stack (`captures/index.json`
 * names the questions). A test that needs a state kiac did not produce (a stale source, a source
 * with no data, an unknown state, no completeness, no evidence, hostile text) changes one field of
 * a copy of a real answer and says so.
 */
const resultOf = (event: { result: unknown }) => event.result as CoverageResult & AnswerResult;
const copyOf = (event: { result: unknown }) => structuredClone(resultOf(event));

const ciComplete = resultOf(ciRateComplete);
const incidents = resultOf(incidentsDegraded);
const owner = resultOf(ownerComplete);
const mergedPrs = resultOf(mergedPrsDegraded);
const statusPartial = resultOf(projectStatusPartial);
const openWork = resultOf(teamOpenWorkDegraded);

const coverage = () => screen.getByTestId("ask-dev-coverage");
const block = (testId: string) => within(coverage()).getByTestId(testId);
const readingOf = (testId: string) =>
    within(coverage()).getByTestId(testId).getAttribute("data-reading");

describe("the captures carry what each test needs", () => {
    it("has a complete answer whose completeness was not derived, and zero facts", () => {
        expect(ciComplete.status).toBe("complete");
        expect(ciComplete.completeness.state).toBe("not_derived");
        expect(incidents.completeness.claimed_facts_count).toBe(0);
        expect(owner.status).toBe("complete");
        expect(owner.completeness.state).toBe("partial");
        expect(mergedPrs.coverage.sources.map((s) => s.state)).toContain("pruned");
        expect(statusPartial.coverage.sources.map((s) => s.state)).toContain("truncated");
    });
});

describe("AskDevCoverage: completeness (checks 11 and 12)", () => {
    it("never reads a 'complete' status as complete when completeness was not derived", () => {
        render(<AskDevAnswer result={ciComplete} />);
        expect(screen.getByTestId("ask-dev-answer-status")).toHaveTextContent("Full answer");
        expect(block("ask-dev-coverage-state")).toHaveTextContent(COMPLETENESS_TEXT.not_derived);
        expect(readingOf("ask-dev-coverage-state")).toBe("unknown");
    });

    it("says a 'complete' status read only part of what it needed when the rows say so", () => {
        render(<AskDevCoverage result={owner} />);
        expect(block("ask-dev-coverage-state")).toHaveTextContent(COMPLETENESS_TEXT.partial);
        expect(readingOf("ask-dev-coverage-state")).toBe("sparse");
        expect(block("ask-dev-coverage-requirements")).toHaveTextContent(
            "Status: read in part: 1 of 4",
        );
    });

    it("says zero as zero: no facts stand behind the answer", () => {
        render(<AskDevCoverage result={incidents} />);
        expect(block("ask-dev-coverage-counts")).toHaveTextContent(
            "No facts stand behind this answer.",
        );
        expect(readingOf("ask-dev-coverage-counts")).toBe("zero");
        expect(block("ask-dev-coverage-state")).toHaveTextContent(COMPLETENESS_TEXT.degraded);
    });

    it("states the facts and rows served", () => {
        render(<AskDevCoverage result={statusPartial} />);
        expect(block("ask-dev-coverage-counts")).toHaveTextContent("8 facts from 73 source rows.");
    });

    it("reads each requirement from its last row: later stages supersede earlier ones", () => {
        render(<AskDevCoverage result={statusPartial} />);
        const items = within(block("ask-dev-coverage-requirements")).getAllByRole("listitem");
        expect(items.map((item) => item.textContent)).toEqual([
            expect.stringContaining("Health: read in part: 1 of 1"),
            expect.stringContaining("Status: read in part: 2 of 5"),
        ]);
        // The planning rows said "satisfied"; the assembled rows that replace them did not.
        expect(block("ask-dev-coverage-requirements")).not.toHaveTextContent("read in full");
    });

    it("says completeness is not known when the result carries none", () => {
        // A copy of a real answer without completeness (an older stored result has none).
        const copy = copyOf(projectStatusPartial) as unknown as Record<string, unknown>;
        delete copy.completeness;
        render(<AskDevCoverage result={copy as unknown as CoverageResult} />);
        expect(block("ask-dev-coverage-state")).toHaveTextContent(COMPLETENESS_TEXT.absent);
        expect(readingOf("ask-dev-coverage-state")).toBe("unknown");
        expect(within(coverage()).queryByTestId("ask-dev-coverage-counts")).toBeNull();
    });
});

describe("AskDevCoverage: sources (check 12, missing is not healthy)", () => {
    it("says a pruned source was not needed, and a truncated one partly included", () => {
        const pruned = sourceLines(mergedPrs).find((line) => line.text.includes("not needed"));
        expect(pruned?.reading).toBe("not_applicable");
        const truncated = sourceLines(statusPartial).find((l) => l.reading === "sparse");
        expect(truncated?.text).toBe("partly included");
    });

    it("gives unknown, stale, sparse, not applicable and zero their own words and marks", () => {
        // Copies of one real answer, one source state changed per copy: kiac served no stale or
        // empty source.
        const states = ["unavailable", "stale", "truncated", "not_applicable", "no_data"];
        const lines = states.map((state) => {
            const copy = copyOf(ciRateComplete);
            const source = copy.coverage.sources[0]!;
            source.state = state;
            source.observed_at = "2026-10-01T09:00:00Z";
            return sourceLines(copy)[0]!;
        });
        expect(lines.map((line) => line.reading)).toEqual([
            "unknown",
            "stale",
            "sparse",
            "not_applicable",
            "zero",
        ]);
        expect(new Set(lines.map((line) => line.text)).size).toBe(5);
        for (const line of lines) expect(line.text).not.toBe("read");
        expect(lines[1]!.observedAt).toBe("Oct 1, 2026");

        const marks = new Set<string>();
        for (const state of states) {
            const copy = copyOf(ciRateComplete);
            copy.coverage.sources = [{ ...copy.coverage.sources[0]!, state }];
            const { unmount } = render(<AskDevCoverage result={copy} />);
            const item = within(block("ask-dev-coverage-sources")).getByRole("listitem");
            marks.add(item.querySelector("[aria-hidden=true]")?.textContent ?? "");
            unmount();
        }
        expect(marks.size).toBe(5);
    });

    it("shows a state it does not know by name and reads it as not known, never as read", () => {
        const copy = copyOf(ciRateComplete);
        copy.coverage.sources[0]!.state = "quarantined";
        const [line] = sourceLines(copy);
        expect(line).toMatchObject({ text: "quarantined: not known", reading: "unknown" });
    });

    it("says what was read is not known when no source is reported", () => {
        const copy = copyOf(ciRateComplete);
        copy.coverage.sources = [];
        render(<AskDevCoverage result={copy} />);
        expect(block("ask-dev-coverage-sources")).toHaveTextContent(COVERAGE_COPY.sourcesEmpty);
    });
});

describe("AskDevCoverage: limits shown with the answer (checks 4 and 5)", () => {
    it("lists the degrading coverage details first, as ACR labelled them", () => {
        // A copy of a real answer with its details in reverse: ACR served them degrading first.
        const copy = copyOf(teamOpenWorkDegraded);
        copy.coverage.details = [...(copy.coverage.details ?? [])].reverse();
        expect(copy.coverage.details[0]?.degrading).toBe(false);
        render(<AskDevCoverage result={copy} />);
        const items = within(block("ask-dev-coverage-details")).getAllByRole("listitem");
        const degrading = items.map((item) => item.getAttribute("data-degrading"));
        expect(degrading).toEqual(["true", "true", "true", "true", "true", "false"]);
        expect(items.at(-1)).toHaveTextContent("Investment facts were limited");
    });

    it("lists the limitations and warnings as served, beside the answer", () => {
        render(<AskDevAnswer result={openWork} />);
        const limitations = within(block("ask-dev-coverage-limitations")).getAllByRole("listitem");
        expect(limitations.map((l) => l.textContent)).toEqual(openWork.limitations);
        expect(block("ask-dev-coverage-warnings")).toHaveTextContent(openWork.warnings[0]!);
        // The answer is still shown: limits constrain it, they do not withhold it.
        expect(screen.getByTestId("ask-dev-answer-drivers")).toBeInTheDocument();
    });

    it("says when no limitation was named", () => {
        render(<AskDevCoverage result={ciComplete} />);
        expect(block("ask-dev-coverage-limitations")).toHaveTextContent(
            COVERAGE_COPY.noLimitations,
        );
    });

    it("renders served text inert", () => {
        // A copy of a real answer with one hostile limitation.
        const copy = copyOf(ciRateComplete);
        copy.limitations = ['<img src=x onerror="alert(1)">'];
        render(<AskDevCoverage result={copy} />);
        expect(coverage().querySelector("img")).toBeNull();
        expect(block("ask-dev-coverage-limitations")).toHaveTextContent(
            '<img src=x onerror="alert(1)">',
        );
    });
});

describe("AskDevCoverage: evidence references, not openable yet", () => {
    it("groups the cited and the full evidence by kind, with counts", () => {
        render(<AskDevCoverage result={statusPartial} />);
        const cited = block("ask-dev-coverage-evidence-cited");
        expect(
            within(cited)
                .getAllByRole("listitem")
                .map((i) => i.textContent),
        ).toEqual(["1 project", "1 team"]);
        const all = block("ask-dev-coverage-evidence-all");
        expect(
            within(all)
                .getAllByRole("listitem")
                .map((i) => i.textContent),
        ).toEqual(["25 CI runs", "4 repositories", "1 project", "1 team"]);
    });

    it("shows no id and nothing that looks or acts like a link", () => {
        render(<AskDevCoverage result={statusPartial} />);
        const evidence = block("ask-dev-coverage-evidence");
        expect(evidence).toHaveTextContent(COVERAGE_COPY.evidenceNotOpenable);
        expect(evidence.textContent).not.toMatch(/acr:v1|[0-9a-f]{8}-[0-9a-f]{4}-|linear:/u);
        expect(coverage().querySelectorAll("a, button, [role=link], [tabindex]")).toHaveLength(0);
        expect(evidence.querySelector(".underline, .cursor-pointer")).toBeNull();
    });

    it("says when the answer cites no evidence", () => {
        // A copy of a real answer with its references removed.
        const copy = copyOf(ciRateComplete);
        copy.evidence_ref_ids = [];
        copy.evidence_ref_labels = {};
        render(<AskDevCoverage result={copy} />);
        expect(block("ask-dev-coverage-evidence")).toHaveTextContent(COVERAGE_COPY.evidenceNone);
    });

    it("reads an unknown reference kind as other evidence, never as an id", () => {
        expect(evidenceGroups(["acr:v1:widget:abc", "not-an-acr-ref-1234"])).toEqual([
            { kind: "evidence", count: 2, text: "2 other references" },
        ]);
    });
});
