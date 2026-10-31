import { describe, expect, it } from "vitest";

import type { AnswerResult } from "../answerModel";
import {
    INVESTMENT_ROLLUP_COPY,
    investmentRollupOf,
    rollupForSubject,
    rollupsOfClaims,
} from "../investmentRollup";
import projectsRollup from "./captures/kiac_projects_feature_investment_rollup.event.json";
import themeMixRollup from "./captures/kiac_project_theme_mix_rollup.event.json";

/**
 * CHAOS-12178. acr #1800 (CHAOS-12160) puts `investment_mix` on an investment claim about a
 * project; `owning_team_rollup` means the value is the owning teams' roll-up, because the project
 * has no measurable work of its own in the window, and it must be disclosed (CHAOS-5930 decision A).
 * Both captures are real, scrubbed kiac answers taken after the R1 pin bump: 19 ranked projects (11
 * of them served the roll-up), and one project's theme mix (all roll-up). A state they do not hold
 * changes one field of a copy and says so.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- tests edit captured JSON */
const PROJECTS = (projectsRollup as { result: unknown }).result as AnswerResult;
const THEME_MIX = (themeMixRollup as { result: unknown }).result as AnswerResult;
const claims = (result: AnswerResult) => result.claimed_facts ?? [];
const copy = <T>(value: T): any => structuredClone(value);

describe("investmentRollupOf", () => {
    it("discloses exactly the claims the service marked owning_team_rollup", () => {
        const all = claims(PROJECTS);
        const marked = all.filter(
            (claim) => claim.investment_mix?.investment_mix_source === "owning_team_rollup",
        );
        expect(marked.length).toBeGreaterThan(0);
        for (const claim of all) {
            const rollup = investmentRollupOf(claim);
            if (marked.includes(claim)) {
                expect(rollup, claim.claim_id).toEqual({
                    subject: claim.subject,
                    ownUnits: claim.investment_mix!.project_own_work_unit_count,
                    units: claim.investment_mix!.work_unit_count,
                });
            } else {
                expect(rollup, claim.claim_id).toBeNull();
            }
        }
    });

    it("shows nothing for a project_native claim, or a claim with no investment_mix", () => {
        const native = claims(PROJECTS).find(
            (claim) => claim.investment_mix?.investment_mix_source === "project_native",
        );
        const without = claims(PROJECTS).find((claim) => claim.investment_mix === undefined);
        expect(native).toBeDefined();
        expect(without).toBeDefined();
        expect(investmentRollupOf(native!)).toBeNull();
        expect(investmentRollupOf(without!)).toBeNull();
    });

    it("tolerates a source it does not know: no label is invented", () => {
        const claim = copy(claims(THEME_MIX)[0]);
        claim.investment_mix.investment_mix_source = "blended_estimate";
        expect(investmentRollupOf(claim)).toBeNull();
    });

    it("discloses only an investment claim", () => {
        const claim = copy(claims(THEME_MIX)[0]);
        claim.kind = "health";
        expect(investmentRollupOf(claim)).toBeNull();
    });

    it("keeps the label but drops a count that is not a whole number of units", () => {
        const claim = copy(claims(THEME_MIX)[0]);
        claim.investment_mix.project_own_work_unit_count = -1;
        claim.investment_mix.work_unit_count = 2.5;
        expect(investmentRollupOf(claim)).toEqual({
            subject: claim.subject,
            ownUnits: null,
            units: null,
        });
    });
});

describe("rollups by claim ids and by subject", () => {
    it("gives one roll-up per subject for the claims a driver cites", () => {
        const ids = claims(THEME_MIX).map((claim) => claim.claim_id);
        const rollups = rollupsOfClaims(claims(THEME_MIX), ids);
        expect(rollups).toHaveLength(1);
        expect(rollups[0]!.subject.label).toBe("Synthetic Project November");
        expect(rollups[0]!.ownUnits).toBe(0);
    });

    it("gives none for cited claims that are project_native", () => {
        const native = claims(PROJECTS).filter(
            (claim) => claim.investment_mix?.investment_mix_source === "project_native",
        );
        expect(
            rollupsOfClaims(
                claims(PROJECTS),
                native.map((claim) => claim.claim_id),
            ),
        ).toEqual([]);
    });

    it("finds a member's roll-up by its canonical id: 11 of the 19 ranked projects", () => {
        const members = (PROJECTS as any).cohort.members as { subject: { canonical_id: string } }[];
        const withRollup = members.filter(
            (member) => rollupForSubject(claims(PROJECTS), member.subject.canonical_id) !== null,
        );
        expect(members).toHaveLength(19);
        expect(withRollup).toHaveLength(11);
    });
});

describe("copy", () => {
    it("states the roll-up and the project's own units, with a fuller sentence for assistive tech", () => {
        expect(INVESTMENT_ROLLUP_COPY.visible({ ownUnits: 0, units: 5011 })).toBe(
            "Owning team's roll-up · 0 own work units in this window",
        );
        expect(INVESTMENT_ROLLUP_COPY.visible({ ownUnits: 1, units: 5011 })).toBe(
            "Owning team's roll-up · 1 own work unit in this window",
        );
        expect(INVESTMENT_ROLLUP_COPY.visible({ ownUnits: null, units: null })).toBe(
            "Owning team's roll-up",
        );
        expect(INVESTMENT_ROLLUP_COPY.aria({ ownUnits: 0, units: 5011 })).toBe(
            "This investment is the owning team's roll-up over 5,011 work units, not this project's own work: the project has 0 work units of its own in this window.",
        );
        expect(INVESTMENT_ROLLUP_COPY.aria({ ownUnits: null, units: null })).toBe(
            "This investment is the owning team's roll-up, not this project's own work.",
        );
    });
});
