"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { DataState } from "@/components/ui/DataState";
import { CTA_LABELS } from "@/lib/design/cta";
import {
    LLM_PROVIDERS,
    LLM_PROVIDER_LABELS,
    type LLMBudgetResponse,
    type LLMProvider,
    type LLMSettingsActionResult,
    type LLMSettingsResponse,
    type LLMSettingsStatusResponse,
    type LLMSettingsUpsert,
} from "@/lib/admin/types";

const DEFAULT_PROVIDER: LLMProvider = "openai";
const BYO_REQUIRED_TIER_LABEL = "Team";

type LockState = {
    reason: "not_licensed" | "not_enabled";
    message: string;
} | null;

/** Read-only summary vs. editable-form view of the saved configuration (CHAOS-2565). */
type Mode = "view" | "edit";

type BadgeTone = "positive" | "caution" | "negative" | "muted";

type BadgeInfo = {
    label: string;
    tone: BadgeTone;
};

export type ByoLlmSettingsProps = {
    loadSettingsAction: () => Promise<LLMSettingsActionResult<LLMSettingsResponse>>;
    loadBudgetAction: () => Promise<LLMSettingsActionResult<LLMBudgetResponse>>;
    /**
     * BYO-LLM status badge read (CHAOS-2560/2565). The backend endpoint is
     * built on a sibling branch; a failed/errored result degrades gracefully
     * to the settings-derived Saved/Not configured wording rather than
     * blocking the summary or form.
     */
    loadStatusAction: () => Promise<LLMSettingsActionResult<LLMSettingsStatusResponse>>;
    saveSettingsAction: (
        data: LLMSettingsUpsert,
    ) => Promise<LLMSettingsActionResult<LLMSettingsResponse>>;
    removeSettingsAction: () => Promise<LLMSettingsActionResult<{ deleted: boolean }>>;
    /**
     * Runs the BYO preflight against the saved configuration (CHAOS-3265).
     * Independent of `status?.active`/`mode` — rendered whenever a BYO
     * configuration is saved, even if it is currently degraded or not
     * selected for Ask Dev. Returns the fresh `LLMSettingsStatusResponse`,
     * which is applied directly rather than re-fetching status.
     */
    runReadinessAction: () => Promise<LLMSettingsActionResult<LLMSettingsStatusResponse>>;
};

const inputClass =
    "w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm focus:border-(--accent) focus:outline-none";
const labelClass = "mb-1 block text-xs font-medium uppercase tracking-wide text-(--ink-muted)";
const captionClass = "mt-1 text-xs text-(--ink-muted)";

const BADGE_TONE_CLASSES: Record<BadgeTone, string> = {
    positive: "bg-(--positive)/10 text-(--positive)",
    caution: "bg-(--caution)/10 text-(--caution)",
    negative: "bg-(--negative)/10 text-(--negative)",
    muted: "bg-(--card-70) text-(--ink-muted)",
};

const BADGE_DOT_CLASSES: Record<BadgeTone, string> = {
    positive: "bg-(--positive)",
    caution: "bg-(--caution)",
    negative: "bg-(--negative)",
    muted: "bg-(--ink-muted)",
};

const MICRO_USD_PER_USD = 1_000_000;

function formatMicroUsd(value: number | null): string {
    if (value === null) return "Unavailable";
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 6,
    }).format(value / MICRO_USD_PER_USD);
}

function formatMicroUsdInput(value: number | null): string {
    if (value === null) return "";
    return (value / MICRO_USD_PER_USD).toFixed(6).replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1");
}

function parseMicroUsdInput(value: string): number | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (!/^\d+(?:\.\d{1,6})?$/.test(trimmed)) return Number.NaN;
    const [whole, fraction = ""] = trimmed.split(".");
    const microUsd = Number(whole) * MICRO_USD_PER_USD + Number(fraction.padEnd(6, "0"));
    return Number.isSafeInteger(microUsd) ? microUsd : Number.NaN;
}

function formatResetAt(value: string): string {
    const reset = new Date(value);
    if (Number.isNaN(reset.getTime())) return value;
    return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "UTC",
        timeZoneName: "short",
    }).format(reset);
}

function deriveBudgetBadge(budget: LLMBudgetResponse): BadgeInfo {
    if (budget.reason === "budget_exhausted") {
        return { label: "Budget exhausted", tone: "negative" };
    }
    if (budget.reason === "usage_unavailable") {
        return { label: "Usage unavailable — calls blocked", tone: "negative" };
    }
    if (budget.reason === "pricing_unavailable") {
        return { label: "Pricing unavailable — calls blocked", tone: "negative" };
    }
    if (budget.reason === "budget_not_configured") {
        return { label: "No budget configured", tone: "muted" };
    }
    const fractionUsed =
        budget.limit_micro_usd && budget.used_micro_usd !== null
            ? budget.used_micro_usd / budget.limit_micro_usd
            : 0;
    return fractionUsed >= 0.8
        ? { label: "Approaching budget", tone: "caution" }
        : { label: "Budget enforced", tone: "positive" };
}

/**
 * Derives the status badge wording/tone from the CHAOS-2560 status DTO.
 * When `status` is null (endpoint not yet available or the call failed),
 * fall back to the settings-derived Saved/Not configured wording so the
 * summary never blocks on a still-being-built backend endpoint.
 */
function deriveStatusBadge(
    status: LLMSettingsStatusResponse | null,
    hasSavedSettings: boolean,
): BadgeInfo {
    if (!status) {
        return hasSavedSettings
            ? { label: "Saved", tone: "positive" }
            : { label: "Not configured", tone: "muted" };
    }
    if (!status.configured) {
        return { label: "Not configured", tone: "muted" };
    }
    if (status.active) {
        return { label: "Active", tone: "positive" };
    }
    if (status.degraded) {
        return { label: "Invalid — using platform default", tone: "caution" };
    }
    return { label: "Saved", tone: "positive" };
}

/**
 * Derives the BYO preflight badge wording/tone from the CHAOS-3265 readiness
 * fields on the status DTO. Independent of `active`/`degraded` — a saved
 * configuration can be explicitly checked regardless of whether it currently
 * wins Ask Dev's provider-selection arbitration.
 *
 * `"stale"` (CHAOS-3254 READINESS_VERSION bump) is a neutral/informational
 * state — a prior certification exists but no longer applies (settings
 * changed, or the backend's certification requirements changed) — and must
 * NOT use the negative "failed" tone/copy.
 */
function deriveReadinessBadge(status: LLMSettingsStatusResponse | null): BadgeInfo {
    if (!status || status.readiness === "never_checked") {
        return { label: "Not yet checked", tone: "muted" };
    }
    if (status.readiness === "ready") {
        return { label: "Preflight passed", tone: "positive" };
    }
    if (status.readiness === "stale") {
        return { label: "Certification expired — run preflight", tone: "muted" };
    }
    return { label: "Preflight failed", tone: "negative" };
}

function formatCheckedAt(value: string | null): string {
    if (!value) return "Not checked";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Not checked" : date.toLocaleString();
}

export function ByoLlmSettings({
    loadSettingsAction,
    loadBudgetAction,
    loadStatusAction,
    saveSettingsAction,
    removeSettingsAction,
    runReadinessAction,
}: ByoLlmSettingsProps) {
    const [loading, setLoading] = useState(true);
    const [locked, setLocked] = useState<LockState>(null);
    const [loadError, setLoadError] = useState<string | null>(null);

    const [mode, setMode] = useState<Mode>("edit");
    const [savedSettings, setSavedSettings] = useState<LLMSettingsResponse | null>(null);
    const [status, setStatus] = useState<LLMSettingsStatusResponse | null>(null);
    const [budget, setBudget] = useState<LLMBudgetResponse | null>(null);
    const [budgetLoading, setBudgetLoading] = useState(true);
    const [budgetLoadError, setBudgetLoadError] = useState<string | null>(null);

    const [provider, setProvider] = useState<string>(DEFAULT_PROVIDER);
    const [model, setModel] = useState("");
    const [apiKey, setApiKey] = useState("");
    const [baseUrl, setBaseUrl] = useState("");
    const [budgetUsd, setBudgetUsd] = useState("");
    const [hasStoredKey, setHasStoredKey] = useState(false);
    const [maskedKey, setMaskedKey] = useState<string | null>(null);
    const [hasSavedSettings, setHasSavedSettings] = useState(false);

    const [saving, setSaving] = useState(false);
    const [checkingReadiness, setCheckingReadiness] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const [baseUrlError, setBaseUrlError] = useState<string | null>(null);
    const [budgetInputError, setBudgetInputError] = useState<string | null>(null);
    const [formError, setFormError] = useState<string | null>(null);

    const fetchStatus = useCallback(async () => {
        const result = await loadStatusAction();
        setStatus(result.data ?? null);
    }, [loadStatusAction]);

    const fetchBudget = useCallback(async () => {
        setBudgetLoading(true);
        setBudgetLoadError(null);
        const result = await loadBudgetAction();
        if (result.data) {
            setBudget(result.data);
            setBudgetUsd(formatMicroUsdInput(result.data.limit_micro_usd));
        } else {
            setBudget(null);
            setBudgetLoadError(result.error ?? "Could not load the organization budget.");
        }
        setBudgetLoading(false);
    }, [loadBudgetAction]);

    const applySettings = useCallback((data: LLMSettingsResponse) => {
        setSavedSettings(data);
        setProvider(data.provider ?? DEFAULT_PROVIDER);
        setModel(data.model ?? "");
        setBaseUrl(data.base_url ?? "");
        setMaskedKey(data.api_key ?? null);
        setHasStoredKey(Boolean(data.api_key));
        setHasSavedSettings(Boolean(data.provider));
        setApiKey("");
        setMode(data.provider ? "view" : "edit");
    }, []);

    const fetchSettings = useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        setLocked(null);
        setBudgetLoading(true);
        setBudgetLoadError(null);
        const result = await loadSettingsAction();
        if (result.status === 402) {
            setLocked({
                reason: "not_licensed",
                message:
                    result.error ?? "BYO-LLM requires Team tier or higher for this organization.",
            });
        } else if (result.status === 403) {
            setLocked({
                reason: "not_enabled",
                message: result.error ?? "BYO-LLM is not enabled for this organization.",
            });
        } else if (result.error) {
            setLoadError(result.error);
        } else if (result.data) {
            applySettings(result.data);
            void fetchStatus();
            void fetchBudget();
        }
        setLoading(false);
    }, [loadSettingsAction, applySettings, fetchStatus, fetchBudget]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- fetchSettings coordinates async loading state after mount.
        fetchSettings();
    }, [fetchSettings]);

    const handleEdit = () => {
        setFormError(null);
        setBaseUrlError(null);
        setBudgetInputError(null);
        setConfirmingDelete(false);
        setMode("edit");
    };

    const handleCancel = () => {
        if (savedSettings) {
            setProvider(savedSettings.provider ?? DEFAULT_PROVIDER);
            setModel(savedSettings.model ?? "");
            setBaseUrl(savedSettings.base_url ?? "");
            setApiKey("");
            setBudgetUsd(formatMicroUsdInput(budget?.limit_micro_usd ?? null));
        }
        setFormError(null);
        setBaseUrlError(null);
        setBudgetInputError(null);
        setConfirmingDelete(false);
        setMode("view");
    };

    const handleSave = async () => {
        if (!provider.trim()) {
            setFormError("Select a provider before saving.");
            return;
        }
        const parsedBudget = parseMicroUsdInput(budgetUsd);
        if (Number.isNaN(parsedBudget)) {
            setBudgetInputError(
                "Enter a non-negative USD amount with no more than 6 decimal places.",
            );
            return;
        }
        if (parsedBudget !== null && budget && parsedBudget > budget.maximum_limit_micro_usd) {
            setBudgetInputError(
                `The maximum provisioned budget is ${formatMicroUsd(budget.maximum_limit_micro_usd)}.`,
            );
            return;
        }
        setSaving(true);
        setFormError(null);
        setBaseUrlError(null);
        setBudgetInputError(null);
        const payload: LLMSettingsUpsert = {
            provider: provider.trim(),
            model: model.trim() ? model.trim() : null,
            base_url: baseUrl.trim() ? baseUrl.trim() : null,
        };
        // Only send the api_key when the admin actually typed a new one; leaving
        // it blank preserves the previously-stored (masked) key server-side.
        if (apiKey.trim()) {
            payload.api_key = apiKey.trim();
        }
        // Blank preserves the existing backend value. Zero is intentionally
        // included because it is the explicit hard-stop configuration.
        if (parsedBudget !== null) {
            payload.budget_limit_micro_usd = parsedBudget;
        }
        const result = await saveSettingsAction(payload);
        setSaving(false);
        if (result.status === 400) {
            if (parsedBudget !== null && result.error?.toLowerCase().includes("budget")) {
                setBudgetInputError(result.error);
            } else {
                setBaseUrlError(result.error ?? "The base URL is invalid.");
            }
            toast.error("Could not save BYO-LLM settings.");
            return;
        }
        if (result.error) {
            setFormError(result.error);
            toast.error("Could not save BYO-LLM settings.");
            return;
        }
        if (result.data) {
            applySettings(result.data);
            void fetchStatus();
            void fetchBudget();
        }
        toast.success("BYO-LLM settings saved.");
    };

    const handleDelete = async () => {
        if (!confirmingDelete) {
            setConfirmingDelete(true);
            return;
        }
        setDeleting(true);
        setFormError(null);
        const result = await removeSettingsAction();
        setDeleting(false);
        setConfirmingDelete(false);
        if (result.error && result.status !== 404) {
            setFormError(result.error);
            toast.error("Could not remove BYO-LLM settings.");
            return;
        }
        setProvider(DEFAULT_PROVIDER);
        setModel("");
        setBaseUrl("");
        setApiKey("");
        setMaskedKey(null);
        setHasStoredKey(false);
        setHasSavedSettings(false);
        setSavedSettings(null);
        setStatus(null);
        setMode("edit");
        toast.success("BYO-LLM settings removed.");
    };

    const runByoPreflight = async () => {
        setCheckingReadiness(true);
        const result = await runReadinessAction();
        setCheckingReadiness(false);
        if (result.error) {
            // The action itself failed (network/backend error, or no saved
            // BYO configuration) — distinct from a completed preflight that
            // determined the provider is not ready (handled below).
            toast.error(result.error || "BYO preflight did not complete.");
            return;
        }
        if (result.data) {
            // The POST already returns the fresh status DTO; apply it
            // directly instead of re-fetching.
            setStatus(result.data);
            if (result.data.readiness === "failed") {
                toast.error(result.data.readiness_safe_failure_reason ?? "BYO preflight failed.");
                return;
            }
        }
        toast.success("BYO preflight completed.");
    };

    if (loading) {
        return (
            <div>
                <h2 className="text-h2 text-(--text-primary)">BYO LLM</h2>
                <div className="mt-6 py-12 text-center text-(--text-muted)">
                    Loading BYO LLM settings...
                </div>
            </div>
        );
    }

    if (locked) {
        return (
            <div>
                <h2 className="mb-6 text-h2 text-(--text-primary)">BYO LLM</h2>
                <div className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-8 text-center">
                    <div className="mx-auto max-w-md space-y-4">
                        <p className="text-xs font-semibold uppercase tracking-wider text-(--accent)">
                            {locked.reason === "not_licensed"
                                ? `${BYO_REQUIRED_TIER_LABEL} Plan Feature`
                                : "Feature Disabled"}
                        </p>
                        <h3 className="text-h3 text-foreground">BYO-LLM is locked</h3>
                        <p className="text-sm text-(--ink-muted)">{locked.message}</p>
                        <p className="text-sm text-(--ink-muted)">
                            BYO-LLM requires Team tier or higher. Keys are encrypted with the org
                            settings store and masked in all responses.
                        </p>
                        {locked.reason === "not_licensed" ? (
                            <Link
                                href="/org/admin/settings"
                                className="inline-flex items-center justify-center rounded-full bg-(--accent) px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-(--accent)/90"
                            >
                                {`Upgrade to ${BYO_REQUIRED_TIER_LABEL}`}
                            </Link>
                        ) : null}
                    </div>
                </div>
            </div>
        );
    }

    if (loadError) {
        return (
            <div>
                <header className="mb-8">
                    <h2 className="text-h2 text-(--text-primary)">BYO LLM</h2>
                </header>

                <div className="rounded-2xl border border-(--negative)/20 bg-(--negative)/10 p-6 text-sm text-(--negative)">
                    <p>{loadError}</p>
                    <button
                        type="button"
                        onClick={fetchSettings}
                        className="mt-4 rounded-lg border border-(--negative)/30 bg-(--card-80) px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-(--negative)/50"
                    >
                        {CTA_LABELS.retry}
                    </button>
                </div>
            </div>
        );
    }

    const providerLabel = LLM_PROVIDER_LABELS[provider as LLMProvider] ?? provider;
    const badge = deriveStatusBadge(status, hasSavedSettings);

    const statusBadge = (
        <span
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${BADGE_TONE_CLASSES[badge.tone]}`}
        >
            <span
                aria-hidden="true"
                className={`h-2 w-2 rounded-full ${BADGE_DOT_CLASSES[badge.tone]}`}
            />
            {badge.label}
        </span>
    );

    const readinessBadge = deriveReadinessBadge(status);
    // Rendered whenever a BYO configuration is saved — independent of
    // `status?.active`/`mode` (CHAOS-3265). A saved-but-degraded or
    // not-currently-selected configuration is still explicitly checkable.
    const byoPreflightPanel = hasSavedSettings ? (
        <section
            aria-labelledby="byo-preflight-heading"
            data-testid="byo-llm-preflight"
            className="mt-6 rounded-xl border border-(--card-stroke) bg-(--card-70) p-4"
        >
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2
                        id="byo-preflight-heading"
                        className="text-sm font-semibold text-foreground"
                    >
                        BYO preflight
                    </h2>
                    <p className="mt-1 max-w-xl text-xs text-(--ink-muted)">
                        Tests only this saved BYO configuration. It does not consume Ask Dev&apos;s
                        platform allowance, does not change which provider Ask Dev currently uses,
                        and does not send organization evidence — synthetic data only.
                    </p>
                </div>
                <span
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${BADGE_TONE_CLASSES[readinessBadge.tone]}`}
                >
                    <span
                        aria-hidden="true"
                        className={`h-2 w-2 rounded-full ${BADGE_DOT_CLASSES[readinessBadge.tone]}`}
                    />
                    {readinessBadge.label}
                </span>
            </div>
            <p className="mt-3 text-xs text-(--ink-muted)">
                Last checked: {formatCheckedAt(status?.readiness_checked_at ?? null)}
            </p>
            {status?.readiness === "failed" && status.readiness_safe_failure_reason ? (
                <p className="mt-2 text-sm text-(--negative)">
                    {status.readiness_safe_failure_reason}
                </p>
            ) : null}
            <button
                type="button"
                onClick={() => void runByoPreflight()}
                disabled={checkingReadiness}
                className="mt-4 rounded-lg border border-(--card-stroke) bg-(--card-80) px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-(--accent)/60 disabled:opacity-50"
            >
                {checkingReadiness ? "Checking…" : CTA_LABELS.runByoPreflight}
            </button>
        </section>
    ) : null;

    const budgetBadge = budget ? deriveBudgetBadge(budget) : null;
    const budgetPanel = (
        <section
            aria-labelledby="byo-budget-heading"
            data-testid="byo-llm-budget-status"
            className="mt-6 rounded-xl border border-(--card-stroke) bg-(--card-70) p-4"
        >
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 id="byo-budget-heading" className="text-sm font-semibold text-foreground">
                        Organization budget
                    </h2>
                    <p className="mt-1 text-xs text-(--ink-muted)">
                        Hard monthly cap for calls made with this organization&apos;s provider
                        credentials.
                    </p>
                </div>
                {budgetBadge ? (
                    <span
                        className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${BADGE_TONE_CLASSES[budgetBadge.tone]}`}
                    >
                        <span
                            aria-hidden="true"
                            className={`h-2 w-2 rounded-full ${BADGE_DOT_CLASSES[budgetBadge.tone]}`}
                        />
                        {budgetBadge.label}
                    </span>
                ) : null}
            </div>

            {budgetLoading ? (
                <DataState
                    variant="loading"
                    title="Loading budget status…"
                    className="mt-4"
                    data-testid="byo-llm-budget-loading"
                />
            ) : budgetLoadError ? (
                <DataState
                    variant="error"
                    title="Budget status unavailable"
                    message={budgetLoadError}
                    className="mt-4"
                    data-testid="byo-llm-budget-error"
                    action={
                        <button
                            type="button"
                            onClick={fetchBudget}
                            className="rounded-lg border border-(--negative)/30 bg-(--card-80) px-3 py-1.5 text-xs font-medium text-foreground"
                        >
                            {CTA_LABELS.retry}
                        </button>
                    }
                />
            ) : budget ? (
                <div className="mt-4 space-y-3">
                    {budget.limit_micro_usd !== null ? (
                        <dl className="grid gap-3 text-sm sm:grid-cols-3">
                            <div>
                                <dt className={labelClass}>Used or reserved</dt>
                                <dd>{formatMicroUsd(budget.used_micro_usd)}</dd>
                            </div>
                            <div>
                                <dt className={labelClass}>Monthly limit</dt>
                                <dd>{formatMicroUsd(budget.limit_micro_usd)}</dd>
                            </div>
                            <div>
                                <dt className={labelClass}>Remaining</dt>
                                <dd>{formatMicroUsd(budget.remaining_micro_usd)}</dd>
                            </div>
                        </dl>
                    ) : (
                        <p className="text-sm text-(--ink-muted)">
                            Set a limit to prevent BYO-LLM spend from exceeding an organization
                            ceiling.
                        </p>
                    )}

                    {budget.reason === "budget_exhausted" ? (
                        <p className="text-sm text-(--negative)">
                            New budgeted BYO-LLM calls are blocked until the limit is increased or
                            the monthly window resets.
                        </p>
                    ) : budget.reason === "usage_unavailable" ? (
                        <p className="text-sm text-(--negative)">
                            A completed call did not report usable token data. New budgeted calls
                            are blocked so missing usage cannot bypass the cap.
                        </p>
                    ) : budget.reason === "pricing_unavailable" ? (
                        <p className="text-sm text-(--negative)">
                            The current provider, model, or custom base URL has no reliable price.
                            New budgeted calls are blocked because the cap cannot be safely enforced
                            for that configuration.
                        </p>
                    ) : budget.reason === "available" && budgetBadge?.tone === "caution" ? (
                        <p className="text-sm text-(--caution)">
                            At least 80% of the monthly organization budget has been used or
                            reserved.
                        </p>
                    ) : null}

                    <p className="text-xs text-(--ink-muted)">
                        Calendar month (UTC) · resets {formatResetAt(budget.reset_at)} · maximum
                        provisioned limit {formatMicroUsd(budget.maximum_limit_micro_usd)}
                    </p>
                </div>
            ) : null}
        </section>
    );

    const deleteButton = (
        <button
            type="button"
            onClick={handleDelete}
            disabled={deleting || (!hasSavedSettings && !hasStoredKey)}
            className="rounded-lg bg-(--negative)/10 px-4 py-2 text-sm font-medium text-(--negative) disabled:opacity-50"
        >
            {deleting
                ? "Deleting…"
                : confirmingDelete
                  ? CTA_LABELS.confirmDelete
                  : CTA_LABELS.delete}
        </button>
    );

    return (
        <div>
            <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                    <h2 className="text-h2 text-(--text-primary)">BYO LLM</h2>
                    <p className="mt-1 max-w-2xl text-sm text-(--ink-muted)">
                        Provide your own provider, model, and credentials. Resolution precedence:
                        per-call kill-switch › org settings › platform default.
                    </p>
                </div>
                <div className="shrink-0">{statusBadge}</div>
            </header>

            {formError && (
                <div className="mb-6 rounded-2xl border border-(--negative)/20 bg-(--negative)/10 p-4 text-sm text-(--negative)">
                    {formError}
                </div>
            )}

            {mode === "view" && hasSavedSettings ? (
                <div className="rounded-2xl border border-(--card-stroke) bg-(--card-80) p-6">
                    <dl className="grid gap-5 sm:grid-cols-2">
                        <div>
                            <dt className={labelClass}>Provider</dt>
                            <dd className="text-sm text-foreground">{providerLabel}</dd>
                        </div>
                        <div>
                            <dt className={labelClass}>Model</dt>
                            <dd className="text-sm text-foreground">{model || "Not set"}</dd>
                        </div>
                        <div>
                            <dt className={labelClass}>API Key</dt>
                            <dd className="text-sm text-foreground">{maskedKey ?? "••••••••"}</dd>
                        </div>
                        <div>
                            <dt className={labelClass}>Base URL</dt>
                            <dd className="text-sm text-foreground">{baseUrl || "Not set"}</dd>
                        </div>
                    </dl>

                    {budgetPanel}

                    <div className="mt-6 rounded-xl border border-dashed border-(--card-stroke) bg-(--card-70) px-4 py-3 text-xs text-(--ink-muted)">
                        BYO-LLM requires Team tier or higher. Keys are encrypted with the org
                        settings store and masked in all responses.
                    </div>

                    <div className="mt-6 flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={handleEdit}
                            className="rounded-lg border border-(--card-stroke) bg-(--card-70) px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-(--accent)/60"
                        >
                            {CTA_LABELS.edit}
                        </button>
                        {deleteButton}
                    </div>
                </div>
            ) : (
                <div className="rounded-2xl border border-(--card-stroke) bg-(--card-80) p-6">
                    <div className="grid gap-5 sm:grid-cols-2">
                        <div>
                            <label htmlFor="byo-provider" className={labelClass}>
                                Provider
                            </label>
                            <select
                                id="byo-provider"
                                value={provider}
                                onChange={(e) => setProvider(e.target.value)}
                                className={inputClass}
                            >
                                {LLM_PROVIDERS.map((p) => (
                                    <option key={p} value={p}>
                                        {LLM_PROVIDER_LABELS[p]}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label htmlFor="byo-model" className={labelClass}>
                                Model
                            </label>
                            <input
                                id="byo-model"
                                type="text"
                                value={model}
                                placeholder="Model name"
                                onChange={(e) => setModel(e.target.value)}
                                className={inputClass}
                            />
                        </div>

                        <div>
                            <label htmlFor="byo-api-key" className={labelClass}>
                                API Key
                            </label>
                            <input
                                id="byo-api-key"
                                type="password"
                                autoComplete="off"
                                value={apiKey}
                                placeholder={hasStoredKey ? (maskedKey ?? "••••••••") : "sk-..."}
                                onChange={(e) => setApiKey(e.target.value)}
                                className={inputClass}
                            />
                            <p className={captionClass}>
                                {hasStoredKey
                                    ? "Encrypted at rest, never returned. Enter a new key to replace the stored key."
                                    : "Encrypted at rest, never returned."}
                            </p>
                        </div>

                        <div>
                            <label htmlFor="byo-base-url" className={labelClass}>
                                Base URL
                            </label>
                            <input
                                id="byo-base-url"
                                type="text"
                                value={baseUrl}
                                placeholder="https://..."
                                onChange={(e) => setBaseUrl(e.target.value)}
                                className={`${inputClass} ${baseUrlError ? "border-(--negative)/60" : ""}`}
                                aria-invalid={baseUrlError ? true : undefined}
                            />
                            {baseUrlError ? (
                                <p className="mt-1 text-xs text-(--negative)">{baseUrlError}</p>
                            ) : (
                                <p className={captionClass}>
                                    Optional. OpenAI-compatible endpoints.
                                </p>
                            )}
                        </div>

                        <div className="sm:col-span-2">
                            <label htmlFor="byo-budget-usd" className={labelClass}>
                                Monthly organization budget (USD)
                            </label>
                            <div className="relative max-w-sm">
                                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-(--ink-muted)">
                                    $
                                </span>
                                <input
                                    id="byo-budget-usd"
                                    type="text"
                                    inputMode="decimal"
                                    value={budgetUsd}
                                    disabled={budgetLoading || saving}
                                    placeholder="Leave blank to preserve current limit"
                                    onChange={(event) => {
                                        setBudgetUsd(event.target.value);
                                        setBudgetInputError(null);
                                    }}
                                    className={`${inputClass} pl-7 disabled:opacity-50 ${budgetInputError ? "border-(--negative)/60" : ""}`}
                                    aria-invalid={budgetInputError ? true : undefined}
                                    aria-describedby="byo-budget-caption"
                                />
                            </div>
                            {budgetInputError ? (
                                <p
                                    id="byo-budget-caption"
                                    className="mt-1 text-xs text-(--negative)"
                                >
                                    {budgetInputError}
                                </p>
                            ) : (
                                <p id="byo-budget-caption" className={captionClass}>
                                    Blank preserves the current limit. Enter 0 for an immediate hard
                                    stop. Up to 6 decimal places are supported.
                                </p>
                            )}
                        </div>
                    </div>

                    {budgetPanel}

                    <div className="mt-6 rounded-xl border border-dashed border-(--card-stroke) bg-(--card-70) px-4 py-3 text-xs text-(--ink-muted)">
                        BYO-LLM requires Team tier or higher. Keys are encrypted with the org
                        settings store and masked in all responses.
                    </div>

                    <div className="mt-6 flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={saving}
                            className="rounded-lg bg-(--accent) px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                        >
                            {saving ? "Saving…" : CTA_LABELS.save}
                        </button>
                        {hasSavedSettings && (
                            <button
                                type="button"
                                onClick={handleCancel}
                                disabled={saving}
                                className="rounded-lg border border-(--card-stroke) bg-(--card-70) px-4 py-2 text-sm font-medium text-foreground disabled:opacity-50"
                            >
                                {CTA_LABELS.cancel}
                            </button>
                        )}
                        {deleteButton}
                    </div>
                </div>
            )}

            {byoPreflightPanel}
        </div>
    );
}
