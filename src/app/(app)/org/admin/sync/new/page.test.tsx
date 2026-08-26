import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@/test/utils";
import type { IntegrationCredential } from "@/lib/admin/types";

const listCredentials = vi.hoisted(() => vi.fn());
const getCanonicalIncidentIngestionEntitlement = vi.hoisted(() => vi.fn());
const getAutoImportCapabilities = vi.hoisted(() => vi.fn());

vi.mock("@/lib/admin/server", () => ({
    getCanonicalIncidentIngestionEntitlement,
    listCredentials,
    getAutoImportCapabilities,
}));

vi.mock("@/components/admin/sync/SyncConfigForm", () => ({
    SyncConfigForm: (props: {
        canCreatePagerDuty: boolean;
        credentials: readonly IntegrationCredential[];
        initialSelection?: unknown;
        autoImportCapabilities?: unknown;
    }) => (
        <div
            data-can-create-pagerduty={String(props.canCreatePagerDuty)}
            data-credential-count={props.credentials.length}
            data-has-initial-selection={String("initialSelection" in props)}
            data-auto-import-capabilities={JSON.stringify(props.autoImportCapabilities)}
            data-testid="sync-config-form"
        />
    ),
}));

import NewSyncConfigPage from "./page";

describe("NewSyncConfigPage", () => {
    it("uses the shared Sync Config form without PagerDuty credential preselection", async () => {
        listCredentials.mockResolvedValue({
            data: [
                {
                    id: "pagerduty-production",
                    provider: "pagerduty",
                    name: "Production",
                    is_active: true,
                    config: {},
                    last_test_at: null,
                    last_test_success: true,
                    last_test_error: null,
                    created_at: "2026-01-01T00:00:00Z",
                    updated_at: "2026-01-01T00:00:00Z",
                },
            ],
        });
        getCanonicalIncidentIngestionEntitlement.mockResolvedValue({ data: { enabled: true } });
        getAutoImportCapabilities.mockResolvedValue({ data: {} });

        render(await NewSyncConfigPage());

        expect(screen.getByTestId("sync-config-form")).toHaveAttribute(
            "data-can-create-pagerduty",
            "true",
        );
        expect(screen.getByTestId("sync-config-form")).toHaveAttribute(
            "data-credential-count",
            "1",
        );
        expect(screen.getByTestId("sync-config-form")).toHaveAttribute(
            "data-has-initial-selection",
            "false",
        );
    });

    it("passes null (not {}) to SyncConfigForm when the capability fetch fails", async () => {
        // CHAOS-4323 codex round: a fetch error must reach SyncConfigForm as
        // a distinct null sentinel, not collapse to {} -- see
        // SyncConfigForm.buildSyncOptions for why the distinction matters.
        listCredentials.mockResolvedValue({ data: [] });
        getCanonicalIncidentIngestionEntitlement.mockResolvedValue({ data: { enabled: false } });
        getAutoImportCapabilities.mockResolvedValue({ error: "backend unavailable" });

        render(await NewSyncConfigPage());

        expect(screen.getByTestId("sync-config-form")).toHaveAttribute(
            "data-auto-import-capabilities",
            "null",
        );
    });
});
