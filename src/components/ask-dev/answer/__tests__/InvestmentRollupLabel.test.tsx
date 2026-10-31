import { describe, expect, it, vi } from "vitest";
// No canvas in jsdom: the cohort charts draw through a stub that keeps ECharts' event order.
vi.mock(
    "@/lib/echartsInit",
    async () => (await import("../../render/__tests__/echartsStub")).echartsStubModule,
);
import { render, screen, within } from "@/test/utils";

import { AskDevAnswer } from "../AskDevAnswer";
import type { AnswerResult } from "../answerModel";
import { INVESTMENT_ROLLUP_COPY } from "../investmentRollup";
import projectsRollup from "./captures/kiac_projects_feature_investment_rollup.event.json";
import themeMixRollup from "./captures/kiac_project_theme_mix_rollup.event.json";
import repoRanking from "../../../../lib/ask-dev/render/__oracle__/captures/kiac_repo_attention_ranking.event.json";

/**
 * CHAOS-12178: the owning-team roll-up label wherever an investment claim about a project is drawn
 * (drivers, the ranking, the claimed-fact tables). Real scrubbed kiac answers taken after the R1
 * pin bump; a state they do not hold changes one field of a copy and says so.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- tests edit captured JSON */
const PROJECTS = (projectsRollup as { result: unknown }).result as AnswerResult;
const THEME_MIX = (themeMixRollup as { result: unknown }).result as AnswerResult;
const REPOS = (repoRanking as { result: unknown }).result as AnswerResult;
const copy = (result: AnswerResult): any => structuredClone(result);

const labels = (scope: HTMLElement) => within(scope).queryAllByTestId("ask-dev-investment-rollup");
const drivers = () => screen.getAllByTestId("ask-dev-answer-driver");
const driverTitled = (title: string) =>
    drivers().find((driver) => driver.textContent?.includes(title))!;

describe("drivers", () => {
    it("labels the driver that cites a roll-up claim, and only that one", () => {
        render(<AskDevAnswer result={PROJECTS} />);
        const rollup = driverTitled("Synthetic Project November: investment mix");
        const native = driverTitled("Synthetic Project Tango: investment mix");
        const [label] = labels(rollup);
        expect(label).toBeDefined();
        expect(label!.textContent).toBe(
            INVESTMENT_ROLLUP_COPY.visible({ ownUnits: 0, units: 5011 }) +
                INVESTMENT_ROLLUP_COPY.aria({ ownUnits: 0, units: 5011 }),
        );
        expect(
            within(label!).getByText(INVESTMENT_ROLLUP_COPY.aria({ ownUnits: 0, units: 5011 })),
        ).toHaveClass("sr-only");
        expect(labels(native)).toHaveLength(0);
        // The health and workload drivers cite no investment claim.
        for (const driver of drivers()) {
            if (driver.dataset.category !== "investment") expect(labels(driver)).toHaveLength(0);
        }
    });

    it("labels the one driver of a single project's theme mix", () => {
        render(<AskDevAnswer result={THEME_MIX} />);
        const [driver] = drivers();
        expect(labels(driver!)).toHaveLength(1);
        expect(labels(driver!)[0]!.dataset.subject).toBe(
            (THEME_MIX as any).claimed_facts[0].subject.canonical_id,
        );
    });

    it("names the project when a driver cites roll-ups of more than one project", () => {
        const result = copy(PROJECTS);
        const target = result.drivers.find(
            (driver: any) => driver.driver_id === "cohort-driver-02-1",
        );
        // Edited: the driver also cites a second project's roll-up claim (claim-investment-001).
        target.claimed_fact_ids = [...target.claimed_fact_ids, "claim-investment-001"];
        render(<AskDevAnswer result={result} />);
        const shown = labels(driverTitled("Synthetic Project November: investment mix"));
        expect(shown).toHaveLength(2);
        expect(shown.map((label) => label.textContent?.split(":")[0])).toEqual([
            "Synthetic Project November",
            "Synthetic Project Kilo",
        ]);
    });
});

describe("the ranking", () => {
    it("labels each ranked project served the roll-up: 11 of 19 rows", () => {
        render(<AskDevAnswer result={PROJECTS} />);
        const rows = within(screen.getByTestId("ask-dev-ranking")).getAllByTestId(
            "ask-dev-ranking-row",
        );
        expect(rows).toHaveLength(19);
        const labelled = rows.filter((row) => labels(row).length === 1);
        expect(labelled).toHaveLength(11);
        for (const row of rows) {
            const name = within(row).getByTestId("ask-dev-ranking-name").textContent ?? "";
            const claim = (PROJECTS as any).claimed_facts.find(
                (fact: any) => fact.kind === "investment" && fact.subject.label === name,
            );
            const isRollup = claim?.investment_mix?.investment_mix_source === "owning_team_rollup";
            expect(labels(row), name).toHaveLength(isRollup ? 1 : 0);
        }
    });
});

describe("nothing is invented", () => {
    it("shows no label when no claim carries investment_mix", () => {
        const result = copy(PROJECTS);
        // Edited: every investment_mix removed, as an answer from before acr #1800.
        for (const fact of result.claimed_facts) delete fact.investment_mix;
        render(<AskDevAnswer result={result} />);
        expect(screen.queryAllByTestId("ask-dev-investment-rollup")).toHaveLength(0);
    });
});

describe("claimed-fact tables", () => {
    it("labels a table whose cited investment claim is a roll-up", () => {
        const result = copy(REPOS);
        const fact = result.claimed_facts.find(
            (claim: any) => claim.claim_id === "claim_investment_web_quality",
        );
        // Edited: the captured rowed investment claim carries a roll-up mix (no real capture has a
        // rowed project investment claim yet).
        fact.investment_mix = {
            investment_mix_source: "owning_team_rollup",
            rollup_basis: "team_project_ownership_via_owned_repos_work_unit_investments",
            work_unit_count: 120,
            project_own_work_unit_count: 0,
        };
        render(<AskDevAnswer result={result} />);
        const tables = screen.getAllByTestId("ask-dev-fact-table");
        const labelled = tables.filter((table) => labels(table).length > 0);
        expect(labelled).toHaveLength(1);
        expect(labelled[0]!.dataset.claimIds).toContain("claim_investment_web_quality");
    });

    it("labels no table of the captured answer, which holds no roll-up", () => {
        render(<AskDevAnswer result={REPOS} />);
        for (const table of screen.getAllByTestId("ask-dev-fact-table")) {
            expect(labels(table)).toHaveLength(0);
        }
    });
});
