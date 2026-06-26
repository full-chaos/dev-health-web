import { describe, expect, it } from "vitest";

import { CTA_LABELS } from "@/lib/design/cta";

import {
    FIRST_RUN_SYNC_PATH,
    GITHUB_APP_INSTALL_PATH,
    SYNC_CONFIG_NEW_PATH,
    connectGitHubHref,
    repoSelectionHref,
    deriveSetupSurface,
    setupSurfaceCta,
} from "../setupSurface";
import type { SetupStatus } from "../types";

const baseStatus: SetupStatus = {
    has_integration: false,
    providers: [],
    has_sync_config: false,
    sync_config_id: null,
    first_sync_started: false,
    sync_status: "none",
    selected_repositories_count: 0,
    last_sync_error: null,
    can_start_sync: false,
    next_action: "connect_integration",
    blocker: null,
};

const status = (overrides: Partial<SetupStatus>): SetupStatus => ({
    ...baseStatus,
    ...overrides,
});

describe("deriveSetupSurface (CHAOS-2678, C2)", () => {
    it("maps no integration + connect_integration to no-integration", () => {
        expect(deriveSetupSurface(status({ next_action: "connect_integration" }))).toBe(
            "no-integration",
        );
    });

    it("maps no integration + complete (skipped onboarding) to skipped", () => {
        expect(
            deriveSetupSurface(status({ has_integration: false, next_action: "complete" })),
        ).toBe("skipped");
    });

    it("maps a connected integration without a finished sync to sync-pending", () => {
        expect(
            deriveSetupSurface(
                status({
                    has_integration: true,
                    providers: ["github"],
                    sync_status: "pending",
                    next_action: "start_sync",
                }),
            ),
        ).toBe("sync-pending");
    });

    it.each(["none", "pending", "running", "partial"] as const)(
        "treats connected + %s sync as sync-pending",
        (sync_status) => {
            expect(deriveSetupSurface(status({ has_integration: true, sync_status }))).toBe(
                "sync-pending",
            );
        },
    );

    it("maps a failed sync to sync-failed regardless of integration", () => {
        expect(
            deriveSetupSurface(
                status({ has_integration: true, sync_status: "failed", blocker: "boom" }),
            ),
        ).toBe("sync-failed");
    });

    it("maps a completed sync to ready", () => {
        expect(
            deriveSetupSurface(
                status({ has_integration: true, sync_status: "complete", next_action: "complete" }),
            ),
        ).toBe("ready");
    });
});

describe("connectGitHubHref", () => {
    it("routes the install through the sync surface by default", () => {
        expect(connectGitHubHref()).toBe(
            `${GITHUB_APP_INSTALL_PATH}?return_to=${encodeURIComponent(FIRST_RUN_SYNC_PATH)}`,
        );
    });

    it("encodes a custom return target", () => {
        expect(connectGitHubHref("/dashboard")).toBe(
            `${GITHUB_APP_INSTALL_PATH}?return_to=${encodeURIComponent("/dashboard")}`,
        );
    });
});

describe("setupSurfaceCta (CTA hrefs)", () => {
    it("no-integration → connect GitHub App via the return-aware install", () => {
        expect(setupSurfaceCta(status({ next_action: "connect_integration" }))).toEqual({
            label: CTA_LABELS.connectGitHubApp,
            href: connectGitHubHref(),
        });
    });

    it("skipped → connect GitHub App (non-blocking)", () => {
        expect(setupSurfaceCta(status({ next_action: "complete" }))).toEqual({
            label: CTA_LABELS.connectGitHubApp,
            href: connectGitHubHref(),
        });
    });

    it("sync-pending + select_repositories → Select repositories on the sync surface", () => {
        expect(
            setupSurfaceCta(
                status({
                    has_integration: true,
                    sync_status: "pending",
                    next_action: "select_repositories",
                }),
            ),
        ).toEqual({ label: CTA_LABELS.selectRepositories, href: FIRST_RUN_SYNC_PATH });
    });

    it("sync-pending + start_sync → Continue setup on the sync surface", () => {
        expect(
            setupSurfaceCta(
                status({
                    has_integration: true,
                    sync_status: "pending",
                    next_action: "start_sync",
                }),
            ),
        ).toEqual({ label: CTA_LABELS.continueSetup, href: FIRST_RUN_SYNC_PATH });
    });

    it("sync-failed → Retry on the sync surface", () => {
        expect(setupSurfaceCta(status({ has_integration: true, sync_status: "failed" }))).toEqual({
            label: CTA_LABELS.retry,
            href: FIRST_RUN_SYNC_PATH,
        });
    });

    it("ready → no CTA", () => {
        expect(
            setupSurfaceCta(status({ has_integration: true, sync_status: "complete" })),
        ).toBeNull();
    });
});

describe("repoSelectionHref (CHAOS-2681)", () => {
    it("edits the existing sync config when one is present", () => {
        expect(repoSelectionHref("sync-1")).toBe("/org/admin/sync/sync-1/edit");
    });

    it("starts the new-config wizard when there is no sync config", () => {
        expect(repoSelectionHref(null)).toBe(SYNC_CONFIG_NEW_PATH);
        expect(SYNC_CONFIG_NEW_PATH).toBe("/org/admin/sync/new");
    });
});
