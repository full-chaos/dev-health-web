"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CTA_LABELS } from "@/lib/design/cta";
import {
    LLM_PROVIDERS,
    LLM_PROVIDER_LABELS,
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

type BadgeTone = "positive" | "caution" | "muted";

type BadgeInfo = {
    label: string;
    tone: BadgeTone;
};

export type ByoLlmSettingsProps = {
    loadSettingsAction: () => Promise<LLMSettingsActionResult<LLMSettingsResponse>>;
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
};

const inputClass =
    "w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm focus:border-(--accent) focus:outline-none";
const labelClass = "mb-1 block text-xs font-medium uppercase tracking-wide text-(--ink-muted)";
const captionClass = "mt-1 text-xs text-(--ink-muted)";

const BADGE_TONE_CLASSES: Record<BadgeTone, string> = {
    positive: "bg-(--positive)/10 text-(--positive)",
    caution: "bg-(--caution)/10 text-(--caution)",
    muted: "bg-(--card-70) text-(--ink-muted)",
};

const BADGE_DOT_CLASSES: Record<BadgeTone, string> = {
    positive: "bg-(--positive)",
    caution: "bg-(--caution)",
    muted: "bg-(--ink-muted)",
};

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

export function ByoLlmSettings({
    loadSettingsAction,
    loadStatusAction,
    saveSettingsAction,
    removeSettingsAction,
}: ByoLlmSettingsProps) {
    const [loading, setLoading] = useState(true);
    const [locked, setLocked] = useState<LockState>(null);
    const [loadError, setLoadError] = useState<string | null>(null);

    const [mode, setMode] = useState<Mode>("edit");
    const [savedSettings, setSavedSettings] = useState<LLMSettingsResponse | null>(null);
    const [status, setStatus] = useState<LLMSettingsStatusResponse | null>(null);

    const [provider, setProvider] = useState<string>(DEFAULT_PROVIDER);
    const [model, setModel] = useState("");
    const [apiKey, setApiKey] = useState("");
    const [baseUrl, setBaseUrl] = useState("");
    const [hasStoredKey, setHasStoredKey] = useState(false);
    const [maskedKey, setMaskedKey] = useState<string | null>(null);
    const [hasSavedSettings, setHasSavedSettings] = useState(false);

    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const [baseUrlError, setBaseUrlError] = useState<string | null>(null);
    const [formError, setFormError] = useState<string | null>(null);

    const fetchStatus = useCallback(async () => {
        const result = await loadStatusAction();
        setStatus(result.data ?? null);
    }, [loadStatusAction]);

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
        }
        setLoading(false);
    }, [loadSettingsAction, applySettings, fetchStatus]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- fetchSettings coordinates async loading state after mount.
        fetchSettings();
    }, [fetchSettings]);

    const handleEdit = () => {
        setFormError(null);
        setBaseUrlError(null);
        setConfirmingDelete(false);
        setMode("edit");
    };

    const handleCancel = () => {
        if (savedSettings) {
            setProvider(savedSettings.provider ?? DEFAULT_PROVIDER);
            setModel(savedSettings.model ?? "");
            setBaseUrl(savedSettings.base_url ?? "");
            setApiKey("");
        }
        setFormError(null);
        setBaseUrlError(null);
        setConfirmingDelete(false);
        setMode("view");
    };

    const handleSave = async () => {
        if (!provider.trim()) {
            setFormError("Select a provider before saving.");
            return;
        }
        setSaving(true);
        setFormError(null);
        setBaseUrlError(null);
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
        const result = await saveSettingsAction(payload);
        setSaving(false);
        if (result.status === 400) {
            setBaseUrlError(result.error ?? "The base URL is invalid.");
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

    const eyebrow = (
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-(--ink-muted)">
            Organization Settings
        </p>
    );

    if (loading) {
        return (
            <div>
                {eyebrow}
                <h1 className="mt-2 font-(--font-display) text-2xl font-bold">AI Setup</h1>
                <div className="mt-8 py-12 text-center text-(--ink-muted)">Loading AI setup...</div>
            </div>
        );
    }

    if (locked) {
        return (
            <div>
                {eyebrow}
                <h1 className="mt-2 mb-6 font-(--font-display) text-2xl font-bold">AI Setup</h1>
                <div className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-8 text-center">
                    <div className="mx-auto max-w-md space-y-4">
                        <p className="text-xs font-semibold uppercase tracking-wider text-(--accent)">
                            {locked.reason === "not_licensed"
                                ? `${BYO_REQUIRED_TIER_LABEL} Plan Feature`
                                : "Feature Disabled"}
                        </p>
                        <h2 className="font-(--font-display) text-2xl text-foreground">
                            BYO-LLM is locked
                        </h2>
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
                    {eyebrow}
                    <h1 className="mt-2 font-(--font-display) text-2xl font-bold">AI Setup</h1>
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
                    {eyebrow}
                    <h1 className="mt-2 font-(--font-display) text-2xl font-bold">AI Setup</h1>
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
                    </div>

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
        </div>
    );
}
