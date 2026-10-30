import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

import { oracleCalls, type OracleLib, type Tagged } from "@/lib/ask-dev/render/__oracle__/calls";
import { plants } from "@/lib/ask-dev/render/__oracle__/plants";

/**
 * The E8 differential oracle (CHAOS-11941, design §6). ask-dev's verifier, ranking and fact-row
 * modules (and its private formatters and `trendsForGroup`, through the append-only transform in
 * vitest.render-oracle.config.ts) are EXECUTED from ASK_DEV_DIR; web's ports run beside them on the
 * same inputs; the complete return of every call is compared with tagged leaves. Inputs: every
 * capture in MANIFEST.json (real producer output, scrubbed) and the planted negatives. FAILS on a
 * manifest hash mismatch, zero cases, an empty core class, or any disagreement.
 */
const WEB = path.resolve(import.meta.dirname, "../..");
const MANIFEST = path.join(WEB, "src/lib/ask-dev/render/__oracle__/MANIFEST.json");
const CORE_CLASSES = ["C1", "C2", "C3", "C4", "C5"] as const;
const PLANTED_KINDS = ["person", "planted_unknown_kind", "team", "project", "repository"];

type Entry = { file: string; sha256: string; classes: string[]; source: string };
type Manifest = { ask_dev_sha: string; captures: Entry[]; not_captured: Record<string, unknown> };

/* eslint-disable @typescript-eslint/no-explicit-any -- the two libraries are compared, not typed */
function resultOf(file: string): any {
    const parsed = JSON.parse(readFileSync(path.join(WEB, file), "utf8"));
    return parsed?.result && typeof parsed.result === "object" ? parsed.result : parsed;
}

function sameTagged(a: Tagged, b: Tagged): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
}

it("ask-dev's executed modules and web's ports agree on every compared call", async () => {
    const askRender = await import("@/lib/render-shapes");
    const askRank = await import("@/lib/cohort-ranking");
    const askFacts = await import("@/lib/fact-rows");
    const askPresentation = await import("@/lib/presentation");
    const askChart = (await import("@/components/RenderShapeChart")) as any;
    const askPanel = (await import("@/components/FactRowsPanel")) as any;
    const webVerify = await import("@/lib/ask-dev/render/verify");
    const webRank = await import("@/lib/ask-dev/cohort/cohort-ranking");
    const webFacts = await import("@/lib/ask-dev/facts/fact-rows");
    const webFormat = await import("@/lib/ask-dev/render/format");

    const askDev: OracleLib = {
        ...(askRender as any),
        ...(askRank as any),
        ...(askFacts as any),
        humanizeTerm: askPresentation.humanizeTerm,
        formatValue: askChart.formatValue,
        formatDisplay: askChart.formatDisplay,
        trendsForGroup: askPanel.trendsForGroup,
    };
    const web: OracleLib = {
        ...(webVerify as any),
        ...(webRank as any),
        ...(webFacts as any),
        formatValue: webFormat.formatExact,
        formatDisplay: webFormat.formatDisplay,
        trendsForGroup: webFormat.trendsForGroup,
    };
    // Non-vacuity: every compared function exists on both sides (an undefined on both would "agree").
    for (const lib of [askDev, web]) {
        for (const name of [
            "verifyRenderShape",
            "renderShapesFor",
            "trendShapesForClaim",
            "trendChartSourceCounts",
            "cohortRanking",
            "rankingTable",
            "topDriversByWeightContributed",
            "rowWindow",
            "formatCohortScore",
            "isRankableSubjectKind",
            "cellValue",
            "cellText",
            "columnOrder",
            "factsWithRows",
            "tableIdentity",
            "groupFactsByTable",
            "humanizeTerm",
            "formatValue",
            "formatDisplay",
            "trendsForGroup",
        ] as const) {
            expect(typeof lib[name], name).toBe("function");
        }
    }

    const manifest = JSON.parse(readFileSync(MANIFEST, "utf8")) as Manifest;
    const pinned = readFileSync(path.join(import.meta.dirname, "ASK_DEV_SHA"), "utf8").trim();
    expect(manifest.ask_dev_sha).toBe(pinned);
    const classCount: Record<string, number> = {};
    const inputs: { name: string; result: any }[] = [];
    for (const entry of manifest.captures) {
        const bytes = readFileSync(path.join(WEB, entry.file));
        expect(createHash("sha256").update(bytes).digest("hex"), `${entry.file} hash`).toBe(
            entry.sha256,
        );
        for (const c of entry.classes) classCount[c] = (classCount[c] ?? 0) + 1;
        inputs.push({ name: entry.file, result: resultOf(entry.file) });
    }
    classCount.C5 = Math.min(classCount.v1 ?? 0, classCount.v2 ?? 0);
    for (const c of CORE_CLASSES) expect(classCount[c] ?? 0, `core class ${c}`).toBeGreaterThan(0);

    const cohortBase = resultOf(manifest.captures.find((e) => e.classes.includes("C1"))!.file);
    const trendBase = resultOf(manifest.captures.find((e) => e.classes.includes("K1"))!.file);
    const planted = plants(cohortBase, trendBase);
    for (const plant of planted)
        inputs.push({ name: `planted:${plant.name}`, result: plant.result });

    const disagreements: { input: string; call: string }[] = [];
    let calls = 0;
    for (const input of inputs) {
        const a = oracleCalls(askDev, input.result, PLANTED_KINDS);
        const w = oracleCalls(web, input.result, PLANTED_KINDS);
        expect(
            w.map(([label]) => label),
            `${input.name}: call list`,
        ).toEqual(a.map(([label]) => label));
        a.forEach(([label, value], i) => {
            calls += 1;
            if (!sameTagged(value, w[i]![1]))
                disagreements.push({ input: input.name, call: label });
        });
    }

    const report = {
        tz: process.env.TZ ?? "(unset)",
        ask_dev_sha: pinned,
        captures: manifest.captures.length,
        planted: planted.length,
        cases: inputs.length,
        calls,
        classes: classCount,
        not_captured: manifest.not_captured,
        disagreements,
    };
    if (process.env.ORACLE_REPORT)
        writeFileSync(process.env.ORACLE_REPORT, `${JSON.stringify(report, null, 2)}\n`);
    console.log(
        `ask-dev oracle tz=${report.tz} cases=${report.cases} calls=${calls} disagreements=${disagreements.length} classes=${JSON.stringify(classCount)}`,
    );
    expect(inputs.length).toBeGreaterThan(0);
    expect(calls).toBeGreaterThan(0);
    expect(disagreements).toEqual([]);

    // AC-12: malformed sourced points are WITHHELD by both, at admission (`renderShapesFor`, which
    // also applies the duplicate-id rule); the guard rows are admitted by both.
    const admitted = (lib: OracleLib, result: any, target: number) => {
        const shape = result.render_shapes[target];
        const { shapes } = lib.renderShapesFor(result, [shape.selected_by]) as {
            shapes: unknown[];
        };
        return shapes.includes(shape);
    };
    for (const plant of planted) {
        const verdicts = [
            admitted(askDev, plant.result, plant.target),
            admitted(web, plant.result, plant.target),
        ];
        if (plant.expect.verifier === "withheld")
            expect(verdicts, plant.name).toEqual([false, false]);
        if (plant.expect.verifier === "admitted")
            expect(verdicts, plant.name).toEqual([true, true]);
        if (plant.expect.ranking !== undefined) {
            const states = [askDev, web].map(
                (lib) =>
                    (
                        lib.cohortRanking(
                            plant.result.interpretation.shape,
                            plant.result.cohort,
                        ) as any
                    ).state,
            );
            expect(states, plant.name).toEqual([plant.expect.ranking, plant.expect.ranking]);
        }
    }
});
