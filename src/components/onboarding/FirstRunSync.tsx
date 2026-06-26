"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { DataState } from "@/components/ui/DataState";
import { CTA_LABELS } from "@/lib/design/cta";
import {
    GITHUB_INTEGRATION_PATH,
    connectGitHubHref,
} from "@/lib/onboarding/setupSurface";
import { emitOnboardingEvent } from "@/lib/onboarding/telemetry";
import type { SetupStatus } from "@/lib/onboarding/types";

/** Result of a returning install callback, surfaced on the sync surface. */
export type GithubAppArrival = "connected" | "error";

type FirstRunSyncProps = {
    /** C2 setup status driving the sync surface. */
    status: SetupStatus;
    /** `?github_app` indicator from the return-aware callback redirect. */
    arrival?: GithubAppArrival;
    /** Effective org id, attached to funnel events when present. */
    orgId?: string | null;
};

type SyncPhase =
    | "connect"
    | "select-repos"
    | "ready-to-sync"
    | "syncing"
    | "failed"
    | "complete";

function derivePhase(status: SetupStatus, locallyStarted: boolean): SyncPhase {
    if (status.sync_status === "failed") return "failed";
    if (status.sync_status === "complete") return "complete";
    if (!status.has_integration) return "connect";
    if (status.sync_status === "running" || status.sync_status === "partial") return "syncing";
    if (locallyStarted || status.first_sync_started) return "syncing";
    if (status.next_action === "select_repositories") return "select-repos";
    return "ready-to-sync";
}

const PANEL_CLASS =
    "flex flex-col gap-4 rounded-3xl border border-(--card-stroke) bg-(--card-80) p-6";
const PRIMARY_CTA_CLASS =
    "inline-flex items-center justify-center rounded-full bg-(--accent-2) px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.2em] text-(--ink-inverted) transition hover:bg-(--accent-2)/90 disabled:opacity-60";
const SECONDARY_CTA_CLASS =
    "inline-flex items-center justify-center rounded-full border border-(--accent-2)/40 bg-(--accent-2)/10 px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.2em] text-(--accent-2) transition hover:bg-(--accent-2)/20";

/**
 * CHAOS-2681 first-run sync surface. After the GitHub App connects, this routes
 * the user toward an actual sync (repo selection → start sync) instead of a
 * dead credential page, and reflects the C2 sync lifecycle (pending → running →
 * complete, or a recoverable failure). The first sync only starts after an
 * explicit confirmation click. Owns the dashboard-adjacent funnel emits:
 * `github_app_connected` (on arrival), `first_sync_started` (on confirm), and
 * `onboarding_completed` (on completion).
 */
export function FirstRunSync({ status, arrival, orgId }: FirstRunSyncProps) {
    const [started, setStarted] = useState(false);
    const phase = derivePhase(status, started);
    const identity = { orgId: orgId ?? null };

    const arrivalEmitted = useRef(false);
    useEffect(() => {
        if (arrival === "connected" && !arrivalEmitted.current) {
            arrivalEmitted.current = true;
            emitOnboardingEvent("github_app_connected", identity);
        }
        // identity is derived from the stable orgId prop.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [arrival, orgId]);

    const completeEmitted = useRef(false);
    useEffect(() => {
        if (phase === "complete" && !completeEmitted.current) {
            completeEmitted.current = true;
            emitOnboardingEvent("onboarding_completed", identity);
        }
        // identity is derived from the stable orgId prop.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phase, orgId]);

    const handleStartSync = useCallback(() => {
        // Explicit user confirmation is the only trigger for first_sync_started.
        emitOnboardingEvent("first_sync_started", { orgId: orgId ?? null });
        setStarted(true);
    }, [orgId]);

    if (arrival === "error") {
        return (
            <div className={PANEL_CLASS} data-testid="first-run-sync" data-phase="connect-error">
                <DataState
                    variant="error"
                    title="GitHub App didn’t connect"
                    message="We couldn’t finish connecting the GitHub App. You can try again — your progress is preserved."
                    action={
                        <Link href={connectGitHubHref()} className={PRIMARY_CTA_CLASS}>
                            {CTA_LABELS.connectGitHubApp}
                        </Link>
                    }
                    data-testid="first-run-sync-error"
                />
            </div>
        );
    }

    if (phase === "connect") {
        return (
            <div className={PANEL_CLASS} data-testid="first-run-sync" data-phase={phase}>
                <Header
                    title="Connect GitHub to start syncing"
                    description="Connect the GitHub App to choose repositories and run your first sync."
                />
                <div>
                    <Link href={connectGitHubHref()} className={PRIMARY_CTA_CLASS}>
                        {CTA_LABELS.connectGitHubApp}
                    </Link>
                </div>
            </div>
        );
    }

    if (phase === "select-repos") {
        return (
            <div className={PANEL_CLASS} data-testid="first-run-sync" data-phase={phase}>
                <Header
                    title="Choose repositories to sync"
                    description="Pick the repositories Dev Health should analyze. You can change this later."
                />
                <div>
                    <Link href={GITHUB_INTEGRATION_PATH} className={PRIMARY_CTA_CLASS}>
                        {CTA_LABELS.selectRepositories}
                    </Link>
                </div>
            </div>
        );
    }

    if (phase === "ready-to-sync") {
        const repoNote =
            status.selected_repositories_count > 0
                ? `${status.selected_repositories_count} repositories selected.`
                : "Your installation is ready.";
        return (
            <div className={PANEL_CLASS} data-testid="first-run-sync" data-phase={phase}>
                <Header
                    title="Start your first sync"
                    description={`${repoNote} Start the first sync to populate your dashboard.`}
                />
                <div className="flex flex-wrap gap-3">
                    <button
                        type="button"
                        onClick={handleStartSync}
                        className={PRIMARY_CTA_CLASS}
                        data-testid="first-run-sync-start"
                    >
                        {CTA_LABELS.startSync}
                    </button>
                    <Link href={GITHUB_INTEGRATION_PATH} className={SECONDARY_CTA_CLASS}>
                        {CTA_LABELS.selectRepositories}
                    </Link>
                </div>
            </div>
        );
    }

    if (phase === "syncing") {
        return (
            <div
                className={PANEL_CLASS}
                role="status"
                aria-live="polite"
                data-testid="first-run-sync"
                data-phase={phase}
            >
                <Header
                    title="First sync in progress"
                    description="We’re syncing your repositories. This can take a few minutes — you can leave this page and check the dashboard later."
                />
                <Link href="/dashboard" className={SECONDARY_CTA_CLASS}>
                    {CTA_LABELS.backToCockpit}
                </Link>
            </div>
        );
    }

    if (phase === "failed") {
        const message =
            status.blocker ??
            status.last_sync_error ??
            "The first sync didn’t complete. Retry to continue — your setup is preserved.";
        return (
            <div className={PANEL_CLASS} data-testid="first-run-sync" data-phase={phase}>
                <DataState
                    variant="error"
                    title="First sync could not complete"
                    message={message}
                    action={
                        <button
                            type="button"
                            onClick={handleStartSync}
                            className={PRIMARY_CTA_CLASS}
                            data-testid="first-run-sync-retry"
                        >
                            {CTA_LABELS.retry}
                        </button>
                    }
                    data-testid="first-run-sync-error"
                />
            </div>
        );
    }

    // complete
    return (
        <div className={PANEL_CLASS} data-testid="first-run-sync" data-phase={phase}>
            <Header
                title="You’re all set"
                description="Your first sync finished. Your dashboard now reflects your team’s activity."
            />
            <Link href="/dashboard" className={PRIMARY_CTA_CLASS}>
                {CTA_LABELS.backToCockpit}
            </Link>
        </div>
    );
}

function Header({ title, description }: { title: string; description: string }) {
    return (
        <div>
            <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">First-run setup</p>
            <h2 className="mt-1 font-(--font-display) text-xl font-semibold text-foreground">
                {title}
            </h2>
            <p className="mt-2 max-w-xl text-sm text-(--ink-muted)">{description}</p>
        </div>
    );
}
