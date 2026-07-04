import { z } from "zod";

const RiskSparkPointSchema = z.object({
    ts: z.string(),
    value: z.number(),
});

const RiskMetricsSchema = z.object({
    releaseConfidence: z.number().nullish(),
    qualityDragHours: z.number().nullish(),
    pipelineStability: z.number().nullish(),
    timeseries: z.array(
        z.object({
            date: z.string(),
            riskScore: z.number(),
        }),
    ),
    qualityDragBreakdown: z.array(
        z.object({
            category: z.string(),
            hours: z.number(),
        }),
    ),
    quadrantData: z.array(
        z.object({
            id: z.string(),
            pipelineSuccessRate: z.number().nullish(),
            testPassRate: z.number().nullish(),
        }),
    ),
    confidenceSpark: z.array(RiskSparkPointSchema),
    confidenceDelta: z.number().nullish(),
    dragSpark: z.array(RiskSparkPointSchema),
    dragDelta: z.number().nullish(),
    stabilitySpark: z.array(RiskSparkPointSchema),
    stabilityDelta: z.number().nullish(),
});

export type RiskMetricsResult = {
    release_confidence?: number;
    quality_drag_hours?: number;
    pipeline_stability?: number;
    timeseries: { date: string; riskScore: number }[];
    quality_drag_breakdown: { category: string; hours: number }[];
    quadrant_data: { id: string; pipeline_success_rate?: number; test_pass_rate?: number }[];
    confidence_spark: { ts: string; value: number }[];
    confidence_delta?: number;
    drag_spark: { ts: string; value: number }[];
    drag_delta?: number;
    stability_spark: { ts: string; value: number }[];
    stability_delta?: number;
};

export function mapRiskMetricsPayload(value: unknown): RiskMetricsResult | null {
    const parsed = RiskMetricsSchema.safeParse(value);
    if (!parsed.success) return null;

    const risk = parsed.data;
    return {
        release_confidence: risk.releaseConfidence ?? undefined,
        quality_drag_hours: risk.qualityDragHours ?? undefined,
        pipeline_stability: risk.pipelineStability ?? undefined,
        timeseries: risk.timeseries,
        quality_drag_breakdown: risk.qualityDragBreakdown,
        quadrant_data: risk.quadrantData.map((item) => ({
            id: item.id,
            pipeline_success_rate:
                item.pipelineSuccessRate == null ? undefined : item.pipelineSuccessRate * 100,
            test_pass_rate: item.testPassRate == null ? undefined : item.testPassRate * 100,
        })),
        confidence_spark: risk.confidenceSpark,
        confidence_delta: risk.confidenceDelta ?? undefined,
        drag_spark: risk.dragSpark,
        drag_delta: risk.dragDelta ?? undefined,
        stability_spark: risk.stabilitySpark,
        stability_delta: risk.stabilityDelta ?? undefined,
    };
}
