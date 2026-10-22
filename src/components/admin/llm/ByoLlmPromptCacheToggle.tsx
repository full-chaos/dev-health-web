"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/shared/Button";
import { Section } from "@/components/ui/Section";
import { CTA_LABELS } from "@/lib/design/cta";
import { onByoLlmConfigChanged } from "@/lib/admin/byoLlmConfigChanges";
import { READ_FAILED_MESSAGE } from "@/lib/readFailure";
import type { PromptCacheSetting } from "@/lib/admin/api/llm-settings";
import type { LLMSettingsActionResult } from "@/lib/admin/types";

export type ByoLlmPromptCacheToggleProps = {
    loadAction: () => Promise<LLMSettingsActionResult<PromptCacheSetting>>;
    saveAction: (enabled: boolean) => Promise<LLMSettingsActionResult<PromptCacheSetting>>;
};

export const PROMPT_CACHE_TITLE = "Prompt cache";
export const PROMPT_CACHE_DESCRIPTION =
    "Ask Anthropic to cache the long, fixed instructions Ask Dev sends with each question. Applies to Anthropic models only. It is off until you turn it on.";
export const PROMPT_CACHE_COST_NOTE =
    "Writing the cached part costs about 25% more than the normal input price; reading it back within five minutes costs about a tenth. It saves money when questions come within five minutes of each other, and costs about 25% more on that part when they do not.";

export function ByoLlmPromptCacheToggle({ loadAction, saveAction }: ByoLlmPromptCacheToggleProps) {
    const [setting, setSetting] = useState<PromptCacheSetting | null>(null);
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

    // The card follows the saved config: a save or delete on this page can add or remove the Anthropic model.
    useEffect(() => onByoLlmConfigChanged(() => void load()), [load]);

    if (loadError) {
        return (
            <Section title={PROMPT_CACHE_TITLE} description={loadError}>
                <Button variant="secondary" onClick={() => void load()}>
                    {CTA_LABELS.retry}
                </Button>
            </Section>
        );
    }
    // The cache exists for an Anthropic model only: with no saved config, or one on another provider, there is nothing to turn on.
    if (!setting || !setting.configured || !setting.anthropic) return null;

    const next = !setting.enabled;

    async function flip() {
        setBusy(true);
        setSaveError(null);
        const result = await saveAction(next);
        setBusy(false);
        if (result.data) {
            setSetting(result.data);
            toast.success(next ? "Prompt cache turned on" : "Prompt cache turned off");
            return;
        }
        setSaveError(result.error ?? READ_FAILED_MESSAGE);
        if (result.status === 409) void load();
    }

    return (
        <Section
            title={PROMPT_CACHE_TITLE}
            description={PROMPT_CACHE_DESCRIPTION}
            data-testid="ai-panel-prompt-cache"
        >
            <div className="flex flex-col gap-3">
                <p className="text-sm text-(--ink-muted)">{PROMPT_CACHE_COST_NOTE}</p>
                <div className="flex flex-wrap items-center gap-3">
                    <span
                        className="text-sm font-medium"
                        data-testid="prompt-cache-state"
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
