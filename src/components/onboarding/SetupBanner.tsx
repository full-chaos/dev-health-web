"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

import { CockpitEmptyState } from "@/components/home/CockpitEmptyState";
import { DataState } from "@/components/ui/DataState";
import {
    deriveSetupSurface,
    setupSurfaceCta,
    type SetupSurfaceVariant,
} from "@/lib/onboarding/setupSurface";
import { emitOnboardingEvent } from "@/lib/onboarding/telemetry";
import type { SetupNextAction, SetupStatus } from "@/lib/onboarding/types";

type SetupBannerProps = {
    /** C2 setup status that drives the surface. */
    status: SetupStatus;
    /** Effective org id, attached to the funnel event when present. */
    orgId?: string | null;
};

const PENDING_DESCRIPTION: Record<SetupNextAction, string> = {
    connect_integration: "Finish connecting your integration to start your first sync.",
    select_repositories: "Choose which repositories to sync to populate your dashboard.",
    create_sync_config: "Finish configuring the sync to populate your dashboard.",
    start_sync: "Start your first sync to populate your dashboard.",
    complete: "Your first sync is finishing up.",
};

const CTA_CLASS =
    "inline-flex items-center justify-center rounded-full border border-(--accent-2)/40 bg-(--accent-2)/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-(--accent-2) transition hover:bg-(--accent-2)/20";

/**
 * CHAOS-2678 dashboard setup-aware surface. Renders a precise, trust-preserving
 * prompt for each C2 state (no integration → setup empty state; connected but
 * unsynced → distinct sync-pending banner; failed → precise blocker; skipped →
 * non-blocking banner) and nothing once the org is fully set up. Emits the
 * dashboard-surface funnel event when there is no integration.
 */
export function SetupBanner({ status, orgId }: SetupBannerProps) {
    const variant: SetupSurfaceVariant = deriveSetupSurface(status);
    const cta = setupSurfaceCta(status);
    const emitted = useRef(false);

    useEffect(() => {
        if (variant === "no-integration" && !emitted.current) {
            emitted.current = true;
            emitOnboardingEvent("dashboard_viewed_without_integration", { orgId: orgId ?? null });
        }
    }, [variant, orgId]);

    if (variant === "ready") {
        return null;
    }

    const ctaLink = cta ? (
        <Link href={cta.href} className={CTA_CLASS} data-testid="setup-banner-cta">
            {cta.label}
        </Link>
    ) : null;

    if (variant === "no-integration") {
        return (
            <section aria-label="Setup status" data-testid="setup-banner" data-variant={variant}>
                <CockpitEmptyState
                    variant="no-data-connected"
                    title="Connect a source to begin"
                    description="Dev Health needs a connected integration before it can surface anything. Connect GitHub to start your first sync."
                    action={ctaLink}
                    data-testid="setup-banner-empty"
                />
            </section>
        );
    }

    if (variant === "sync-failed") {
        const message =
            status.blocker ??
            status.last_sync_error ??
            "The last sync did not complete. Retry to continue — your setup is preserved.";
        return (
            <section aria-label="Setup status" data-testid="setup-banner" data-variant={variant}>
                <DataState
                    variant="error"
                    title="Sync could not complete"
                    message={message}
                    action={ctaLink}
                    data-testid="setup-banner-error"
                />
            </section>
        );
    }

    const isSkipped = variant === "skipped";
    const title = isSkipped ? "Integration setup skipped" : "GitHub connected — first sync pending";
    const description = isSkipped
        ? "You skipped connecting an integration during setup. Connect GitHub anytime to start seeing your team's signals."
        : PENDING_DESCRIPTION[status.next_action];

    return (
        <section
            role="status"
            aria-label="Setup status"
            data-testid="setup-banner"
            data-variant={variant}
            className="flex flex-col gap-3 rounded-3xl border border-(--card-stroke) bg-(--card-80) p-5 sm:flex-row sm:items-center sm:justify-between"
        >
            <div>
                <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">Setup</p>
                <p className="mt-1 font-(--font-display) text-lg font-semibold text-foreground">
                    {title}
                </p>
                <p className="mt-1 max-w-xl text-sm text-(--ink-muted)">{description}</p>
            </div>
            {ctaLink}
        </section>
    );
}
