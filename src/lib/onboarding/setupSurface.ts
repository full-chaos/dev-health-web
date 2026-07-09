/**
 * CHAOS-2678 dashboard setup-surface derivation (consumes C2 `SetupStatus`).
 *
 * Pure, deterministic mapping from the C2 contract to the dashboard's
 * setup-aware surface variant and its single canonical call-to-action. Kept
 * UI-free so the banner, the first-run sync page, and unit tests all agree on
 * one source of truth. No UX-time recomputation of categories/edges — this only
 * routes the already-persisted setup lifecycle to the right prompt.
 */
import { CTA_LABELS } from "@/lib/design/cta";

import type { SetupStatus } from "./types";

/** Distinct dashboard surfaces. `ready` renders nothing (fully set up). */
export type SetupSurfaceVariant =
    "no-integration" | "skipped" | "sync-pending" | "sync-failed" | "ready";

export const GITHUB_INTEGRATION_PATH = "/org/admin/integrations/github";
export const FIRST_RUN_SYNC_PATH = "/org/admin/integrations/github/sync";
export const GITHUB_APP_INSTALL_PATH = "/org/admin/integrations/github-app/install";
export const SYNC_CONFIG_NEW_PATH = "/org/admin/sync/new";

/**
 * Build the return-aware GitHub App install href. The browser hits the Next
 * install route, which forwards `return_to` to the backend (C4); after connect
 * the user lands on the sync surface rather than a dead credential page.
 */
export function connectGitHubHref(returnTo: string = FIRST_RUN_SYNC_PATH): string {
    return `${GITHUB_APP_INSTALL_PATH}?return_to=${encodeURIComponent(returnTo)}`;
}

/**
 * Route to the actual repository/sync-config selection flow (CHAOS-2681).
 * Edits the existing sync config when one is present, otherwise starts the
 * new-config wizard — never the generic credential page.
 */
export function repoSelectionHref(syncConfigId: string | null): string {
    return syncConfigId ? `/org/admin/sync/${syncConfigId}/edit` : SYNC_CONFIG_NEW_PATH;
}

/**
 * Map a C2 `SetupStatus` to the dashboard surface variant.
 *
 * Precedence is deterministic: a failed sync always surfaces the blocker first;
 * otherwise a missing integration is either an active prompt or a non-blocking
 * "skipped" banner (distinguished by `next_action`); a present integration is
 * pending only until the first sync has completed. Later in-flight syncs must
 * not reopen first-run setup copy.
 */
export function deriveSetupSurface(status: SetupStatus): SetupSurfaceVariant {
    if (!status.has_integration) {
        return status.next_action === "complete" ? "skipped" : "no-integration";
    }
    if (status.first_sync_completed || status.sync_status === "complete") {
        return "ready";
    }
    if (status.sync_status === "failed") {
        return "sync-failed";
    }
    return "sync-pending";
}

export type SetupSurfaceCta = {
    label: string;
    href: string;
};

/**
 * The single canonical CTA for a surface, or `null` when none is warranted
 * (`ready`). Labels come exclusively from the CTA registry.
 */
export function setupSurfaceCta(status: SetupStatus): SetupSurfaceCta | null {
    switch (deriveSetupSurface(status)) {
        case "no-integration":
        case "skipped":
            return { label: CTA_LABELS.connectGitHubApp, href: connectGitHubHref() };
        case "sync-pending":
            return {
                label:
                    status.next_action === "select_repositories"
                        ? CTA_LABELS.selectRepositories
                        : CTA_LABELS.continueSetup,
                href: FIRST_RUN_SYNC_PATH,
            };
        case "sync-failed":
            return { label: CTA_LABELS.retry, href: FIRST_RUN_SYNC_PATH };
        case "ready":
            return null;
    }
}
