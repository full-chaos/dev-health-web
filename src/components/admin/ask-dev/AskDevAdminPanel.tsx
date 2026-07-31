"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { DataState } from "@/components/ui/DataState";
import { CTA_LABELS } from "@/lib/design/cta";
import type { ActionResult } from "@/lib/result";
import type {
    AskDevAdminResponse,
    AskDevAdminSettingsPatch,
    AskDevAdminUsageResponse,
    AskDevFallbackPolicy,
    AskDevRetentionDays,
} from "@/lib/admin/types";

type AskDevAdminPanelProps = {
    loadAction: () => Promise<ActionResult<AskDevAdminResponse>>;
    loadUsageAction: () => Promise<ActionResult<AskDevAdminUsageResponse>>;
    saveAction: (settings: AskDevAdminSettingsPatch) => Promise<ActionResult<AskDevAdminResponse>>;
};

function formatCount(value: number): string {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
}

function formatRate(value: number): string {
    return new Intl.NumberFormat(undefined, {
        style: "percent",
        maximumFractionDigits: 1,
    }).format(value);
}

function formatCost(microusd: number | null): string {
    if (microusd === null) return "Not available";
    return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
    }).format(microusd / 1_000_000);
}

function formatResetAt(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "at the next monthly reset";
    return new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "UTC",
        timeZoneName: "short",
    }).format(date);
}

export function AskDevAdminPanel({
    loadAction,
    loadUsageAction,
    saveAction,
}: AskDevAdminPanelProps) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [usageError, setUsageError] = useState<string | null>(null);
    const [admin, setAdmin] = useState<AskDevAdminResponse | null>(null);
    const [usage, setUsage] = useState<AskDevAdminUsageResponse | null>(null);
    const [retentionDays, setRetentionDays] = useState<AskDevRetentionDays>(30);
    const [fallbackPolicy, setFallbackPolicy] = useState<AskDevFallbackPolicy>("fail_closed");
    const [emergencyDisabled, setEmergencyDisabled] = useState(false);
    const [platformMonthlyRequestLimit, setPlatformMonthlyRequestLimit] = useState(1_000);
    const [platformMonthlyCostLimitMicrousd, setPlatformMonthlyCostLimitMicrousd] =
        useState(100_000_000);

    const applyAdmin = useCallback((value: AskDevAdminResponse) => {
        setAdmin(value);
        setRetentionDays(value.settings.retention_days);
        setFallbackPolicy(value.settings.fallback_policy);
        setEmergencyDisabled(value.settings.emergency_disabled);
        setPlatformMonthlyRequestLimit(value.settings.platform_monthly_request_limit);
        setPlatformMonthlyCostLimitMicrousd(value.settings.platform_monthly_cost_limit_microusd);
    }, []);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        setUsageError(null);
        const [adminResult, usageResult] = await Promise.all([loadAction(), loadUsageAction()]);
        if ("error" in adminResult) {
            setError(adminResult.error ?? "Ask Dev controls could not be loaded.");
        } else {
            applyAdmin(adminResult.data);
        }
        if ("error" in usageResult) {
            setUsage(null);
            setUsageError(usageResult.error ?? "Current allowance usage could not be loaded.");
        } else {
            setUsage(usageResult.data);
        }
        setLoading(false);
    }, [applyAdmin, loadAction, loadUsageAction]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- load coordinates server action state after mount.
        void load();
    }, [load]);

    const save = async () => {
        setSaving(true);
        setError(null);
        const result = await saveAction({
            retention_days: retentionDays,
            fallback_policy: fallbackPolicy,
            emergency_disabled: emergencyDisabled,
            platform_monthly_request_limit: platformMonthlyRequestLimit,
            platform_monthly_cost_limit_microusd: platformMonthlyCostLimitMicrousd,
        });
        if ("error" in result) {
            setSaving(false);
            setError(result.error ?? "Ask Dev controls could not be saved.");
            toast.error("Could not save Ask Dev controls.");
            return;
        }
        applyAdmin(result.data);
        setUsageError(null);
        const usageResult = await loadUsageAction();
        if ("error" in usageResult) {
            setUsage(null);
            setUsageError(
                usageResult.error ??
                    "Controls were saved, but current allowance usage could not be refreshed.",
            );
        } else {
            setUsage(usageResult.data);
        }
        setSaving(false);
        toast.success("Ask Dev controls saved.");
    };

    if (loading) {
        return <DataState variant="loading" title="Loading Ask Dev controls…" />;
    }

    if (!admin) {
        return (
            <DataState
                variant="error"
                title="Ask Dev controls are unavailable"
                message={error ?? "The organization policy could not be loaded."}
                action={
                    <button
                        type="button"
                        onClick={() => void load()}
                        className="rounded-md bg-(--accent) px-4 py-2 text-sm font-semibold text-(--accent-foreground)"
                    >
                        {CTA_LABELS.retry}
                    </button>
                }
            />
        );
    }

    const configurable = !["not_entitled", "globally_disabled", "unavailable"].includes(
        admin.entitlement_state,
    );

    return (
        <section
            aria-labelledby="ask-dev-admin-title"
            className="overflow-hidden rounded-(--radius-lg) border border-(--border) bg-(--surface-raised) shadow-(--elevation-card)"
        >
            <header className="relative overflow-hidden border-b border-(--border) px-6 py-6 sm:px-8">
                <div aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-(--accent)" />
                <div className="max-w-2xl">
                    <p className="text-label-caps text-(--text-muted)">
                        Context Fabric interaction
                    </p>
                    <h2 id="ask-dev-admin-title" className="mt-2 text-h1 text-(--text-primary)">
                        Ask Dev
                    </h2>
                    <p className="mt-2 text-body text-(--text-secondary)">
                        One organization policy controls the permanent chat window and the full
                        investigation workspace. Context Fabric Validation remains a separate
                        platform-admin tool. Provider identity and readiness are managed under
                        Platform Admin (or, for a BYO provider, in BYO LLM) — not here.
                    </p>
                </div>
            </header>

            {error ? (
                <div
                    role="alert"
                    className="border-b border-(--negative)/30 bg-(--negative)/10 px-6 py-3 text-sm text-(--negative) sm:px-8"
                >
                    {error}
                </div>
            ) : null}

            <div className="divide-y divide-(--border)">
                <section aria-labelledby="ask-dev-policy" className="px-6 py-6 sm:px-8">
                    <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
                        <div className="grid flex-1 gap-5 sm:grid-cols-2">
                            <div className="sm:col-span-2">
                                <h3 id="ask-dev-policy" className="text-h3 text-(--text-primary)">
                                    Conversation and fallback policy
                                </h3>
                                <p className="mt-1 text-sm text-(--text-secondary)">
                                    The window and /dev share this history and retention policy.
                                </p>
                            </div>
                            <label className="text-sm font-medium text-(--text-primary)">
                                Content retention
                                <select
                                    value={retentionDays}
                                    disabled={!configurable}
                                    onChange={(event) =>
                                        setRetentionDays(
                                            Number(event.target.value) as AskDevRetentionDays,
                                        )
                                    }
                                    className="mt-2 w-full rounded-md border border-(--border) bg-(--surface) px-3 py-2 text-sm"
                                >
                                    {admin.retention_options.map((days) => (
                                        <option key={days} value={days}>
                                            {days === 0
                                                ? "0 days — ephemeral"
                                                : "30 days — retained"}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label className="text-sm font-medium text-(--text-primary)">
                                Unsupported BYO behavior
                                <select
                                    value={fallbackPolicy}
                                    disabled={!configurable}
                                    onChange={(event) =>
                                        setFallbackPolicy(
                                            event.target.value as AskDevFallbackPolicy,
                                        )
                                    }
                                    className="mt-2 w-full rounded-md border border-(--border) bg-(--surface) px-3 py-2 text-sm"
                                >
                                    {admin.fallback_options.map((option) => (
                                        <option key={option} value={option}>
                                            {option === "fail_closed"
                                                ? "Fail closed"
                                                : "Use approved platform fallback"}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label className="flex items-start gap-3 rounded-(--radius-md) border border-(--negative)/30 bg-(--negative)/5 p-4 sm:col-span-2">
                                <input
                                    aria-label="Emergency disable Ask Dev"
                                    type="checkbox"
                                    checked={emergencyDisabled}
                                    disabled={!configurable}
                                    onChange={(event) => setEmergencyDisabled(event.target.checked)}
                                    className="mt-1 h-4 w-4 accent-(--negative)"
                                />
                                <span>
                                    <span className="block text-sm font-semibold text-(--text-primary)">
                                        Emergency disable Ask Dev
                                    </span>
                                    <span className="mt-1 block text-xs text-(--text-secondary)">
                                        Prevents new runs from both surfaces. Existing retained
                                        history and unrelated BYO-LLM settings are preserved.
                                    </span>
                                </span>
                            </label>
                            <div className="border-t border-(--border) pt-5 sm:col-span-2">
                                <h4 className="text-sm font-semibold text-(--text-primary)">
                                    Platform monthly allowance
                                </h4>
                                <p className="mt-1 text-xs leading-5 text-(--text-secondary)">
                                    The permanent window and /dev share this allowance. Approved
                                    platform fallback also consumes it when a BYO provider cannot
                                    serve the request. Limits reset each UTC calendar month and do
                                    not roll over.
                                </p>
                            </div>
                            <label className="text-sm font-medium text-(--text-primary)">
                                Monthly platform run limit
                                <input
                                    aria-label="Monthly platform run limit"
                                    type="number"
                                    min={admin.platform_allowance_bounds.request_minimum}
                                    max={admin.platform_allowance_bounds.request_maximum}
                                    step={1}
                                    value={platformMonthlyRequestLimit}
                                    disabled={!configurable}
                                    onChange={(event) => {
                                        const next = event.currentTarget.valueAsNumber;
                                        if (!Number.isFinite(next)) return;
                                        setPlatformMonthlyRequestLimit(
                                            Math.min(
                                                admin.platform_allowance_bounds.request_maximum,
                                                Math.max(
                                                    admin.platform_allowance_bounds.request_minimum,
                                                    Math.trunc(next),
                                                ),
                                            ),
                                        );
                                    }}
                                    className="mt-2 w-full rounded-md border border-(--border) bg-(--surface) px-3 py-2 text-sm"
                                />
                                <span className="mt-1 block text-xs font-normal text-(--text-muted)">
                                    {formatCount(admin.platform_allowance_bounds.request_minimum)}–
                                    {formatCount(admin.platform_allowance_bounds.request_maximum)}
                                    accepted runs
                                </span>
                            </label>
                            <label className="text-sm font-medium text-(--text-primary)">
                                Monthly platform cost cap (USD)
                                <input
                                    aria-label="Monthly platform cost cap (USD)"
                                    type="number"
                                    min={
                                        admin.platform_allowance_bounds.cost_minimum_microusd /
                                        1_000_000
                                    }
                                    max={
                                        admin.platform_allowance_bounds.cost_maximum_microusd /
                                        1_000_000
                                    }
                                    step={1}
                                    value={platformMonthlyCostLimitMicrousd / 1_000_000}
                                    disabled={!configurable}
                                    onChange={(event) => {
                                        const next = event.currentTarget.valueAsNumber;
                                        if (!Number.isFinite(next)) return;
                                        setPlatformMonthlyCostLimitMicrousd(
                                            Math.min(
                                                admin.platform_allowance_bounds
                                                    .cost_maximum_microusd,
                                                Math.max(
                                                    admin.platform_allowance_bounds
                                                        .cost_minimum_microusd,
                                                    Math.round(next * 1_000_000),
                                                ),
                                            ),
                                        );
                                    }}
                                    className="mt-2 w-full rounded-md border border-(--border) bg-(--surface) px-3 py-2 text-sm"
                                />
                                <span className="mt-1 block text-xs font-normal text-(--text-muted)">
                                    {formatCost(
                                        admin.platform_allowance_bounds.cost_minimum_microusd,
                                    )}
                                    –
                                    {formatCost(
                                        admin.platform_allowance_bounds.cost_maximum_microusd,
                                    )}
                                </span>
                            </label>
                        </div>
                        <button
                            type="button"
                            disabled={saving || !configurable}
                            onClick={() => void save()}
                            className="rounded-md bg-(--accent) px-5 py-2.5 text-sm font-semibold text-(--accent-foreground) transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {saving ? "Saving…" : CTA_LABELS.save}
                        </button>
                    </div>
                </section>

                <section aria-labelledby="ask-dev-usage" className="px-6 py-6 sm:px-8">
                    <h3 id="ask-dev-usage" className="text-h3 text-(--text-primary)">
                        Ask Dev usage
                    </h3>
                    {usage ? (
                        <>
                            {usage.platform_allowance.warning !== "none" ? (
                                <div
                                    role="alert"
                                    className={`mt-4 rounded-(--radius-md) border px-4 py-3 text-sm ${
                                        usage.platform_allowance.warning === "exhausted"
                                            ? "border-(--negative)/30 bg-(--negative)/8 text-(--negative)"
                                            : "border-(--caution)/35 bg-(--caution)/10 text-(--text-primary)"
                                    }`}
                                >
                                    {usage.platform_allowance.warning === "exhausted" ? (
                                        <>
                                            <span className="font-semibold">
                                                Platform allowance is exhausted.
                                            </span>{" "}
                                            New platform-backed runs remain blocked until it resets.
                                            Existing conversation history remains available.
                                        </>
                                    ) : (
                                        <>
                                            This organization has used at least{" "}
                                            {usage.platform_allowance.warning === "ninety_percent"
                                                ? "90%"
                                                : "80%"}{" "}
                                            of the platform allowance.
                                        </>
                                    )}
                                </div>
                            ) : null}
                            <div className="mt-4 rounded-(--radius-md) border border-(--border) bg-(--surface) p-4">
                                <div className="flex flex-wrap items-baseline justify-between gap-2">
                                    <h4 className="text-sm font-semibold text-(--text-primary)">
                                        Current platform allowance
                                    </h4>
                                    <p className="text-xs text-(--text-muted)">
                                        Resets {formatResetAt(usage.platform_allowance.reset_at)}
                                    </p>
                                </div>
                                <dl className="mt-3 grid gap-4 sm:grid-cols-2">
                                    <div>
                                        <dt className="text-label-caps text-(--text-muted)">
                                            Accepted runs
                                        </dt>
                                        <dd className="mt-1 text-h3 text-(--text-primary)">
                                            {formatCount(usage.platform_allowance.request_used)} of{" "}
                                            {formatCount(usage.platform_allowance.request_limit)}
                                        </dd>
                                        <p className="mt-1 text-xs text-(--text-muted)">
                                            {formatCount(
                                                usage.platform_allowance.request_remaining,
                                            )}{" "}
                                            remaining
                                        </p>
                                    </div>
                                    <div>
                                        <dt className="text-label-caps text-(--text-muted)">
                                            Estimated platform spend
                                        </dt>
                                        <dd className="mt-1 text-h3 text-(--text-primary)">
                                            {formatCost(
                                                usage.platform_allowance.cost_used_microusd,
                                            )}{" "}
                                            of{" "}
                                            {formatCost(
                                                usage.platform_allowance.cost_limit_microusd,
                                            )}
                                        </dd>
                                        <p className="mt-1 text-xs text-(--text-muted)">
                                            {formatCost(
                                                usage.platform_allowance.cost_remaining_microusd,
                                            )}{" "}
                                            remaining
                                        </p>
                                    </div>
                                </dl>
                                <p className="mt-3 text-xs leading-5 text-(--text-secondary)">
                                    The permanent window and /dev share this allowance. Platform
                                    fallback also consumes it. A user retry is a new run; refreshes,
                                    reconnects, and idempotent replays do not add a run.
                                </p>
                            </div>
                            <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
                                <div>
                                    <dt className="text-label-caps text-(--text-muted)">Runs</dt>
                                    <dd className="mt-1 text-h2 text-(--text-primary)">
                                        {formatCount(usage.run_count)}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="text-label-caps text-(--text-muted)">
                                        Completed
                                    </dt>
                                    <dd className="mt-1 text-h2 text-(--positive)">
                                        {formatCount(usage.completed_runs)}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="text-label-caps text-(--text-muted)">
                                        Failure rate
                                    </dt>
                                    <dd className="mt-1 text-h2 text-(--text-primary)">
                                        {formatRate(usage.failure_rate)}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="text-label-caps text-(--text-muted)">
                                        Degraded rate
                                    </dt>
                                    <dd className="mt-1 text-h2 text-(--text-primary)">
                                        {formatRate(usage.degraded_rate)}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="text-label-caps text-(--text-muted)">Tokens</dt>
                                    <dd className="mt-1 text-h2 text-(--text-primary)">
                                        {formatCount(usage.input_tokens + usage.output_tokens)}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="text-label-caps text-(--text-muted)">
                                        Estimated spend
                                    </dt>
                                    <dd className="mt-1 text-h2 text-(--text-primary)">
                                        {formatCost(usage.estimated_cost_microusd)}
                                    </dd>
                                </div>
                            </dl>
                        </>
                    ) : usageError ? (
                        <DataState
                            variant="error"
                            title="Ask Dev usage is unavailable"
                            message={usageError}
                            className="mt-4"
                        />
                    ) : (
                        <DataState
                            variant="detector-enabled-no-findings"
                            title="No Ask Dev usage yet"
                            description="Usage appears here after the organization completes its first Ask Dev run."
                            className="mt-4"
                        />
                    )}
                </section>

                <footer className="bg-(--surface) px-6 py-4 text-xs text-(--text-secondary) sm:px-8">
                    Questions, answers, evidence, tool results, and feedback are not used for model
                    training by default. Provider processing follows the selected provider policy.
                </footer>
            </div>
        </section>
    );
}
