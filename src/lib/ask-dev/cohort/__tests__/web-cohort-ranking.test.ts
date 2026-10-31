import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { cohortRanking, isCohortIntent } from "../cohort-ranking";
import { cohortKindsRankable } from "@/lib/ask-dev/render/guards";

import { webCohortRanking } from "../web-cohort-ranking";

/**
 * CHAOS-11944: web's cohort ranking gate (E8 design §10), on real, scrubbed ACR answers from the
 * I-26 oracle captures and on planted copies of them.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- tests edit captured JSON */
const WEB = path.resolve(import.meta.dirname, "../../../../..");
const manifest = JSON.parse(
    readFileSync(path.join(WEB, "src/lib/ask-dev/render/__oracle__/MANIFEST.json"), "utf8"),
) as { captures: { file: string }[] };
const resultOf = (file: string): any => {
    const parsed = JSON.parse(readFileSync(path.join(WEB, file), "utf8"));
    return parsed?.result && typeof parsed.result === "object" ? parsed.result : parsed;
};
// The oracle captures plus the answer captures (the answer set holds the pull-request cohort).
const ANSWERS = path.join(WEB, "src/components/ask-dev/answer/__tests__/captures");
const answerFiles = readdirSync(ANSWERS)
    .filter((f) => f.startsWith("kiac_") && f.endsWith(".json"))
    .map((f) => path.relative(WEB, path.join(ANSWERS, f)));
const files = [...new Set([...manifest.captures.map((e) => e.file), ...answerFiles])];
const captures = files.map((file) => ({ file: path.basename(file), result: resultOf(file) }));
/** The public seed answer: a discovered team cohort, 3 ranked, 1 scored, both cohort shapes. */
const SEED = resultOf(
    "src/lib/ask-dev/render/__oracle__/captures/seed-cv-discovered-team-series-rep1-t2-a1.result.json",
);
/** The kiac answer: a discovered repository cohort, 4 ranked and scored, both cohort shapes. */
const REPOS = resultOf(
    "src/lib/ask-dev/render/__oracle__/captures/kiac_repo_attention_ranking.event.json",
);

const withKinds = (result: any, cohortKind: string, memberKind?: (index: number) => string) => {
    const copy = structuredClone(result);
    copy.cohort.kind = cohortKind;
    copy.cohort.members.forEach((member: any, index: number) => {
        member.subject.kind = memberKind ? memberKind(index) : cohortKind;
    });
    return copy;
};
const cohortShapeIndexes = (result: any): number[] =>
    result.render_shapes
        .map((shape: any, index: number) => (shape.selected_by.startsWith("cohort_") ? index : -1))
        .filter((index: number) => index >= 0);

describe("G1 before any ranking", () => {
    // Required case (codex r3 on web #1625, lead ruling on CHAOS-11941): the port ranks an
    // organization cohort; web must not.
    it("an organization cohort: the port gives rows, web gives Ranking not shown", () => {
        const org = withKinds(SEED, "organization");
        const port = cohortRanking(org.interpretation.shape, org.cohort);
        expect(port.state).toBe("rows");
        expect(port.state === "rows" ? port.rows.length : 0).toBe(3);
        const web = webCohortRanking(org);
        expect(web.state).toBe("kind_not_ranked");
        expect(web).not.toHaveProperty("rows");
        expect(web.shapes).toEqual(
            cohortShapeIndexes(org).map((index) => ({ index, withheld: "cohort_kind_not_ranked" })),
        );
    });

    it.each([
        ["person as the cohort kind", withKinds(SEED, "person")],
        [
            "person as one member kind",
            withKinds(SEED, "team", (i) => (i === 1 ? "person" : "team")),
        ],
        ["an unknown kind", withKinds(SEED, "planted_kind")],
        [
            "a rankable cohort kind with an unknown member kind",
            withKinds(REPOS, "repository", (i) => (i === 0 ? "planted_kind" : "repository")),
        ],
    ])("%s: Ranking not shown, every cohort shape withheld", (_name, result) => {
        const web = webCohortRanking(result);
        expect(web.state).toBe("kind_not_ranked");
        expect(
            web.shapes.every((s) => "withheld" in s && s.withheld === "cohort_kind_not_ranked"),
        ).toBe(true);
        expect(web.shapes).toHaveLength(cohortShapeIndexes(result).length);
    });

    it("G1 holds even when the question did not ask for a ranking", () => {
        const person = withKinds(SEED, "person");
        person.interpretation.shape = "single_subject";
        person.render_shapes = [];
        expect(webCohortRanking(person).state).toBe("kind_not_ranked");
    });
});

describe("intent (Q1 default) and the parity branch", () => {
    it("an open answer with a cohort shape is ranked (Q1)", () => {
        const open = structuredClone(SEED);
        open.interpretation.shape = "open";
        expect(cohortRanking("open", open.cohort).state).toBe("not_requested");
        const web = webCohortRanking(open);
        expect(web.state).toBe("rows");
        expect(web.shapes.every((s) => "placement" in s && s.placement === "chart_slot")).toBe(
            true,
        );
    });

    it("parity (ask-dev's rule): the same open answer is not requested, its cohort shapes withheld", () => {
        const open = structuredClone(SEED);
        open.interpretation.shape = "open";
        const web = webCohortRanking(open, "parity");
        expect(web.state).toBe("not_requested");
        expect(web.shapes).toEqual(
            cohortShapeIndexes(open).map((index) => ({ index, withheld: "ranking_not_requested" })),
        );
    });

    it("an open answer with a cohort and no cohort shape shows nothing", () => {
        const open = structuredClone(SEED);
        open.interpretation.shape = "open";
        open.render_shapes = open.render_shapes.filter(
            (s: any) => !s.selected_by.startsWith("cohort_"),
        );
        expect(webCohortRanking(open)).toEqual({ state: "none", shapes: [] });
    });

    it("gives the same rows as the port for every cohort-intent capture G1 admits (steps 2-4 == cohortRanking)", () => {
        let compared = 0;
        for (const { file, result } of captures) {
            if (result.cohort === undefined || !isCohortIntent(result.interpretation.shape))
                continue;
            if (!cohortKindsRankable(result.cohort)) continue;
            const port = cohortRanking(result.interpretation.shape, result.cohort);
            const web = webCohortRanking(result);
            expect(web.state, file).toBe(port.state);
            if (port.state === "rows" && web.state === "rows")
                expect(web.rows, file).toEqual(port.rows);
            compared += 1;
        }
        expect(compared).toBeGreaterThanOrEqual(10);
    });

    it("differs from the port only where G1 refuses: a real answer ranks 25 pull requests in the port", () => {
        const prs = captures.find(
            (c) => c.file === "kiac_repo_merged_prs_degraded.event.json",
        )!.result;
        const port = cohortRanking(prs.interpretation.shape, prs.cohort);
        expect(port.state === "rows" ? port.rows.length : 0).toBe(25);
        expect(webCohortRanking(prs).state).toBe("kind_not_ranked");
        for (const { file, result } of captures) {
            if (result.cohort === undefined || !isCohortIntent(result.interpretation.shape))
                continue;
            if (
                webCohortRanking(result).state !==
                cohortRanking(result.interpretation.shape, result.cohort).state
            ) {
                expect(cohortKindsRankable(result.cohort), file).toBe(false);
            }
        }
    });
});

describe("no cohort, not computed, rows", () => {
    it("no cohort: nothing, and a stray cohort shape has no placement", () => {
        const none = structuredClone(SEED);
        delete none.cohort;
        expect(webCohortRanking(none)).toEqual({
            state: "none",
            shapes: cohortShapeIndexes(none).map((index) => ({
                index,
                withheld: "placement_missing",
            })),
        });
    });

    it("ACR ranked no member: Not ranked by the service, cohort shapes withheld", () => {
        const unranked = structuredClone(SEED);
        unranked.cohort.members.forEach((member: any) => (member.ranking_computed = false));
        const web = webCohortRanking(unranked);
        expect(web.state).toBe("not_computed");
        expect(
            web.shapes.every((s) => "withheld" in s && s.withheld === "ranking_not_computed"),
        ).toBe(true);
    });

    it.each([1, 2, 3])(
        "a %i-team cohort ranks every member it carries (small orgs, check 13)",
        (size) => {
            const small = structuredClone(SEED);
            small.cohort.members = small.cohort.members.slice(0, size);
            const web = webCohortRanking(small);
            expect(web.state).toBe("rows");
            expect(
                web.state === "rows" ? web.rows.map((r) => r.member.subject.canonical_id) : [],
            ).toEqual(small.cohort.members.map((m: any) => m.subject.canonical_id));
        },
    );

    it("the repository answer ranks its 4 members and places both cohort shapes in the chart slot", () => {
        const web = webCohortRanking(REPOS);
        expect(web.state === "rows" ? web.rows.length : 0).toBe(4);
        expect(web.shapes).toEqual(
            cohortShapeIndexes(REPOS).map((index) => ({ index, placement: "chart_slot" })),
        );
    });
});
