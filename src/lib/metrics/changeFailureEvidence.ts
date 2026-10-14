import type { ChangeFailureEvidence } from "@/lib/types";

/** The metric that serves change failure evidence (`changeFailureEvidence`); every other metric serves none. */
export const CHANGE_FAILURE_RATE_KEY = "change_failure_rate";

/** What a measured rate stands on, as the API names it. A value this web does not know is not drawn. */
const BASIS_TEXT: Record<string, string> = {
    status: "Deployment statuses",
    incident: "Incident links",
    both: "Deployment statuses and incident links",
};

/** The base the rate is divided by: statuses only divide by the deployments with a final status. */
const BASE_TEXT: Record<string, string> = {
    status: "Deployments with a final status",
    incident: "All deployments",
    both: "All deployments",
};

/** Why there is no rate, as the API names it. */
const UNKNOWN_REASON_TEXT: Record<string, string> = {
    not_collected: "Nothing was collected for this window",
    no_deployments_in_window: "No deployments in this window",
    deployments_without_outcome:
        "Deployments, but no incident evidence and no deployment with a final status",
};

export type ChangeFailureEvidenceRow = { label: string; value: string };

const isCount = (n: number | null | undefined): n is number =>
    typeof n === "number" && Number.isFinite(n) && n >= 0;

/**
 * The served coverage K / D (0..1) as percent text. Exactly 0 reads "0%" and exactly 1 reads
 * "100%"; a value between never rounds onto either ("<1%", "99%"), so a partly covered rate is
 * never drawn as complete. Null for a non-number.
 */
export const statusCoverageText = (coverage: number | null | undefined): string | null => {
    if (typeof coverage !== "number" || !Number.isFinite(coverage)) return null;
    if (coverage <= 0) return "0%";
    if (coverage >= 1) return "100%";
    if (coverage < 0.01) return "<1%";
    return `${Math.min(99, Math.round(coverage * 100))}%`;
};

/**
 * The fact rows of a served change failure evidence, in the order the drawer draws them. A row
 * exists only for a value the API served; the web fills nothing in. A basis or a reason this web
 * does not know has no row (the counts still show).
 */
export function changeFailureEvidenceRows(
    evidence: ChangeFailureEvidence | null | undefined,
): ChangeFailureEvidenceRow[] {
    if (!evidence) return [];
    const rows: ChangeFailureEvidenceRow[] = [];
    const basis = evidence.basis;
    if (typeof basis === "string" && Object.hasOwn(BASIS_TEXT, basis)) {
        rows.push({ label: "Evidence basis", value: BASIS_TEXT[basis] });
        rows.push({ label: "Rate is out of", value: BASE_TEXT[basis] });
    }
    const reason = evidence.unknown_reason;
    if (typeof reason === "string" && Object.hasOwn(UNKNOWN_REASON_TEXT, reason)) {
        rows.push({ label: "Why there is no rate", value: UNKNOWN_REASON_TEXT[reason] });
    }
    if (isCount(evidence.deployments)) {
        rows.push({ label: "Deployments", value: String(evidence.deployments) });
    }
    if (isCount(evidence.deployments_with_status)) {
        rows.push({
            label: "With a final status",
            value: String(evidence.deployments_with_status),
        });
    }
    const coverage = statusCoverageText(evidence.coverage);
    if (coverage !== null) rows.push({ label: "Status coverage", value: coverage });
    return rows;
}
