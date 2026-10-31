import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import { logger } from "@/lib/logger";

const logMock = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: logMock }));

import { cohortCategoryOrder, unionCategoryOrder, utcTimeOrder } from "../category-order";
import {
    guardCohortKinds,
    guardPalette,
    guardScoreRows,
    guardSignedStack,
    guardUtcTimeOrder,
    webGuardReason,
} from "../guards";
import { OccurrenceLedger, placementFor } from "../placement";
import { verifyRenderShape } from "../verify";
import { admissionReason, verifyRenderShapeReason } from "../verify-reasons";
import { WINDOW_NOT_STATED, windowText } from "../window-text";
import {
    logWithheld,
    UNLISTED,
    WITHHELD_REASONS,
    withheldLogFields,
    type WithheldReason,
} from "../withheld-log";
import { plants } from "../__oracle__/plants";

/**
 * CHAOS-11941: web's own render logic outside the port (E8 design §4, §5.2-§5.4, §7.1, §11.2). Inputs
 * are the oracle's real, scrubbed captures (MANIFEST.json) and the planted negatives built from them.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- tests edit raw captured JSON */
const WEB = path.resolve(import.meta.dirname, "../../../../..");
const manifest = JSON.parse(
    readFileSync(path.join(import.meta.dirname, "../__oracle__/MANIFEST.json"), "utf8"),
) as {
    captures: { file: string; classes: string[] }[];
};
const resultOf = (file: string): any => {
    const parsed = JSON.parse(readFileSync(path.join(WEB, file), "utf8"));
    return parsed?.result && typeof parsed.result === "object" ? parsed.result : parsed;
};
const captures = manifest.captures.map((entry) => ({ entry, result: resultOf(entry.file) }));
const cohortBase = resultOf(manifest.captures.find((e) => e.classes.includes("C1"))!.file);
const trendBase = resultOf(manifest.captures.find((e) => e.classes.includes("K1"))!.file);
const planted = plants(cohortBase, trendBase);
const plant = (name: string) => planted.find((p) => p.name === name)!;
const PALETTE = 10;

describe("the reason function is the port's boolean, named", () => {
    it("agrees with verifyRenderShape on every shape of every capture and plant", () => {
        let shapes = 0;
        for (const result of [...captures.map((c) => c.result), ...planted.map((p) => p.result)]) {
            for (const shape of result.render_shapes ?? []) {
                shapes += 1;
                expect(verifyRenderShapeReason(shape, result).ok).toBe(
                    verifyRenderShape(shape, result),
                );
            }
        }
        expect(shapes).toBeGreaterThan(30);
    });

    it.each([
        ["value_plus_one_ulp", "value_mismatch"],
        ["value_of_another_source", "value_mismatch"],
        ["source_to_absent_member", "source_unresolved"],
        ["duplicate_shape_id", "duplicate_shape_id"],
        ["wrong_address_field", "source_address_mismatch"],
        ["value_at_2_pow_53", "value_out_of_bounds"],
        ["presentation_absent", "presentation_missing"],
        ["descending_time_labels", "time_not_ascending"],
        ["not_a_calendar_date", "time_label_not_date"],
        ["time_axis_with_bars", "time_axis_requires_line"],
        ["duplicate_claim_id", "source_unresolved"],
    ])("names %s as %s", (name, reason) => {
        const p = plant(name);
        expect(admissionReason(p.result.render_shapes[p.target], p.result)).toEqual({
            ok: false,
            reason,
        });
    });

    it("names a trend citing two claims as multi_claim_trend", () => {
        const copy = structuredClone(trendBase);
        const shape = copy.render_shapes.find((s: any) => s.selected_by === "dated_fact_trend");
        shape.series[0].points[1].source.claim_id = "claim-planted-other";
        expect(admissionReason(shape, copy)).toEqual({ ok: false, reason: "multi_claim_trend" });
    });

    it("admits every served shape of the real captures", () => {
        for (const { result } of captures) {
            for (const shape of result.render_shapes ?? [])
                expect(admissionReason(shape, result)).toEqual({ ok: true });
        }
    });
});

describe("web guards G1, G2, G5, G6, G7 (outside the port)", () => {
    it("pass every served shape of the real captures", () => {
        for (const { result } of captures) {
            for (const shape of result.render_shapes ?? [])
                expect(webGuardReason(shape, result.cohort, PALETTE)).toBeNull();
        }
    });

    it.each([
        ["person_cohort_kind", "cohort_kind_not_ranked"],
        ["person_member_kind", "cohort_kind_not_ranked"],
        ["unknown_cohort_kind", "cohort_kind_not_ranked"],
        ["attention_point_for_driverless_member", "chart_score_without_drivers"],
        ["attention_point_for_unranked_member", "chart_score_without_ranking_row"],
        ["negative_value_in_stack", "signed_stack_unsupported"],
        ["zone_less_vs_zoned_labels", "time_order_utc_disagreement"],
    ])("withhold %s as %s", (name, reason) => {
        const p = plant(name);
        expect(webGuardReason(p.result.render_shapes[p.target], p.result.cohort, PALETTE)).toBe(
            reason,
        );
    });

    it("G1 only on cohort shapes; G2 only on the attention shape", () => {
        const p = plant("person_cohort_kind");
        const trend = trendBase.render_shapes[0];
        expect(guardCohortKinds(trend, p.result.cohort)).toBeNull();
        const stack = cohortBase.render_shapes.find(
            (s: any) => s.selected_by === "cohort_driver_contribution",
        );
        expect(
            guardScoreRows(stack, plant("attention_point_for_driverless_member").result.cohort),
        ).toBeNull();
    });

    it("G5 refuses two different labels on one UTC instant", () => {
        const shape = structuredClone(trendBase.render_shapes[0]);
        shape.series = [
            shape.series[0],
            {
                ...shape.series[0],
                key: "planted",
                points: [
                    {
                        ...shape.series[0].points[0],
                        label: `${shape.series[0].points[0].label}T00:00:00Z`,
                    },
                ],
            },
        ];
        expect(guardUtcTimeOrder(shape)).toBe("time_label_instant_collision");
    });

    it("G6 passes a non-negative stack; G7 refuses more series than palette colours", () => {
        const stack = structuredClone(
            cohortBase.render_shapes.find(
                (s: any) => s.selected_by === "cohort_driver_contribution",
            ),
        );
        expect(guardSignedStack(stack)).toBeNull();
        expect(guardPalette(stack, stack.series.length)).toBeNull();
        expect(guardPalette(stack, stack.series.length - 1)).toBe("palette_exhausted");
    });
});

describe("the occurrence ledger (G4) and placement", () => {
    it("places each rule", () => {
        expect(placementFor(cohortBase.render_shapes[0])).toBe("cohort_panel");
        expect(placementFor(trendBase.render_shapes[0])).toBe("fact_group");
        expect(placementFor({ ...trendBase.render_shapes[0], selected_by: "planted_rule" })).toBe(
            "answer_level",
        );
    });

    it("is clean when every index ends with one outcome", () => {
        const ledger = new OccurrenceLedger(2);
        ledger.record(0, { kind: "PENDING", component: "chart" });
        ledger.record(1, { kind: "WITHHELD", reason: "kind_not_drawable" });
        expect(ledger.violations(false)).toEqual([]);
        expect(ledger.settle(0, { kind: "DRAWN" })).toBe(true);
        expect(ledger.violations(true)).toEqual([]);
    });

    it("catches a dropped index, a duplicate that balances it, a stray index and PENDING past the bound", () => {
        const ledger = new OccurrenceLedger(3);
        ledger.record(0, { kind: "DRAWN" });
        ledger.record(0, { kind: "DRAWN" });
        ledger.record(5, { kind: "DRAWN" });
        ledger.record(2, { kind: "PENDING", component: "chart" });
        expect(ledger.violations(true)).toEqual([
            { kind: "unknown_index", index: 5 },
            { kind: "duplicate_outcome", index: 0 },
            { kind: "missing_outcome", index: 1 },
            { kind: "pending_after_bound", index: 2 },
        ]);
    });

    it("settles once: a later settlement is ignored, and two shapes with one shape_id stay two occurrences", () => {
        const ledger = new OccurrenceLedger(2);
        ledger.record(0, { kind: "PENDING", component: "chart" });
        ledger.record(1, { kind: "WITHHELD", reason: "duplicate_shape_id" });
        expect(ledger.settle(0, { kind: "WITHHELD", reason: "render_timeout" })).toBe(true);
        expect(ledger.settle(0, { kind: "DRAWN" })).toBe(false);
        expect(ledger.outcome(0)).toEqual({ kind: "WITHHELD", reason: "render_timeout" });
        expect(ledger.violations(true)).toEqual([]);
    });
});

describe("category and time order (never alphabetical)", () => {
    it("orders a cohort shape by served attention_rank, a top-ranked member missing a family included", () => {
        const copy = structuredClone(cohortBase);
        const stack = copy.render_shapes.find(
            (s: any) => s.selected_by === "cohort_driver_contribution",
        );
        const ranked = [...copy.cohort.members].sort(
            (a: any, b: any) => (a.attention_rank ?? 1e9) - (b.attention_rank ?? 1e9),
        );
        const top = ranked[0].subject.canonical_id;
        stack.series[0].points = stack.series[0].points.filter(
            (p: any) => p.source.subject_canonical_id !== top,
        );
        const order = cohortCategoryOrder(stack, copy.cohort);
        expect(order[0]).toBe(
            stack.series
                .flatMap((s: any) => s.points)
                .find((p: any) => p.source.subject_canonical_id === top)?.label,
        );
    });

    it("unions category labels first-seen and orders time by UTC instant", () => {
        const shape = structuredClone(trendBase.render_shapes[0]);
        expect(unionCategoryOrder(shape)).toEqual(shape.series[0].points.map((p: any) => p.label));
        shape.series.push({
            ...shape.series[0],
            key: "b",
            points: [...shape.series[0].points].reverse(),
        });
        const at = utcTimeOrder(shape).map((p) => p.at);
        expect(at).toEqual([...at].sort((a, b) => a - b));
    });
});

describe("window text (§11.2)", () => {
    it.each([
        [{ relative_id: "trailing_30d" }, "Last 30 days"],
        [{ relative_id: "all_time", provenance: "inferred_default" }, "All time (window inferred)"],
        [{ start: "2026-09-30T00:00:00Z", end: "2026-10-30T00:00:00Z" }, "2026-09-30 – 2026-10-30"],
        [{ start: "2026-09-30T00:00:00Z" }, WINDOW_NOT_STATED],
        [undefined, WINDOW_NOT_STATED],
    ])("%j reads %s", (window, text) => {
        expect(windowText({ effective_evidence_window: window as any })).toBe(text);
    });

    it("reads a real captured window", () => {
        expect(windowText(trendBase)).not.toBe(WINDOW_NOT_STATED);
    });
});

describe("the withheld log line (§5.4)", () => {
    const ids = {
        resultId: "result_0123456789abcdef",
        requestId: "request_0123456789abcdef01234567",
    };

    it("logs a real ACR result and request id as served (CHAOS-11942: ACR request ids are req_<hex>)", () => {
        const captured = { resultId: trendBase.result_id, requestId: trendBase.request_id };
        expect(captured.requestId).toMatch(/^req_[0-9a-f]{32}$/u);
        const fields = withheldLogFields(captured, 0, trendBase.render_shapes[0], "render_timeout");
        expect(fields).toMatchObject({
            result_id: captured.resultId,
            request_id: captured.requestId,
        });
    });

    it("logs ids and closed vocabularies only, and an ACR-form shape_id only", () => {
        const shape = cohortBase.render_shapes[0];
        const fields = withheldLogFields(ids, 0, shape, "chart_score_without_drivers");
        expect(Object.keys(fields).sort()).toEqual(
            [
                "event",
                "kind",
                "presentation",
                "reason",
                "request_id",
                "result_id",
                "selected_by",
                "shape_id",
                "shape_id_ok",
                "shape_index",
            ].sort(),
        );
        expect(fields).toMatchObject({
            result_id: ids.resultId,
            request_id: ids.requestId,
            selected_by: shape.selected_by,
            kind: shape.kind,
            reason: "chart_score_without_drivers",
        });
        const text = JSON.stringify(fields);
        for (const point of shape.series.flatMap((s: any) => s.points)) {
            expect(text).not.toContain(point.label);
            expect(text).not.toContain(point.source.subject_canonical_id);
        }
        expect(text).not.toContain(shape.title);
        const odd = withheldLogFields(
            ids,
            1,
            { ...shape, shape_id: "team:secret" },
            "render_error",
        );
        expect(odd).toMatchObject({ shape_id_ok: false });
        expect(odd).not.toHaveProperty("shape_id");
    });

    it("passes every listed reason through unchanged", () => {
        for (const reason of WITHHELD_REASONS) {
            expect(withheldLogFields(ids, 0, cohortBase.render_shapes[0], reason).reason).toBe(
                reason,
            );
        }
    });

    // codex r2 P2: a caller passing free text (an error message, a served label) must not reach the log.
    it("logs free text in any string field as unlisted, never the text", () => {
        const secret = "customer=Acme private incident title";
        const shape = {
            ...cohortBase.render_shapes[0],
            shape_id: "rs_1",
            selected_by: secret,
            kind: secret,
            presentation: secret,
        };
        const fields = withheldLogFields(
            { resultId: secret, requestId: secret },
            Number.NaN,
            shape,
            secret as WithheldReason,
        );
        expect(fields).toMatchObject({
            result_id: UNLISTED,
            request_id: UNLISTED,
            shape_index: -1,
            selected_by: UNLISTED,
            kind: UNLISTED,
            presentation: UNLISTED,
            reason: UNLISTED,
        });
        expect(JSON.stringify(fields)).not.toContain("Acme");
    });

    it("writes one warn line through the logger, with the free text replaced", () => {
        logMock.warn.mockClear();
        logWithheld(ids, 0, cohortBase.render_shapes[0], "customer=Acme" as WithheldReason);
        expect(logger.warn).toBe(logMock.warn);
        expect(logMock.warn).toHaveBeenCalledTimes(1);
        expect(logMock.warn.mock.calls[0]![0]).toMatchObject({
            event: "ask_dev_render_withheld",
            reason: UNLISTED,
        });
        expect(JSON.stringify(logMock.warn.mock.calls[0])).not.toContain("Acme");
    });
});
