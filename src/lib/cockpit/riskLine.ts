import { isRiskSignal } from "@/lib/cockpit/signalKinds";
import { coverageNote } from "@/lib/metrics/coverageNote";
import type { CockpitSignal } from "@/lib/types";

/** How many served risk values the line names before "and N more" (the approved line has three). */
export const RISK_LINE_VALUES = 3;

type RiskSignal = Pick<CockpitSignal, "metric" | "current_value" | "confidence" | "coverage">;

const joinList = (items: string[]): string => {
    if (items.length <= 1) return items.join("");
    if (items.length === 2) return `${items[0]} and ${items[1]}`;
    return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
};

/**
 * The line of the "Compounding risk" thread row on Home (approved prototype: "Captured risk
 * signals: 58%, 53.8%, and 51.9%, each with low confidence.").
 *
 * It names the served risk signals: each value is the served `current_value` string and each
 * confidence word is the served `confidence`, both unchanged. The line names at most three
 * values, then "and N more" (a count of served signals, not a metric). When every served risk
 * signal has the same confidence the line says it once; when they differ it says it per value.
 *
 * `null` when the API served no risk signal: the caller keeps its plain copy and shows no number.
 */
export const riskSignalsLine = (
    signals: readonly RiskSignal[] | null | undefined,
): string | null => {
    const risks = (signals ?? []).filter(isRiskSignal);
    if (risks.length === 0) return null;

    const shown = risks.slice(0, RISK_LINE_VALUES);
    const more = risks.length - shown.length;
    const sameConfidence = risks.every((risk) => risk.confidence === risks[0].confidence);

    // A served coverage is always named next to its score ("Based on 60% of inputs"); none, no note.
    const items = shown.map((risk) => {
        const note = coverageNote(risk.coverage);
        const parts = [sameConfidence ? null : `${risk.confidence} confidence`, note].filter(
            Boolean,
        );
        return parts.length > 0
            ? `${risk.current_value} (${parts.join("; ")})`
            : risk.current_value;
    });
    if (more > 0) items.push(`${more} more`);

    const lead = risks.length === 1 ? "Risk signal" : "Risk signals";
    if (!sameConfidence) return `${lead}: ${joinList(items)}.`;
    const each = risks.length === 1 ? "with" : "each with";
    return `${lead}: ${joinList(items)}, ${each} ${risks[0].confidence} confidence.`;
};
