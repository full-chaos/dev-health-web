import { titleCase } from "../stringUtils";

const RUN_STATUS_LABELS: Record<string, string> = {
    failed: "Sync failed",
    partial_failed: "Completed with failures",
    planned: "Syncing...",
    dispatching: "Syncing...",
    running: "Syncing...",
    success: "Sync completed",
};

const BACKEND_TEXT_LABELS: Record<string, string> = {
    budget_deferred: "Blocked by budget",
    budget_deferral_exhausted: "Budget exhausted",
    deferral_exhausted: "Deferrals exhausted",
    provider_budget_contention: "Budget contention",
    provider_error: "Provider error",
    provider_unit_exhausted: "Provider unit exhausted",
    provider_unit_retryable: "Retrying",
    rate_limit: "Rate limit",
    worker_lost: "Worker lost",
};

function looksLikeBackendCode(value: string): boolean {
    return /^[a-z][a-z0-9_]*$/.test(value) && value.includes("_");
}

export function formatSyncRunStatusLabel(status: string): string {
    return RUN_STATUS_LABELS[status] ?? titleCase(status.replace(/_/g, " "));
}

export function formatSyncBackendText(value: string | null | undefined): string {
    if (!value) return "—";
    if (value in BACKEND_TEXT_LABELS) {
        return BACKEND_TEXT_LABELS[value];
    }
    if (looksLikeBackendCode(value)) {
        return titleCase(value.replace(/_/g, " "));
    }
    return value;
}
