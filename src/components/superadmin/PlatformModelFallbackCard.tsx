"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import { CTA_LABELS } from "@/lib/design/cta";
import { grantPlatformModelFallback, revokePlatformModelFallback } from "@/lib/admin/server";

export const PLATFORM_MODEL_FALLBACK_SCOPE_TEXT =
    "It takes effect only while the ACR service model is on for this org; an org with it off is still refused.";

export const PLATFORM_MODEL_FALLBACK_COST_TEXT =
    "Granting this means the platform pays for this org's AI calls when it has no saved model config.";

type PlatformModelFallbackCardProps = {
    orgId: string;
    granted: boolean;
    isPlatformAdmin: boolean;
};

export function PlatformModelFallbackCard({
    orgId,
    granted,
    isPlatformAdmin,
}: PlatformModelFallbackCardProps) {
    const [busy, setBusy] = useState(false);

    if (!isPlatformAdmin) return null;

    const run = async (
        action: typeof grantPlatformModelFallback,
        failure: string,
    ): Promise<void> => {
        setBusy(true);
        try {
            const { data, error } = await action(orgId);
            if (error || !data) {
                toast.error(`${failure}: ${error ?? "no result"}`);
            } else {
                toast.success(data.notice);
            }
        } catch {
            toast.error("An unexpected error occurred");
        } finally {
            setBusy(false);
        }
    };

    const handleGrant = () => {
        if (!confirm(PLATFORM_MODEL_FALLBACK_COST_TEXT)) return;
        void run(grantPlatformModelFallback, "Failed to grant");
    };

    return (
        <section
            aria-labelledby="platform-model-fallback-heading"
            className="rounded-2xl border border-(--card-stroke) bg-(--card-80) p-6"
        >
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h3 id="platform-model-fallback-heading" className="text-lg font-medium">
                        Platform model fallback
                    </h3>
                    <p className="mt-1 text-sm text-(--ink-muted)">
                        Only a platform admin can grant or revoke this for an org.
                    </p>
                    <p className="mt-2 text-sm">{PLATFORM_MODEL_FALLBACK_COST_TEXT}</p>
                    <p className="mt-1 text-sm text-(--ink-muted)">
                        {PLATFORM_MODEL_FALLBACK_SCOPE_TEXT}
                    </p>
                </div>
                <span
                    className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        granted
                            ? "bg-(--positive)/12 text-(--positive)"
                            : "bg-(--negative)/12 text-(--negative)"
                    }`}
                >
                    {granted ? "Granted" : "Not granted"}
                </span>
            </div>
            <div className="mt-4 flex gap-2">
                <button
                    type="button"
                    onClick={handleGrant}
                    disabled={busy || granted}
                    className="rounded-lg bg-(--accent) px-3 py-1.5 text-sm font-medium text-white hover:bg-(--accent)/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {CTA_LABELS.grantPlatformModelFallback}
                </button>
                <button
                    type="button"
                    onClick={() => void run(revokePlatformModelFallback, "Failed to revoke")}
                    disabled={busy || !granted}
                    className="rounded-lg border border-(--card-stroke) px-3 py-1.5 text-sm font-medium text-(--negative) hover:bg-(--card-70) disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {CTA_LABELS.revokePlatformModelFallback}
                </button>
            </div>
        </section>
    );
}
