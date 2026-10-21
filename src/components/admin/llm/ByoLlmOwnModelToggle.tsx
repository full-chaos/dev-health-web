"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/shared/Button";
import { Section } from "@/components/ui/Section";
import { CTA_LABELS } from "@/lib/design/cta";
import { READ_FAILED_MESSAGE } from "@/lib/readFailure";
import type { OwnModelSetting } from "@/lib/admin/api/llm-settings";
import type { LLMSettingsActionResult } from "@/lib/admin/types";

export type ByoLlmOwnModelToggleProps = {
    loadAction: () => Promise<LLMSettingsActionResult<OwnModelSetting>>;
    saveAction: (enabled: boolean) => Promise<LLMSettingsActionResult<OwnModelSetting>>;
};

export const OWN_MODEL_TITLE = "Use your own model";
export const OWN_MODEL_DESCRIPTION =
    "Turn your saved BYO model off without deleting it. While it is off, AI features other than categorization use the platform model only when a platform administrator granted platform model fallback; otherwise they are refused.";
export const OWN_MODEL_DIAGNOSTICS_NOTE =
    "The readiness check and the model list still use your saved key while this is off, so you can check a key before turning it back on.";

export function ByoLlmOwnModelToggle({ loadAction, saveAction }: ByoLlmOwnModelToggleProps) {
    const [setting, setSetting] = useState<OwnModelSetting | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    const load = useCallback(async () => {
        const result = await loadAction();
        if (!result.data) {
            setSetting(null);
            // 402/403: the org is gated; there is no toggle to show.
            setLoadError(
                result.status === 402 || result.status === 403 ? null : READ_FAILED_MESSAGE,
            );
            return;
        }
        setLoadError(null);
        setSetting(result.data);
    }, [loadAction]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- load on mount
        void load();
    }, [load]);

    if (loadError) {
        return (
            <Section title={OWN_MODEL_TITLE} description={loadError}>
                <Button variant="secondary" onClick={() => void load()}>
                    {CTA_LABELS.retry}
                </Button>
            </Section>
        );
    }
    // With no saved config there is nothing to turn off.
    if (!setting || !setting.configured) return null;

    const next = !setting.enabled;

    async function flip() {
        setBusy(true);
        setSaveError(null);
        const result = await saveAction(next);
        setBusy(false);
        if (result.data) {
            setSetting(result.data);
            toast.success(next ? "Own model turned on" : "Own model turned off");
            return;
        }
        setSaveError(result.error ?? READ_FAILED_MESSAGE);
        // A 409 means the saved config changed under us: show its current state.
        if (result.status === 409) void load();
    }

    return (
        <Section
            title={OWN_MODEL_TITLE}
            description={OWN_MODEL_DESCRIPTION}
            data-testid="ai-panel-own-model"
        >
            <div className="flex flex-col gap-3">
                <p className="text-sm text-(--ink-muted)">{OWN_MODEL_DIAGNOSTICS_NOTE}</p>
                <div className="flex flex-wrap items-center gap-3">
                    <span
                        className="text-sm font-medium"
                        data-testid="own-model-state"
                        aria-live="polite"
                    >
                        {setting.enabled ? "On" : "Off"}
                    </span>
                    <Button
                        variant={setting.enabled ? "secondary" : "primary"}
                        disabled={busy}
                        aria-pressed={setting.enabled}
                        onClick={() => void flip()}
                    >
                        {setting.enabled ? "Turn off" : "Turn on"}
                    </Button>
                </div>
                {saveError ? (
                    <p className="text-sm text-(--negative)" role="alert">
                        {saveError}
                    </p>
                ) : null}
            </div>
        </Section>
    );
}
