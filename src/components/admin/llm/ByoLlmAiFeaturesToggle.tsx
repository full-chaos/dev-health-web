"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/shared/Button";
import { Section } from "@/components/ui/Section";
import { CTA_LABELS } from "@/lib/design/cta";
import { READ_FAILED_MESSAGE } from "@/lib/readFailure";
import type { ServiceModelSetting } from "@/lib/admin/api/llm-settings";
import type { LLMSettingsActionResult } from "@/lib/admin/types";

export type ByoLlmAiFeaturesToggleProps = {
    loadAction: () => Promise<LLMSettingsActionResult<ServiceModelSetting>>;
    saveAction: (enabled: boolean) => Promise<LLMSettingsActionResult<ServiceModelSetting>>;
};

export const AI_FEATURES_TITLE = "ACR AI features";
export const AI_FEATURES_DESCRIPTION =
    "Off stops ACR AI features for your org, including when you use your own key. On by default once a BYO key is saved.";
export const AI_FEATURES_MODEL_NOTE =
    "ACR AI features such as MCP investigations run on your saved BYO model. The platform model is used only when a platform administrator turns it on for your org.";
export const AI_FEATURES_MANAGED_NOTE =
    "This setting is managed by your plan or support. Contact support to change it.";

export function ByoLlmAiFeaturesToggle({ loadAction, saveAction }: ByoLlmAiFeaturesToggleProps) {
    const [setting, setSetting] = useState<ServiceModelSetting | null>(null);
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
            <Section title={AI_FEATURES_TITLE} description={loadError}>
                <Button variant="secondary" onClick={() => void load()}>
                    {CTA_LABELS.retry}
                </Button>
            </Section>
        );
    }
    if (!setting || !setting.eligible) return null;

    const managed = setting.control === "managed";
    const next = !setting.enabled;

    async function flip() {
        setBusy(true);
        setSaveError(null);
        const result = await saveAction(next);
        setBusy(false);
        if (result.data) {
            setSetting(result.data);
            toast.success(next ? "ACR AI features turned on" : "ACR AI features turned off");
            return;
        }
        setSaveError(result.error ?? READ_FAILED_MESSAGE);
        // A 409 means billing or support took the setting over: show its current state.
        if (result.status === 409) void load();
    }

    return (
        <Section title={AI_FEATURES_TITLE} description={AI_FEATURES_DESCRIPTION}>
            <div className="flex flex-col gap-3">
                <p className="text-sm text-(--ink-muted)">{AI_FEATURES_MODEL_NOTE}</p>
                <div className="flex flex-wrap items-center gap-3">
                    <span
                        className="text-sm font-medium"
                        data-testid="ai-features-state"
                        aria-live="polite"
                    >
                        {setting.enabled ? "On" : "Off"}
                    </span>
                    {managed ? null : (
                        <Button
                            variant={setting.enabled ? "secondary" : "primary"}
                            disabled={busy}
                            aria-pressed={setting.enabled}
                            onClick={() => void flip()}
                        >
                            {setting.enabled ? "Turn off" : "Turn on"}
                        </Button>
                    )}
                </div>
                {managed ? (
                    <p className="text-sm text-(--ink-muted)">{AI_FEATURES_MANAGED_NOTE}</p>
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
