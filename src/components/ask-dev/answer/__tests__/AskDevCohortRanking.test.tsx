import { describe, expect, it, vi } from "vitest";
// No canvas in jsdom: the cohort charts draw through a stub that keeps ECharts' event order (CHAOS-11943).
vi.mock(
    "@/lib/echartsInit",
    async () => (await import("../../render/__tests__/echartsStub")).echartsStubModule,
);
import { rawWordsIn } from "@/test/rawWords";
import { render, screen, within } from "@/test/utils";

import { AskDevAnswer } from "../AskDevAnswer";
import { humanizeTerm } from "@/lib/ask-dev/facts/fact-rows";

import { AskDevCohortRanking, RANKING_COPY } from "../AskDevCohortRanking";
import type { AnswerResult } from "../answerModel";
import mergedPrsDegraded from "./captures/kiac_repo_merged_prs_degraded.event.json";
import seedTeams from "../../../../lib/ask-dev/render/__oracle__/captures/seed-cv-discovered-team-series-rep1-t2-a1.result.json";
import repoRanking from "../../../../lib/ask-dev/render/__oracle__/captures/kiac_repo_attention_ranking.event.json";

/**
 * CHAOS-11944. Every answer is real, scrubbed ACR output: the public ask-dev seed (a discovered
 * team cohort, 3 ranked, 1 scored) and two kiac answers (4 ranked repositories; an explicit cohort
 * of 25 pull requests). A state they do not hold changes one field of a copy and says so.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- tests edit captured JSON */
const SEED = seedTeams as unknown as AnswerResult;
const REPOS = (repoRanking as { result: unknown }).result as AnswerResult;
const PRS = (mergedPrsDegraded as { result: unknown }).result as AnswerResult;
const copy = (result: AnswerResult): any => structuredClone(result);

/** A completeness word ACR serves (CHAOS-12245): never display text, in any case. */
const RAW_COMPLETENESS = /\b(complete|partial|degraded|not_derived)\b/iu;

/** A member's served driver rows, as the view counts them (never mapped back from the enum). */
const driversOf = (member: any) => `${member.drivers.length} of 5 drivers`;

const ranking = () => screen.getByTestId("ask-dev-ranking");
const rows = () => within(ranking()).getAllByTestId("ask-dev-ranking-row");
const cellsOf = (testId: string) => within(ranking()).getAllByTestId(testId);

/** No member name, score, rank or chart of the cohort reaches the page. */
function expectNothingOfTheCohort(result: any) {
    const text = document.body.textContent ?? "";
    for (const member of result.cohort.members) expect(text).not.toContain(member.subject.label);
    expect(screen.queryByTestId("ask-dev-ranking")).toBeNull();
    expect(screen.queryAllByTestId("ask-dev-ranking-row")).toHaveLength(0);
    expect(screen.queryAllByTestId("ask-dev-ranking-score")).toHaveLength(0);
    expect(screen.queryByTestId("ask-dev-ranking-chart-slot")).toBeNull();
}

describe("a ranked cohort", () => {
    it("the seed answer: 3 rows in attention-rank order, 1 score, the others say why", () => {
        render(<AskDevCohortRanking result={SEED} />);
        expect(within(ranking()).getByRole("heading", { name: "Ranked teams" })).toBeTruthy();
        expect(rows()).toHaveLength(3);
        const members = [...(SEED as any).cohort.members].sort(
            (a: any, b: any) => a.attention_rank - b.attention_rank,
        );
        expect(cellsOf("ask-dev-ranking-name").map((c) => c.textContent)).toEqual(
            members.map((m: any) => m.subject.label),
        );
        expect(cellsOf("ask-dev-ranking-score").map((c) => c.getAttribute("data-state"))).toEqual([
            "score",
            "none",
            "none",
        ]);
        expect(cellsOf("ask-dev-ranking-outcome").map((c) => c.textContent)).toEqual([
            "Provisional",
            "Insufficient evidence",
            "Insufficient evidence",
        ]);
        expect(within(rows()[0]!).getAllByTestId("ask-dev-ranking-driver")).toHaveLength(2);
        expect(within(rows()[1]!).getByTestId("ask-dev-ranking-no-drivers").textContent).toBe(
            RANKING_COPY.driversEmpty,
        );
        expect(within(ranking()).getByTestId("ask-dev-ranking-window").textContent).toBe(
            "Window: Last 90 days",
        );
        expect(screen.queryByTestId("ask-dev-ranking-incomplete")).toBeNull();
        expect(screen.queryByTestId("ask-dev-ranking-unranked")).toBeNull();
    });

    it("the repository answer: 4 rows, 4 scores, each with its outcome and 2 drivers", () => {
        render(<AskDevCohortRanking result={REPOS} />);
        expect(
            within(ranking()).getByRole("heading", { name: "Ranked repositories" }),
        ).toBeTruthy();
        expect(rows()).toHaveLength(4);
        for (const row of rows()) {
            expect(
                within(row).getByTestId("ask-dev-ranking-score").getAttribute("data-state"),
            ).toBe("score");
            expect(within(row).getByTestId("ask-dev-ranking-outcome").textContent).toBe(
                "Provisional",
            );
            expect(within(row).getAllByTestId("ask-dev-ranking-driver")).toHaveLength(2);
        }
        expect(within(ranking()).getByTestId("ask-dev-ranking-window").textContent).toBe(
            "Window: Last 30 days",
        );
    });

    it("shows driver numbers to 2 decimals, the exact served value in the title", () => {
        const exact = copy(REPOS);
        const member = exact.cohort.members[0];
        member.drivers = [
            {
                ...member.drivers[0],
                value: 0.7999999999999999,
                weight_contributed: 26.666666666666668,
                weight: 20,
            },
        ];
        render(<AskDevCohortRanking result={exact} />);
        const row = rows().find(
            (r) =>
                within(r).getByTestId("ask-dev-ranking-name").textContent === member.subject.label,
        )!;
        const [driver] = within(row).getAllByTestId("ask-dev-ranking-driver");
        expect(driver!.textContent).toContain("value 0.8 · contributed 26.67 of 20");
        expect(
            [...driver!.querySelectorAll("[title]")].map((n) => n.getAttribute("title")),
        ).toEqual(["0.7999999999999999", "26.666666666666668", "20"]);
    });

    it.each([1, 2, 3])("a %i-team cohort shows %i rows (small orgs)", (size) => {
        const small = copy(SEED);
        small.cohort.members = small.cohort.members.slice(0, size);
        render(<AskDevCohortRanking result={small} />);
        expect(rows()).toHaveLength(size);
    });

    it("a driverless score is withheld, never shown bare (check 8)", () => {
        const bare = copy(SEED);
        const top = bare.cohort.members.find((m: any) => m.score !== undefined);
        top.drivers = [];
        render(<AskDevCohortRanking result={bare} />);
        const scores = cellsOf("ask-dev-ranking-score");
        expect(scores.map((c) => c.getAttribute("data-state"))).toEqual([
            "withheld",
            "none",
            "none",
        ]);
        expect(scores[0]!.textContent).toBe("withheld");
        expect(ranking().textContent).not.toContain(String(top.score));
        expect(within(rows()[0]!).getByTestId("ask-dev-ranking-no-drivers").textContent).toBe(
            RANKING_COPY.driversWithheld,
        );
    });

    it("score, none and withheld are three different cells", () => {
        const three = copy(REPOS);
        delete three.cohort.members[1].score;
        three.cohort.members[2].drivers = [];
        render(<AskDevCohortRanking result={three} />);
        const states = cellsOf("ask-dev-ranking-score").map((c) => [
            c.getAttribute("data-state"),
            c.textContent,
        ]);
        expect(new Set(states.map(([s]) => s))).toEqual(new Set(["score", "none", "withheld"]));
        expect(states.find(([s]) => s === "none")![1]).toBe("—");
    });

    it("each outcome is its own word, and an absent outcome is a dash (AC-11)", () => {
        const outcomes = copy(REPOS);
        const words = ["qualified", "provisional", "insufficient_evidence", "not_applicable"];
        outcomes.cohort.members.forEach((m: any, i: number) => (m.outcome = words[i]));
        render(<AskDevCohortRanking result={outcomes} />);
        expect(new Set(cellsOf("ask-dev-ranking-outcome").map((c) => c.textContent))).toEqual(
            new Set(["Qualified", "Provisional", "Insufficient evidence", "Not applicable"]),
        );
    });

    it("an absent outcome reads as a dash", () => {
        const absent = copy(REPOS);
        delete absent.cohort.members[0].outcome;
        render(<AskDevCohortRanking result={absent} />);
        expect(cellsOf("ask-dev-ranking-outcome").map((c) => c.textContent)).toContain("—");
    });

    it("says when the cohort is truncated or not complete, and names unranked members", () => {
        const truncated = copy(REPOS);
        truncated.cohort.truncated = true;
        truncated.cohort.members[3].ranking_computed = false;
        const { unmount } = render(<AskDevCohortRanking result={truncated} />);
        expect(within(ranking()).getByTestId("ask-dev-ranking-incomplete").textContent).toMatch(
            /truncated/u,
        );
        const unrankedText = within(ranking()).getByTestId("ask-dev-ranking-unranked").textContent;
        expect(unrankedText).toBe(
            `Not ranked by the service: ${truncated.cohort.members[3].subject.label} (outcome Provisional, ${driversOf(truncated.cohort.members[3])}).`,
        );
        expect(unrankedText).not.toMatch(RAW_COMPLETENESS);
        expect(rows()).toHaveLength(3);
        unmount();
        const incomplete = copy(REPOS);
        incomplete.cohort.complete = false;
        render(<AskDevCohortRanking result={incomplete} />);
        expect(within(ranking()).getByTestId("ask-dev-ranking-incomplete").textContent).toMatch(
            /did not report this cohort as complete/u,
        );
    });

    it("shows missing signals per member", () => {
        const missing = copy(REPOS);
        missing.cohort.members[0].missing_signals = ["readiness.coverage_gap"];
        render(<AskDevCohortRanking result={missing} />);
        const lines = cellsOf("ask-dev-ranking-missing-signals").map((c) => c.textContent);
        expect(lines).toContain(
            `${missing.cohort.members[0].subject.label} — missing signals: readiness.coverage gap`,
        );
        expect(lines).toHaveLength(
            missing.cohort.members.filter((m: any) => m.missing_signals !== undefined).length,
        );
    });

    // codex r1 on #1628: an unranked member's missing signals were dropped silently.
    it("names an unranked member with only the words ACR served for it, never a score or rank", () => {
        const unranked = copy(REPOS);
        const [a, b] = [unranked.cohort.members[2], unranked.cohort.members[3]];
        a.ranking_computed = false;
        a.outcome = "insufficient_evidence";
        delete a.data_completeness;
        b.ranking_computed = false;
        delete b.outcome;
        delete b.data_completeness;
        render(<AskDevCohortRanking result={unranked} />);
        const line = within(ranking()).getByTestId("ask-dev-ranking-unranked").textContent ?? "";
        // CHAOS-12245: the served driver rows stay, even with no data_completeness word served.
        expect(line).toBe(
            `Not ranked by the service: ${a.subject.label} (outcome Insufficient evidence, ${driversOf(a)}); ${b.subject.label} (${driversOf(b)}).`,
        );
        expect(line).not.toContain(String(a.score));
        expect(rows()).toHaveLength(2);
    });

    it("shows missing signals of an unranked member too, after the ranked ones", () => {
        const unranked = copy(REPOS);
        unranked.cohort.members.forEach((m: any) => delete m.missing_signals);
        const member = unranked.cohort.members[3];
        member.ranking_computed = false;
        member.missing_signals = ["readiness.coverage_gap"];
        render(<AskDevCohortRanking result={unranked} />);
        expect(cellsOf("ask-dev-ranking-missing-signals").map((c) => c.textContent)).toEqual([
            `${member.subject.label} — missing signals: readiness.coverage gap`,
        ]);
        expect(rows()).toHaveLength(3);
    });

    it("reads Window not stated when the answer has no window", () => {
        const noWindow = copy(REPOS);
        delete noWindow.effective_evidence_window;
        render(<AskDevCohortRanking result={noWindow} />);
        expect(within(ranking()).getByTestId("ask-dev-ranking-window").textContent).toBe(
            "Window: Window not stated",
        );
    });

    it("an open answer with a cohort shape is ranked (Q1)", () => {
        const open = copy(SEED);
        open.interpretation.shape = "open";
        render(<AskDevCohortRanking result={open} />);
        expect(rows()).toHaveLength(3);
    });

    it("fits the panel: 4 columns, each member's details in a full-width row below it", () => {
        render(<AskDevCohortRanking result={REPOS} />);
        const table = within(ranking()).getByTestId("ask-dev-ranking-table");
        expect(
            within(table)
                .getAllByRole("columnheader")
                .map((c) => c.textContent),
        ).toEqual(["Rank", "Repository", "Score", "Outcome"]);
        for (const row of rows()) {
            const detail = within(row).getByTestId("ask-dev-ranking-detail");
            expect(detail.getAttribute("colspan")).toBe("4");
            const name = within(row).getByTestId("ask-dev-ranking-name").textContent ?? "";
            expect(detail.textContent).toContain(`${name}: `);
            // CHAOS-12245: the member's served driver rows, never its data_completeness word.
            const cell = within(detail).getByTestId("ask-dev-ranking-completeness");
            const member = REPOS.cohort!.members.find((m) => m.subject.label === name);
            expect(cell.textContent).toBe(driversOf(member));
            expect(rawWordsIn(detail, RAW_COMPLETENESS)).toEqual([]);
        }
        expect(document.querySelectorAll("section, [role=region], [tabindex]")).toHaveLength(0);
    });

    it("keeps served text as text: a hostile label is not markup", () => {
        const hostile = copy(REPOS);
        hostile.cohort.members[0].subject.label = '<img src=x onerror="alert(1)">Repo';
        render(<AskDevCohortRanking result={hostile} />);
        expect(ranking().querySelector("img")).toBeNull();
        expect(cellsOf("ask-dev-ranking-name").map((c) => c.textContent)).toContain(
            '<img src=x onerror="alert(1)">Repo',
        );
    });
});

describe("a member's data completeness, as its served driver rows (CHAOS-12245)", () => {
    it("counts the served rows, never a number mapped from the enum (partial is 3 or 4)", () => {
        const counted = copy(REPOS);
        const [p, d] = [counted.cohort.members[0], counted.cohort.members[1]];
        p.data_completeness = "partial";
        p.drivers = [...p.drivers, ...p.drivers].slice(0, 4);
        d.data_completeness = "degraded";
        d.drivers = d.drivers.slice(0, 1);
        render(<AskDevCohortRanking result={counted} />);
        const cellFor = (label: string) =>
            within(
                rows().find(
                    (r) => within(r).getByTestId("ask-dev-ranking-name").textContent === label,
                )!,
            ).getByTestId("ask-dev-ranking-completeness").textContent;
        expect(cellFor(p.subject.label)).toBe("4 of 5 drivers");
        expect(cellFor(d.subject.label)).toBe("1 of 5 drivers");
    });

    // codex r3 on #1650: an empty driver list serves no rows, so it says nothing either.
    it("shows no completeness text for a member whose driver list is empty", () => {
        const empty = copy(REPOS);
        empty.cohort.members[0].drivers = [];
        empty.cohort.members[3].drivers = [];
        empty.cohort.members[3].ranking_computed = false;
        render(<AskDevCohortRanking result={empty} />);
        const first = empty.cohort.members[0].subject.label;
        const row = rows().find(
            (r) => within(r).getByTestId("ask-dev-ranking-name").textContent === first,
        )!;
        expect(within(row).queryByTestId("ask-dev-ranking-completeness")).toBeNull();
        expect(within(ranking()).getByTestId("ask-dev-ranking-unranked").textContent).toBe(
            `Not ranked by the service: ${empty.cohort.members[3].subject.label} (outcome Provisional).`,
        );
    });

    it("shows no completeness text for a member that serves no driver rows, ranked or not", () => {
        const noDrivers = copy(REPOS);
        delete noDrivers.cohort.members[0].drivers;
        delete noDrivers.cohort.members[3].drivers;
        noDrivers.cohort.members[3].ranking_computed = false;
        render(<AskDevCohortRanking result={noDrivers} />);
        const first = noDrivers.cohort.members[0].subject.label;
        const row = rows().find(
            (r) => within(r).getByTestId("ask-dev-ranking-name").textContent === first,
        )!;
        expect(within(row).queryByTestId("ask-dev-ranking-completeness")).toBeNull();
        expect(rawWordsIn(row, RAW_COMPLETENESS)).toEqual([]);
        const unranked = within(ranking()).getByTestId("ask-dev-ranking-unranked").textContent;
        expect(unranked).toBe(
            `Not ranked by the service: ${noDrivers.cohort.members[3].subject.label} (outcome Provisional).`,
        );
    });
});

/**
 * CHAOS-12283, decision (a): a member with a completeness value but no driver rows gets nothing
 * more. ACR serves driver rows only for a qualified or provisional outcome; an insufficient_evidence
 * or not_applicable member serves `missing_signals` instead. The view already says what is known:
 * its outcome, that no drivers were reported, and which signals are missing. Never the state word,
 * never a number.
 */
describe("a member that serves no driver rows (CHAOS-12283)", () => {
    it("the seed answer: each no-driver member shows its outcome, No drivers reported and its missing signals, never a completeness word", () => {
        const members = (SEED as any).cohort.members as any[];
        const noDrivers = members.filter(
            (m) => m.data_completeness !== undefined && m.drivers === undefined,
        );
        // Real ACR output holds both shapes: degraded with no rows, and partial with no rows.
        expect(noDrivers.map((m) => [m.subject.label, m.data_completeness, m.outcome])).toEqual([
            ["Teambeta", "degraded", "insufficient_evidence"],
            ["teamalpha", "partial", "insufficient_evidence"],
        ]);
        render(<AskDevCohortRanking result={SEED} />);
        const missingLines = cellsOf("ask-dev-ranking-missing-signals").map((c) => c.textContent);
        for (const member of noDrivers) {
            const row = rows().find(
                (r) =>
                    within(r).getByTestId("ask-dev-ranking-name").textContent ===
                    member.subject.label,
            )!;
            expect(within(row).getByTestId("ask-dev-ranking-outcome").textContent).toBe(
                "Insufficient evidence",
            );
            expect(within(row).getByTestId("ask-dev-ranking-no-drivers").textContent).toBe(
                RANKING_COPY.driversEmpty,
            );
            expect(within(row).queryByTestId("ask-dev-ranking-completeness")).toBeNull();
            expect(rawWordsIn(row, RAW_COMPLETENESS)).toEqual([]);
            const line = missingLines.find((text) =>
                text?.startsWith(`${member.subject.label} — ${RANKING_COPY.missingSignals}: `),
            );
            expect(line, member.subject.label).toBe(
                `${member.subject.label} — ${RANKING_COPY.missingSignals}: ${member.missing_signals.map(humanizeTerm).join(", ")}`,
            );
            expect(line).not.toMatch(RAW_COMPLETENESS);
        }
    });

    it("a pull-request cohort whose members serve no driver rows shows no member at all, so no completeness text", () => {
        const members = (PRS as any).cohort.members as any[];
        // codex r1 on #1660: `every` holds for an empty list, so the premise is pinned by count.
        expect(members).toHaveLength(25);
        expect(
            members.every((m) => m.drivers === undefined && m.data_completeness === "degraded"),
        ).toBe(true);
        render(<AskDevCohortRanking result={PRS} />);
        expect(screen.getByTestId("ask-dev-ranking-not-shown")).toBeTruthy();
        expect(rawWordsIn(document.body, RAW_COMPLETENESS)).toEqual([]);
        expectNothingOfTheCohort(PRS);
    });
});

describe("Ranking not shown (G1) and Not ranked by the service", () => {
    const withKinds = (cohortKind: string, memberKind?: (i: number) => string) => {
        const result = copy(SEED);
        result.cohort.kind = cohortKind;
        result.cohort.members.forEach(
            (m: any, i: number) => (m.subject.kind = memberKind ? memberKind(i) : cohortKind),
        );
        return result;
    };

    it.each([
        ["person as the cohort kind", withKinds("person")],
        ["person as one member kind", withKinds("team", (i) => (i === 0 ? "person" : "team"))],
        ["an unknown kind", withKinds("planted_kind")],
        ["organization (codex r3 on #1625)", withKinds("organization")],
    ])("%s: the notice, and no name, score, rank or chart", (_name, result) => {
        render(<AskDevCohortRanking result={result} />);
        const notice = screen.getByTestId("ask-dev-ranking-not-shown");
        expect(
            within(notice).getByRole("heading", { name: RANKING_COPY.notShownTitle }),
        ).toBeTruthy();
        expect(notice.textContent).toContain(RANKING_COPY.notShown);
        expectNothingOfTheCohort(result);
    });

    it("the real pull-request cohort is not ranked", () => {
        render(<AskDevCohortRanking result={PRS} />);
        expect(screen.getByTestId("ask-dev-ranking-not-shown")).toBeTruthy();
        expectNothingOfTheCohort(PRS);
    });

    // codex r2 on #1628: with no member ranked, the window, the incomplete notice, the missing
    // signals and the unranked names were dropped.
    it("ACR ranked no member: Not ranked by the service, with what it does not cover, and no rows", () => {
        const unranked = copy(REPOS);
        unranked.cohort.members.forEach((m: any) => (m.ranking_computed = false));
        unranked.cohort.truncated = true;
        render(<AskDevCohortRanking result={unranked} />);
        const notice = screen.getByTestId("ask-dev-ranking-not-computed");
        expect(notice.textContent).toContain(RANKING_COPY.notComputed);
        expect(within(notice).getByTestId("ask-dev-ranking-window").textContent).toBe(
            "Window: Last 30 days",
        );
        expect(within(notice).getByTestId("ask-dev-ranking-incomplete").textContent).toMatch(
            /truncated/u,
        );
        const entries = unranked.cohort.members.map(
            (m: any) => `${m.subject.label} (outcome Provisional, ${driversOf(m)})`,
        );
        expect(within(notice).getByTestId("ask-dev-ranking-unranked").textContent).toBe(
            `Not ranked by the service: ${entries.join("; ")}.`,
        );
        expect(within(notice).getAllByTestId("ask-dev-ranking-missing-signals")).toHaveLength(
            unranked.cohort.members.filter((m: any) => m.missing_signals !== undefined).length,
        );
        expect(screen.queryAllByTestId("ask-dev-ranking-row")).toHaveLength(0);
        expect(screen.queryAllByTestId("ask-dev-ranking-score")).toHaveLength(0);
        expect(screen.queryAllByTestId("ask-dev-ranking-rank")).toHaveLength(0);
        expect(screen.queryByTestId("ask-dev-ranking-chart-slot")).toBeNull();
    });

    it("no cohort: nothing at all", () => {
        const none = copy(SEED);
        delete none.cohort;
        const { container } = render(<AskDevCohortRanking result={none} />);
        expect(container.textContent).toBe("");
    });
});

describe("in the answer", () => {
    it("the ranking comes after the quick answer and before the drivers", () => {
        render(<AskDevAnswer result={REPOS} />);
        const answer = screen.getByTestId("ask-dev-answer");
        const order = [...answer.querySelectorAll("[data-testid]")]
            .map((n) => n.getAttribute("data-testid"))
            .filter((id) =>
                ["ask-dev-answer-quick", "ask-dev-ranking", "ask-dev-answer-drivers"].includes(
                    id ?? "",
                ),
            );
        expect(order).toEqual([
            "ask-dev-answer-quick",
            "ask-dev-ranking",
            "ask-dev-answer-drivers",
        ]);
    });

    it("an answer without a cohort renders no ranking", () => {
        const none = copy(REPOS);
        delete none.cohort;
        render(<AskDevAnswer result={none} />);
        expect(screen.queryByTestId("ask-dev-ranking")).toBeNull();
        expect(screen.queryByTestId("ask-dev-ranking-not-shown")).toBeNull();
    });
});
