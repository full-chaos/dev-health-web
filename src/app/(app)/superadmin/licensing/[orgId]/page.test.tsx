import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, userEvent } from "@/test/utils";
import type {
    FeatureFlag,
    FeatureOverride,
    Organization,
    OrgEntitlements,
} from "@/lib/admin/types";

const {
    getOrganizationMock,
    getOrgEntitlementsMock,
    listFeatureOverridesMock,
    listFeatureFlagsMock,
} = vi.hoisted(() => ({
    getOrganizationMock: vi.fn(),
    getOrgEntitlementsMock: vi.fn(),
    listFeatureOverridesMock: vi.fn(),
    listFeatureFlagsMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("@/lib/admin/server", () => ({
    getOrganization: getOrganizationMock,
    getOrgEntitlements: getOrgEntitlementsMock,
    listFeatureOverrides: listFeatureOverridesMock,
    listFeatureFlags: listFeatureFlagsMock,
    createFeatureOverride: vi.fn(),
    deleteFeatureOverride: vi.fn(),
}));

import LicensingDetailPage from "./page";

const organization: Organization = {
    id: "org-1",
    name: "Example Org",
    slug: "example-org",
    description: null,
    tier: "enterprise",
    is_active: true,
    settings: {},
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
};

const entitlements: OrgEntitlements = {
    org_id: "org-1",
    tier: "enterprise",
    licensed_users: null,
    licensed_repos: null,
    features: { ask_dev: false, ask_dev_contextual_entrypoints: false },
    features_override: null,
    limits_override: null,
    expires_at: null,
    is_valid: true,
    limits: {},
};

function featureFlag(id: string, key: string, name: string): FeatureFlag {
    return {
        id,
        key,
        name,
        description: null,
        category: "ai",
        min_tier: "enterprise",
        is_enabled: true,
        is_beta: true,
        is_deprecated: false,
        created_at: "2026-01-01T00:00:00Z",
    };
}

const existingOverride: FeatureOverride = {
    id: "override-1",
    org_id: "org-1",
    feature_id: "feature-existing",
    feature_key: "existing_feature",
    is_enabled: true,
    expires_at: null,
    config: null,
    reason: "Existing access",
    created_by: "admin-1",
    created_at: "2026-01-01T00:00:00Z",
};

describe("LicensingDetailPage feature override catalog", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getOrganizationMock.mockResolvedValue({ data: organization });
        getOrgEntitlementsMock.mockResolvedValue({ data: entitlements });
        listFeatureOverridesMock.mockResolvedValue({ data: [existingOverride] });
        listFeatureFlagsMock.mockResolvedValue({ data: [] });
    });

    it("offers Ask Dev flags returned by listFeatureFlags as override options", async () => {
        listFeatureFlagsMock.mockResolvedValue({
            data: [
                featureFlag("feature-ask-dev", "ask_dev", "Ask Dev"),
                featureFlag(
                    "feature-ask-dev-contextual",
                    "ask_dev_contextual_entrypoints",
                    "Ask Dev contextual entrypoints",
                ),
            ],
        });

        render(await LicensingDetailPage({ params: Promise.resolve({ orgId: "org-1" }) }));
        await userEvent.click(screen.getByRole("button", { name: "Add Override" }));

        expect(listFeatureFlagsMock).toHaveBeenCalledOnce();
        expect(screen.getByRole("option", { name: "ask_dev (Ask Dev)" })).toHaveValue(
            "feature-ask-dev",
        );
        expect(
            screen.getByRole("option", {
                name: "ask_dev_contextual_entrypoints (Ask Dev contextual entrypoints)",
            }),
        ).toHaveValue("feature-ask-dev-contextual");
    });

    it("shows a safe error and keeps existing overrides visible when the catalog fails", async () => {
        listFeatureFlagsMock.mockResolvedValue({ error: "upstream token=secret failed" });

        render(await LicensingDetailPage({ params: Promise.resolve({ orgId: "org-1" }) }));

        expect(screen.getByRole("alert")).toHaveTextContent("Feature catalog unavailable");
        expect(screen.getByRole("alert")).not.toHaveTextContent("token=secret");
        expect(screen.getByRole("button", { name: "Add Override" })).toBeDisabled();
        expect(screen.getByText("existing_feature")).toBeVisible();
        expect(screen.getByText("Existing access")).toBeVisible();
    });
});
