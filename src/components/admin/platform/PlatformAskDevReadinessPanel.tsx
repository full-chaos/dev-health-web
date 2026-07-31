"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { DataState } from "@/components/ui/DataState";
import { CTA_LABELS } from "@/lib/design/cta";
import type { ActionResult } from "@/lib/result";
import type { AskDevAdminReadiness, PlatformAskDevReadinessResponse } from "@/lib/admin/types";

type PlatformAskDevReadinessPanelProps = {
    loadAction: () => Promise<ActionResult<PlatformAskDevReadinessResponse>>;
    runAction: () => Promise<ActionResult<PlatformAskDevReadinessResponse>>;
};

const READINESS_LABELS: Record<AskDevAdminReadiness, string> = {
    ready: "Ready",
    unsupported_model: "Model not certified",
    missing_credentials: "Credentials required",
    disabled: "Disabled",
    degraded: "Provider degraded",
    stale_readiness: "Readiness check expired",
};

const READINESS_TONES: Record<AskDevAdminReadiness, string> = {
    ready: "bg-(--positive)",
    unsupported_model: "bg-(--negative)",
    missing_credentials: "bg-(--caution)",
    disabled: "bg-(--ink-muted)",
    degraded: "bg-(--caution)",
    stale_readiness: "bg-(--info)",
};

function formatCheckedAt(value: string | null): string {
    if (!value) return "Not checked";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Not checked" : date.toLocaleString();
}

/**
 * Platform-admin-only surface for the operator/platform-owned Ask Dev
 * provider (CHAOS-3265). This is env-configured by the operator, is shared
 * across every organization, and is entirely independent of any
 * organization's BYO-LLM configuration — it never requires, reads, or
 * displays a per-organization provider. Organization admins manage their own
 * BYO preflight separately, from the BYO LLM tab.
 */
export function PlatformAskDevReadinessPanel({
    loadAction,
    runAction,
}: PlatformAskDevReadinessPanelProps) {
    const [loading, setLoading] = useState(true);
    const [checking, setChecking] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [readiness, setReadiness] = useState<PlatformAskDevReadinessResponse | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        const result = await loadAction();
        if ("error" in result) {
            setError(result.error ?? "Platform Ask Dev readiness could not be loaded.");
        } else {
            setReadiness(result.data);
        }
        setLoading(false);
    }, [loadAction]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- load coordinates server action state after mount.
        void load();
    }, [load]);

    const runPreflight = async () => {
        setChecking(true);
        setError(null);
        const result = await runAction();
        setChecking(false);
        if ("error" in result) {
            setError(result.error ?? "Platform Ask Dev readiness could not be checked.");
            toast.error("Platform Ask Dev preflight did not complete.");
            return;
        }
        setReadiness(result.data);
        toast.success("Platform Ask Dev preflight completed.");
    };

    if (loading) {
        return <DataState variant="loading" title="Loading platform Ask Dev readiness…" />;
    }

    if (!readiness) {
        return (
            <DataState
                variant="error"
                title="Platform Ask Dev readiness is unavailable"
                message={error ?? "The platform provider status could not be loaded."}
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

    return (
        <section
            aria-labelledby="platform-ask-dev-readiness-title"
            className="overflow-hidden rounded-(--radius-lg) border border-(--border) bg-(--surface-raised) shadow-(--elevation-card)"
        >
            <header className="relative overflow-hidden border-b border-(--border) px-6 py-6 sm:px-8">
                <div aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-(--accent)" />
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="max-w-2xl">
                        <p className="text-label-caps text-(--text-muted)">
                            Platform administration
                        </p>
                        <h2
                            id="platform-ask-dev-readiness-title"
                            className="mt-2 text-h1 text-(--text-primary)"
                        >
                            Ask Dev platform provider
                        </h2>
                        <p className="mt-2 text-body text-(--text-secondary)">
                            This is the operator-configured platform LLM provider shared as the
                            default and approved fallback across every organization&apos;s Ask Dev.
                            It is entirely independent of any organization&apos;s BYO-LLM
                            configuration — it never requires, reads, or reflects any
                            organization&apos;s BYO settings.
                        </p>
                    </div>
                    <div
                        role="status"
                        className="inline-flex items-center gap-2 self-start rounded-(--radius-pill) border border-(--border) bg-(--surface) px-3 py-1.5 text-sm font-medium text-(--text-primary)"
                    >
                        <span
                            aria-hidden="true"
                            className={`h-2.5 w-2.5 rounded-full ${READINESS_TONES[readiness.readiness]}`}
                        />
                        {READINESS_LABELS[readiness.readiness]}
                    </div>
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

            <div className="px-6 py-6 sm:px-8">
                <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.7fr)]">
                    <div>
                        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
                            <div>
                                <dt className="text-label-caps text-(--text-muted)">Provider</dt>
                                <dd className="mt-1 text-body text-(--text-primary)">
                                    {readiness.provider_label ?? "Not configured"}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-label-caps text-(--text-muted)">Model</dt>
                                <dd className="mt-1 text-body text-(--text-primary)">
                                    {readiness.model_label ?? "Not configured"}
                                </dd>
                            </div>
                        </dl>
                        {readiness.safe_remediation ? (
                            <p className="mt-4 border-l-2 border-(--caution) pl-3 text-sm text-(--text-secondary)">
                                {readiness.safe_remediation}
                            </p>
                        ) : null}
                    </div>
                    <div className="flex flex-col justify-between gap-4 border-l border-(--border) pl-0 lg:pl-6">
                        <div>
                            <p className="text-label-caps text-(--text-muted)">Last preflight</p>
                            <p className="mt-1 text-sm text-(--text-primary)">
                                {formatCheckedAt(readiness.readiness_checked_at)}
                            </p>
                            <p className="mt-1 text-xs text-(--text-muted)">
                                Uses synthetic data only. Never reads or requires any
                                organization&apos;s BYO-LLM configuration.
                            </p>
                        </div>
                        <button
                            type="button"
                            disabled={checking}
                            onClick={() => void runPreflight()}
                            className="self-start rounded-md border border-(--border) bg-(--surface) px-4 py-2 text-sm font-semibold text-(--text-primary) transition-colors hover:border-(--accent) disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {checking ? "Checking…" : CTA_LABELS.runPlatformPreflight}
                        </button>
                    </div>
                </div>
            </div>
        </section>
    );
}
