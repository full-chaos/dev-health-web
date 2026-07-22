import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@/test/utils";
import type { IntegrationCredential } from "@/lib/admin/types";

const listCredentials = vi.hoisted(() => vi.fn());
const getCanonicalIncidentIngestionEntitlement = vi.hoisted(() => vi.fn());

vi.mock("@/lib/admin/server", () => ({
    getCanonicalIncidentIngestionEntitlement,
    listCredentials,
}));

vi.mock("@/components/admin/sync/SyncConfigForm", () => ({
    SyncConfigForm: (props: {
        canCreatePagerDuty: boolean;
        credentials: readonly IntegrationCredential[];
        initialSelection?: unknown;
    }) => (
        <div
            data-can-create-pagerduty={String(props.canCreatePagerDuty)}
            data-credential-count={props.credentials.length}
            data-has-initial-selection={String("initialSelection" in props)}
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
});
