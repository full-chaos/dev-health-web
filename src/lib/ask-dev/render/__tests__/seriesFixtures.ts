/**
 * Line-chart fixtures for CHAOS-11942, built from the scrubbed K1 capture (real `dated_fact_trend`
 * output with uneven dates, `kiac_project_status_partial`). The live producer emits single-series
 * trends only (E8 AC-2 refinement), so the multi-series, gap, category and hostile shapes below are
 * made from that capture's own rows: every point cites a real row and its value is that row's
 * value, so the ported verifier admits them unchanged.
 */
import capture from "@/components/ask-dev/answer/__tests__/captures/kiac_project_status_partial.event.json";
import { cellValue } from "@/lib/ask-dev/facts/fact-rows";
import type {
    ClaimedFact,
    InvestigationResult,
    RenderPoint,
    RenderShape,
} from "@/lib/ask-dev/render/contracts";

export type Result = InvestigationResult;

export const WORKLOAD = "claim-workload-backlog";
export const READINESS = "claim-readiness-estimated";

export const k1 = (): Result => structuredClone((capture as { result: unknown }).result) as Result;

export const factOf = (result: Result, claimId: string): ClaimedFact => {
    const fact = result.claimed_facts.find((candidate) => candidate.claim_id === claimId);
    if (fact === undefined) throw new Error(`no claim ${claimId}`);
    return fact;
};

/** Points over `field` of the claim's rows, oldest day first, skipping `skip` row indexes. */
export function rowPoints(
    result: Result,
    claimId: string,
    field: string,
    skip: readonly number[] = [],
    label: (day: string) => string = (day) => day,
): RenderPoint[] {
    const rows = factOf(result, claimId).rows ?? [];
    return rows
        .map((row, rowIndex) => ({ row, rowIndex }))
        .filter(({ rowIndex }) => !skip.includes(rowIndex))
        .map(({ row, rowIndex }) => ({
            label: label(String(cellValue(row.fields.day!))),
            value: Number(cellValue(row.fields[field]!)),
            source: {
                kind: "claimed_fact_row" as const,
                claim_id: claimId,
                row_index: rowIndex,
                field,
            },
        }))
        .sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
}

const baseShape = (result: Result): RenderShape => structuredClone(result.render_shapes![0]!);

/** Two series over the workload rows; the second has no point on `gapRow`'s day (a union gap). */
export function multiSeries(result: Result, gapRow = 3): RenderShape {
    return {
        ...baseShape(result),
        shape_id: "rs_9",
        title: "Backlog and throughput over time",
        series: [
            {
                key: "backlog_size",
                label: "Backlog size",
                points: rowPoints(result, WORKLOAD, "backlog_size") as [
                    RenderPoint,
                    ...RenderPoint[],
                ],
            },
            {
                key: "throughput_mean",
                label: "Throughput mean",
                points: rowPoints(result, WORKLOAD, "throughput_mean", [gapRow]) as [
                    RenderPoint,
                    ...RenderPoint[],
                ],
            },
        ],
    } as RenderShape;
}

/** A category-axis line (no producer emits one, E8 §7.3): series order A then B, union first-seen. */
export function categoryLine(result: Result, labels: readonly string[]): RenderShape {
    const all = rowPoints(result, WORKLOAD, "backlog_size");
    const point = (index: number, label: string): RenderPoint => ({ ...all[index]!, label });
    return {
        ...baseShape(result),
        shape_id: "rs_8",
        axis_kind: "category",
        title: "Backlog size by sample",
        axis_label: "sample",
        series: [
            { key: "a", label: "First", points: [point(0, labels[0]!), point(1, labels[1]!)] },
            { key: "b", label: "Second", points: [point(2, labels[2]!), point(3, labels[1]!)] },
        ],
    } as RenderShape;
}

/** E8 §8 hostile corpus. */
export const HOSTILE = [
    "<img src=x onerror=alert(1)>",
    "</div><script>alert(1)</script>",
    "{a|x}{b}",
    "javascript:alert(1)",
    "‮evil",
    "L".repeat(256),
    "tab\tand\nnewline",
    "&amp;",
] as const;

/** Every served word of the category line replaced by a hostile string. */
export function hostileLine(result: Result): RenderShape {
    const shape = categoryLine(result, [HOSTILE[2], HOSTILE[3], HOSTILE[4]]);
    return {
        ...shape,
        title: HOSTILE[0],
        axis_label: HOSTILE[1],
        value_label: HOSTILE[7],
        series: [
            { ...shape.series[0]!, label: HOSTILE[5] },
            { ...shape.series[1]!, label: HOSTILE[6] },
        ],
    } as RenderShape;
}

/** The capture with `shapes` in place of its own render shapes. */
export function withShapes(result: Result, shapes: readonly RenderShape[]): Result {
    return { ...result, render_shapes: [...shapes] } as Result;
}
