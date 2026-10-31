"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/shared/Button";
import { Switch } from "@/components/shared/Switch";
import { Section } from "@/components/ui/Section";
import { CTA_LABELS } from "@/lib/design/cta";
import { categorizeRefusalMessage } from "@/lib/admin/categorizeRefusals";
import { notifyByoLlmConfigChanged, onByoLlmConfigChanged } from "@/lib/admin/byoLlmConfigChanges";
import { READ_FAILED_MESSAGE, SAVE_FAILED_MESSAGE } from "@/lib/readFailure";
import { isUnreadableSettings } from "@/lib/admin/types";
import type {
    LLMSettingsActionResult,
    LLMSettingsResponse,
    LLMSettingsUpsert,
} from "@/lib/admin/types";

export type ByoLlmCategorizeOptInProps = {
    loadSettingsAction: () => Promise<LLMSettingsActionResult<LLMSettingsResponse>>;
    saveAction: (data: LLMSettingsUpsert) => Promise<LLMSettingsActionResult<LLMSettingsResponse>>;
};

export const CATEGORIZE_OPT_IN_TITLE = "Categorization on your own model";
export const CATEGORIZE_OPT_IN_DESCRIPTION =
    "Categorization runs on the platform model unless you opt in. When you opt in, it runs on your own provider and is billed to your account.";

type State = { provider: string | null; model: string | null; enabled: boolean };

export function ByoLlmCategorizeOptIn({
    loadSettingsAction,
    saveAction,
}: ByoLlmCategorizeOptInProps) {
    const [state, setState] = useState<State | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    const load = useCallback(async () => {
        const result = await loadSettingsAction();
        if (!result.data) {
            setState(null);
            // 402/403: BYO is gated; 409 llm_settings_undecryptable: the BYO LLM card above owns the
            // unreadable key and offers Replace and Remove (CHAOS-12173). Neither gets a Retry here.
            setLoadError(
                result.status === 402 || result.status === 403 || isUnreadableSettings(result)
                    ? null
                    : READ_FAILED_MESSAGE,
            );
            return;
        }
        setLoadError(null);
        setState({
            provider: result.data.provider ?? null,
            model: result.data.model ?? null,
            enabled: result.data.categorize_byo === true,
        });
    }, [loadSettingsAction]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- load on mount
        void load();
    }, [load]);

    useEffect(() => onByoLlmConfigChanged(() => void load()), [load]);

    if (loadError) {
        return (
            <Section title={CATEGORIZE_OPT_IN_TITLE} description={loadError}>
                <Button variant="secondary" onClick={() => void load()}>
                    {CTA_LABELS.retry}
                </Button>
            </Section>
        );
    }
    if (!state) return null;

    const { provider, model } = state;
    const hasDefault = Boolean(provider && model);

    async function flip() {
        if (!provider || !model) return;
        const next = !state?.enabled;
        setBusy(true);
        setSaveError(null);
        const result = await saveAction({ provider, model, categorize_byo: next });
        setBusy(false);
        if (result.data) {
            setState((prev) => (prev ? { ...prev, enabled: next } : prev));
            toast.success(next ? "Categorization opted in" : "Categorization opted out");
            notifyByoLlmConfigChanged();
            return;
        }
        setSaveError(categorizeRefusalMessage(result.code) ?? SAVE_FAILED_MESSAGE);
    }

    return (
        <Section
            title={CATEGORIZE_OPT_IN_TITLE}
            description={CATEGORIZE_OPT_IN_DESCRIPTION}
            data-testid="ai-panel-categorize-opt-in"
        >
            <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm font-medium" aria-live="polite">
                        {state.enabled ? "On" : "Off"}
                    </span>
                    <Switch
                        checked={state.enabled}
                        disabled={busy || !hasDefault}
                        aria-label={CATEGORIZE_OPT_IN_TITLE}
                        onChange={() => void flip()}
                    />
                </div>
                {!hasDefault ? (
                    <p className="text-sm text-(--ink-muted)">Save a default model first.</p>
                ) : null}
                {saveError ? (
                    <p className="text-sm text-(--negative)" role="alert">
                        {saveError}
                    </p>
                ) : null}
            </div>
        </Section>
    );
}
