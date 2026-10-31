import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { claimedFactTables } from "@/components/ask-dev/answer/claimedFactTablesModel";
import attentionRanking from "@/lib/ask-dev/render/__oracle__/captures/kiac_repo_attention_ranking.event.json";
import { trendsForGroup } from "@/lib/ask-dev/render/format";
import { OccurrenceLedger } from "@/lib/ask-dev/render/placement";
import { planRenderShapes, type PlanInput } from "@/lib/ask-dev/render/shape-plan";

import {
    factOf,
    k1,
    multiSeries,
    READINESS,
    withShapes,
    WORKLOAD,
    type Result,
} from "./seriesFixtures";

// CHAOS-11942, E8 design §4.1, §4.3: every served occurrence is planned once, in the right slot.
const groupsOf = (result: Result) =>
    claimedFactTables(result.claimed_facts).map((model) => model.claimIds);
const plan = (result: Result, paletteSize = 10) =>
    planRenderShapes(result, { groups: groupsOf(result), paletteSize });

/** The capture with a second claim citing the same workload table, folded into its group. */
function withSecondaryClaim(result: Result): Result {
    const copy = structuredClone(factOf(result, WORKLOAD));
    copy.claim_id = "claim-workload-backlog-again";
    const facts = [...result.claimed_facts];
    facts.splice(facts.indexOf(factOf(result, WORKLOAD)) + 1, 0, copy);
    const shape = structuredClone(result.render_shapes![0]!);
    for (const point of shape.series[0]!.points) point.source.claim_id = copy.claim_id;
    return { ...result, claimed_facts: facts, render_shapes: [shape] } as Result;
}

function allCaptures(): { name: string; result: Result }[] {
    const dirs = [
        "src/components/ask-dev/answer/__tests__/captures",
        "src/lib/ask-dev/render/__oracle__/captures",
    ];
    return dirs.flatMap((dir) =>
        readdirSync(join(process.cwd(), dir))
            .filter((name) => name.endsWith(".json") && name !== "index.json")
            .map((name) => {
                const raw = JSON.parse(readFileSync(join(process.cwd(), dir, name), "utf8"));
                return { name, result: (raw.result ?? raw) as Result };
            })
            .filter(({ result }) => (result.render_shapes ?? []).length > 0),
    );
}

describe("trend placement (E8 §4.3)", () => {
    it("places each K1 trend PENDING in the group of the claim its points cite", () => {
        const planned = plan(k1());
        expect(planned.map((entry) => [entry.index, entry.group, entry.initial.kind])).toEqual([
            [0, WORKLOAD, "PENDING"],
            [1, READINESS, "PENDING"],
        ]);
    });

    it("draws a trend owned only by a secondary claim of a group in that group's one slot", () => {
        const result = withSecondaryClaim(k1());
        const group = groupsOf(result).find((claimIds) =>
            claimIds.includes("claim-workload-backlog-again"),
        );
        expect(group).toEqual([WORKLOAD, "claim-workload-backlog-again"]);
        expect(plan(result).map((entry) => [entry.group, entry.initial.kind])).toEqual([
            [WORKLOAD, "PENDING"],
        ]);
    });

    it("withholds a trend that cites two claims once, at answer level, though ask-dev counts it per claim", () => {
        const result = k1();
        const shape = structuredClone(result.render_shapes![0]!);
        shape.series[0]!.points[0]!.source.claim_id = READINESS;
        const mixed = withShapes(result, [shape]);
        const [entry] = plan(mixed);
        expect(entry!.initial).toEqual({ kind: "WITHHELD", reason: "multi_claim_trend" });
        expect(entry!.owner).toEqual({ kind: "answer" });
        // ask-dev's per-claim count names it under both claims (it over-reports by design).
        expect(trendsForGroup(mixed, [WORKLOAD]).withheld).toBe(1);
        expect(trendsForGroup(mixed, [READINESS]).withheld).toBe(1);
    });

    it("gives a trend that failed verification to its own group's notice, not the answer's", () => {
        const result = k1();
        const shape = structuredClone(result.render_shapes![0]!);
        shape.series[0]!.points[0]!.value += 1;
        const [entry] = plan(withShapes(result, [shape]));
        expect(entry!.initial).toEqual({ kind: "WITHHELD", reason: "value_mismatch" });
        expect(entry!.owner).toEqual({ kind: "group", key: WORKLOAD });
    });

    it("gives a web-guard refusal to the group too (G7: more series than theme colours)", () => {
        const result = k1();
        const [entry] = plan(withShapes(result, [multiSeries(result)]), 1);
        expect(entry!.initial).toEqual({ kind: "WITHHELD", reason: "palette_exhausted" });
        expect(entry!.owner).toEqual({ kind: "group", key: WORKLOAD });
    });

    it("withholds every trend at answer level when the answer renders no table group", () => {
        const planned = planRenderShapes(k1(), { groups: null, paletteSize: 10 });
        expect(planned.map((entry) => [entry.initial, entry.owner])).toEqual([
            [{ kind: "WITHHELD", reason: "placement_missing" }, { kind: "answer" }],
            [{ kind: "WITHHELD", reason: "placement_missing" }, { kind: "answer" }],
        ]);
    });

    it("withholds a trend whose claim has no rendered table group, at answer level", () => {
        const planned = planRenderShapes(k1(), { groups: [[READINESS]], paletteSize: 10 });
        expect(planned[0]).toMatchObject({
            group: null,
            owner: { kind: "answer" },
            initial: { kind: "WITHHELD", reason: "placement_missing" },
        });
        expect(planned[1]).toMatchObject({ group: READINESS, initial: { kind: "PENDING" } });
    });
});

/** The attention capture with every cohort and member kind set to `kind` (G1 refuses "person"). */
function attentionWithKind(kind: string): Result {
    const result = structuredClone((attentionRanking as { result: unknown }).result) as Result;
    const cohort = result.cohort as unknown as {
        kind: string;
        members: { subject: { kind: string } }[];
    };
    cohort.kind = kind;
    for (const member of cohort.members) member.subject.kind = kind;
    return result;
}

describe("cohort shapes until I-41 draws them", () => {
    it("keeps the verifier's refusal ahead of the ranking gate, at answer level (codex r2b P2)", () => {
        const result = attentionWithKind("person");
        const shape = { ...result.render_shapes![0]!, kind: "quadrant" } as NonNullable<
            Result["render_shapes"]
        >[number];
        const [entry] = planRenderShapes(withShapes(result, [shape]), {
            groups: [],
            paletteSize: 10,
        });
        expect(entry!.initial).toEqual({ kind: "WITHHELD", reason: "kind_not_drawable" });
        expect(entry!.owner).toEqual({ kind: "answer" });
    });

    it("gives an unchecked cohort shape to the chart slot only when the slot is mounted", () => {
        const ranked = (attentionRanking as { result: unknown }).result as Result;
        const shape = structuredClone(ranked.render_shapes![0]!);
        shape.series[0]!.points[0]!.value += 1;
        const [inSlot] = planRenderShapes(withShapes(ranked, [shape]), {
            groups: [],
            paletteSize: 10,
        });
        expect(inSlot!.initial).toEqual({ kind: "WITHHELD", reason: "value_mismatch" });
        expect(inSlot!.owner).toEqual({ kind: "cohort_panel" });
        // No ranking computed: the panel shows "Not ranked by the service" and no chart slot.
        const unranked = structuredClone(ranked);
        for (const member of (
            unranked.cohort as unknown as { members: { ranking_computed?: boolean }[] }
        ).members)
            member.ranking_computed = false;
        const [noSlot] = planRenderShapes(withShapes(unranked, [shape]), {
            groups: [],
            paletteSize: 10,
        });
        expect(noSlot!.initial).toEqual({ kind: "WITHHELD", reason: "value_mismatch" });
        expect(noSlot!.owner).toEqual({ kind: "answer" });
    });

    it("keeps the verifier's reason when a cohort shape also has no panel to sit in (codex r1 opinion)", () => {
        const result = (attentionRanking as { result: unknown }).result as Result;
        const shape = {
            ...structuredClone(result.render_shapes![0]!),
            kind: "quadrant",
        } as typeof result.render_shapes extends (infer S)[] | undefined ? S : never;
        const planned = planRenderShapes(withShapes(result, [shape]), {
            groups: null,
            paletteSize: 10,
        });
        expect(planned[0]!.initial).toEqual({ kind: "WITHHELD", reason: "kind_not_drawable" });
        expect(planned[0]!.owner).toEqual({ kind: "answer" });
    });

    it("places the verified cohort shapes PENDING in the ranking panel's chart slot (CHAOS-11943)", () => {
        const result = (attentionRanking as { result: unknown }).result as Result;
        const planned = plan(result);
        expect(planned.map((entry) => [entry.placement, entry.owner.kind, entry.initial])).toEqual([
            ["cohort_panel", "cohort_panel", { kind: "PENDING", component: "cohort_panel" }],
            ["cohort_panel", "cohort_panel", { kind: "PENDING", component: "cohort_panel" }],
        ]);
        // All 4 ranked repositories are scored and charted: no coverage cause to state.
        expect(planned.map((entry) => entry.caption)).toEqual([
            { sentences: [], mismatch: null },
            { sentences: [], mismatch: null },
        ]);
    });
});

describe("every served occurrence is planned exactly once (G4), on every capture", () => {
    const cases = allCaptures();

    it("covers the captures that carry shapes", () => {
        expect(cases.length).toBeGreaterThanOrEqual(10);
    });

    it.each(cases)("$name", ({ result }) => {
        const planned = plan(result);
        const ledger = new OccurrenceLedger(result.render_shapes!.length);
        for (const entry of planned) ledger.record(entry.index, entry.initial);
        expect(ledger.violations(false)).toEqual([]);
        expect(planned.map((entry) => entry.index)).toEqual(result.render_shapes!.map((_, i) => i));
    });
});

describe("differential: the trends placed in a group are ask-dev's `trendsForGroup` shapes", () => {
    // Web adds guards after the port; a shape the port admits for a group is placed in that group
    // (PENDING) or withheld there by a web guard, never moved or dropped.
    const results = [
        ...allCaptures().map(({ name, result }) => ({ name, result })),
        { name: "secondary claim", result: withSecondaryClaim(k1()) },
        { name: "multi-series", result: withShapes(k1(), [multiSeries(k1())]) },
    ];

    it.each(results)("$name", ({ result }) => {
        const planned = plan(result);
        for (const claimIds of groupsOf(result)) {
            const askDev = trendsForGroup(result, claimIds).shapes.map((shape) => shape.shape_id);
            const web = planned
                .filter((entry) => entry.group === claimIds[0] && entry.placement === "fact_group")
                .filter(
                    (entry) =>
                        entry.initial.kind === "PENDING" ||
                        (entry.initial.kind === "WITHHELD" &&
                            [
                                "time_order_utc_disagreement",
                                "time_label_instant_collision",
                                "palette_exhausted",
                            ].includes(entry.initial.reason)),
                )
                .map((entry) => entry.shape.shape_id);
            expect(web.sort()).toEqual([...askDev].sort());
        }
    });
});

describe("the ported verifier reads only the fields the plan declares", () => {
    it("plans every capture through a result that throws on any other field", () => {
        const allowed = new Set(["render_shapes", "cohort", "claimed_facts", "interpretation"]);
        for (const { name, result } of allCaptures()) {
            const guarded = new Proxy(result, {
                get(target, key, receiver) {
                    if (typeof key === "string" && !allowed.has(key))
                        throw new Error(`${name}: plan read result.${key}`);
                    return Reflect.get(target, key, receiver);
                },
            }) as PlanInput;
            expect(() =>
                planRenderShapes(guarded, { groups: groupsOf(result), paletteSize: 10 }),
            ).not.toThrow();
        }
    });
});
