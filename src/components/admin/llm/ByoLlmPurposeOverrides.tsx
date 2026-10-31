"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/shared/Button";
import { CTA_LABELS } from "@/lib/design/cta";
import { Section } from "@/components/ui/Section";
import { notifyByoLlmConfigChanged, onByoLlmConfigChanged } from "@/lib/admin/byoLlmConfigChanges";
import { READ_FAILED_MESSAGE } from "@/lib/readFailure";
import { categorizeRefusalMessage } from "@/lib/admin/categorizeRefusals";
import {
    CATEGORIZE_MODELS,
    CATEGORIZE_PROVIDER,
    CATEGORIZE_PROVIDER_LABEL,
    LLM_PROVIDERS,
    LLM_PROVIDER_LABELS,
    LLM_PURPOSES,
    LLM_PURPOSE_LABELS,
    type LLMPurpose,
    type LLMPurposeSettings,
    type LLMPurposeUpsert,
    type LLMSettingsActionResult,
    type LLMSettingsResponse,
} from "@/lib/admin/types";

export type ByoLlmPurposeOverridesProps = {
    loadSettingsAction: () => Promise<LLMSettingsActionResult<LLMSettingsResponse>>;
    saveAction: (data: LLMPurposeUpsert) => Promise<LLMSettingsActionResult<LLMPurposeSettings>>;
    removeAction: (
        purpose: LLMPurpose,
    ) => Promise<LLMSettingsActionResult<{ deleted: boolean; purpose: string }>>;
};

const inputClass =
    "w-full rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-sm focus:border-(--accent-2) focus:outline-none";
const labelClass = "mb-1 block text-xs font-medium uppercase tracking-wide text-(--ink-muted)";

const PURPOSE_HELP: Record<LLMPurpose, string> = {
    investigate: "Answering a question: the heavier model for complex investigations.",
    explain: "Short explanations of a chart or work unit: a smaller, cheaper model fits.",
    categorize: "Sorting work into categories: runs on your Cloudflare Workers AI account.",
};

function providerLabel(provider: string): string {
    if (provider === CATEGORIZE_PROVIDER) return CATEGORIZE_PROVIDER_LABEL;
    return LLM_PROVIDER_LABELS[provider as keyof typeof LLM_PROVIDER_LABELS] ?? provider;
}

type Loaded = {
    defaultProvider: string | null;
    hasDefaultKey: boolean;
    optedIn: boolean;
    overrides: Partial<Record<LLMPurpose, LLMPurposeSettings>>;
};

export function ByoLlmPurposeOverrides({
    loadSettingsAction,
    saveAction,
    removeAction,
}: ByoLlmPurposeOverridesProps) {
    const [loaded, setLoaded] = useState<Loaded | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);

    const load = useCallback(async () => {
        const result = await loadSettingsAction();
        if (!result.data) {
            setLoaded(null);
            // 402/403 mean BYO is gated; the default section already says so.
            setLoadError(
                result.status === 402 || result.status === 403 ? null : READ_FAILED_MESSAGE,
            );
            return;
        }
        setLoadError(null);
        setLoaded({
            defaultProvider: result.data.provider ?? null,
            hasDefaultKey: Boolean(result.data.api_key),
            optedIn: result.data.categorize_byo === true,
            overrides: result.data.purposes ?? {},
        });
    }, [loadSettingsAction]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- load on mount
        void load();
    }, [load]);

    useEffect(() => onByoLlmConfigChanged(() => void load()), [load]);

    if (loadError) {
        return (
            <Section title="Models per purpose" description={loadError}>
                <Button variant="secondary" onClick={() => void load()}>
                    {CTA_LABELS.retry}
                </Button>
            </Section>
        );
    }
    if (!loaded || !loaded.defaultProvider) return null;

    const purposes: LLMPurpose[] = loaded.optedIn ? [...LLM_PURPOSES, "categorize"] : LLM_PURPOSES;

    return (
        <Section
            title="Models per purpose"
            description="Optional. Each purpose uses the default configuration above unless you set its own model."
        >
            <div className="flex flex-col gap-6">
                {purposes.map((purpose) => (
                    <PurposeForm
                        key={purpose}
                        purpose={purpose}
                        loaded={loaded}
                        saveAction={saveAction}
                        removeAction={removeAction}
                        onChanged={load}
                    />
                ))}
            </div>
        </Section>
    );
}

function PurposeForm({
    purpose,
    loaded,
    saveAction,
    removeAction,
    onChanged,
}: {
    purpose: LLMPurpose;
    loaded: Loaded;
    saveAction: ByoLlmPurposeOverridesProps["saveAction"];
    removeAction: ByoLlmPurposeOverridesProps["removeAction"];
    onChanged: () => Promise<void>;
}) {
    const stored = loaded.overrides[purpose];
    const [editing, setEditing] = useState(false);
    const [provider, setProvider] = useState(
        purpose === "categorize"
            ? CATEGORIZE_PROVIDER
            : (stored?.provider ?? loaded.defaultProvider ?? ""),
    );
    const [model, setModel] = useState(stored?.model ?? "");
    const [apiKey, setApiKey] = useState("");
    const [baseUrl, setBaseUrl] = useState(stored?.base_url ?? "");
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const idPrefix = `byo-${purpose}`;
    const isCategorize = purpose === "categorize";

    const sameProvider = !isCategorize && provider === loaded.defaultProvider;
    const keyInherited = sameProvider && loaded.hasDefaultKey;

    function open() {
        setProvider(
            isCategorize ? CATEGORIZE_PROVIDER : (stored?.provider ?? loaded.defaultProvider ?? ""),
        );
        setModel(stored?.model ?? (isCategorize ? CATEGORIZE_MODELS[0] : ""));
        setApiKey("");
        setBaseUrl(stored?.base_url ?? "");
        setError(null);
        setEditing(true);
    }

    async function save() {
        if (!model.trim()) {
            setError("Enter a model for this purpose.");
            return;
        }
        if (!keyInherited && !stored && !apiKey.trim()) {
            setError("A different provider needs its own API key.");
            return;
        }
        setBusy(true);
        setError(null);
        const result = await saveAction({
            purpose,
            provider,
            model: model.trim(),
            ...(apiKey.trim() ? { api_key: apiKey.trim() } : {}),
            ...(baseUrl.trim() ? { base_url: baseUrl.trim() } : {}),
        });
        setBusy(false);
        if (result.error) {
            setError(categorizeRefusalMessage(result.code) ?? result.error);
            return;
        }
        toast.success(`${LLM_PURPOSE_LABELS[purpose]} model saved.`);
        setEditing(false);
        await onChanged();
        notifyByoLlmConfigChanged();
    }

    async function remove() {
        setBusy(true);
        const result = await removeAction(purpose);
        setBusy(false);
        if (result.error) {
            setError(categorizeRefusalMessage(result.code) ?? result.error);
            return;
        }
        toast.success(`${LLM_PURPOSE_LABELS[purpose]} now uses the default.`);
        setEditing(false);
        await onChanged();
        notifyByoLlmConfigChanged();
    }

    return (
        <div className="flex flex-col gap-3 border-t border-(--card-stroke) pt-4 first:border-t-0 first:pt-0">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h3 className="text-sm font-semibold">{LLM_PURPOSE_LABELS[purpose]}</h3>
                    <p className="text-xs text-(--ink-muted)">{PURPOSE_HELP[purpose]}</p>
                    {!editing ? (
                        <p className="mt-1 text-sm">
                            {stored
                                ? `${providerLabel(stored.provider)} · ${stored.model}`
                                : "Use default"}
                        </p>
                    ) : null}
                </div>
                {!editing ? (
                    <div className="flex gap-2">
                        <Button variant="secondary" onClick={open}>
                            {stored ? "Edit" : "Set model"}
                        </Button>
                        {stored ? (
                            <Button
                                variant="secondary"
                                disabled={busy}
                                onClick={() => void remove()}
                            >
                                {CTA_LABELS.useDefaultModel}
                            </Button>
                        ) : null}
                    </div>
                ) : null}
            </div>
            {editing ? (
                <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                        <label htmlFor={`${idPrefix}-provider`} className={labelClass}>
                            Provider
                        </label>
                        <select
                            id={`${idPrefix}-provider`}
                            value={provider}
                            onChange={(e) => setProvider(e.target.value)}
                            className={inputClass}
                            disabled={isCategorize}
                        >
                            {isCategorize ? (
                                <option value={CATEGORIZE_PROVIDER}>
                                    {CATEGORIZE_PROVIDER_LABEL}
                                </option>
                            ) : (
                                LLM_PROVIDERS.map((p) => (
                                    <option key={p} value={p}>
                                        {LLM_PROVIDER_LABELS[p]}
                                    </option>
                                ))
                            )}
                        </select>
                    </div>
                    <div>
                        <label htmlFor={`${idPrefix}-model`} className={labelClass}>
                            Model
                        </label>
                        {isCategorize ? (
                            <select
                                id={`${idPrefix}-model`}
                                value={model}
                                onChange={(e) => setModel(e.target.value)}
                                className={inputClass}
                            >
                                {CATEGORIZE_MODELS.map((m) => (
                                    <option key={m} value={m}>
                                        {m}
                                    </option>
                                ))}
                            </select>
                        ) : (
                            <input
                                id={`${idPrefix}-model`}
                                value={model}
                                onChange={(e) => setModel(e.target.value)}
                                className={inputClass}
                                autoComplete="off"
                            />
                        )}
                    </div>
                    <div>
                        <label htmlFor={`${idPrefix}-key`} className={labelClass}>
                            API Key
                        </label>
                        <input
                            id={`${idPrefix}-key`}
                            type="password"
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            className={inputClass}
                            autoComplete="off"
                            placeholder={
                                stored?.api_key
                                    ? stored.api_key
                                    : keyInherited
                                      ? "Uses the default key"
                                      : ""
                            }
                        />
                    </div>
                    <div>
                        <label htmlFor={`${idPrefix}-base-url`} className={labelClass}>
                            Base URL
                        </label>
                        <input
                            id={`${idPrefix}-base-url`}
                            value={baseUrl}
                            onChange={(e) => setBaseUrl(e.target.value)}
                            className={inputClass}
                            autoComplete="off"
                        />
                    </div>
                    {error ? (
                        <p role="alert" className="text-sm text-(--negative) sm:col-span-2">
                            {error}
                        </p>
                    ) : null}
                    <div className="flex gap-2 sm:col-span-2">
                        <Button disabled={busy} onClick={() => void save()}>
                            {CTA_LABELS.save}
                        </Button>
                        <Button
                            variant="secondary"
                            disabled={busy}
                            onClick={() => setEditing(false)}
                        >
                            {CTA_LABELS.cancel}
                        </Button>
                    </div>
                </div>
            ) : error ? (
                <p role="alert" className="text-sm text-(--negative)">
                    {error}
                </p>
            ) : null}
        </div>
    );
}
