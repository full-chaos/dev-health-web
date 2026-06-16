/**
 * UpgradeGate component tests (CHAOS-1240).
 *
 * Locks in the render-gate contract: children render when the required feature
 * is present, otherwise the upgrade CTA overlay renders with tier label,
 * description, and link to /org/admin/settings.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithToaster, screen, cleanup } from "@/test/utils";
import { UpgradeGate } from "./UpgradeGate";

vi.mock("@/components/admin/AdminTierContext", () => ({
    useAdminTier: () => ({
        tier: "community",
        features: {},
        minSyncIntervalHours: 24,
        limits: {},
    }),
}));

describe("UpgradeGate", () => {
    afterEach(() => cleanup());

    it("renders children directly when the required feature is enabled", () => {
        renderWithToaster(
            <UpgradeGate
                feature="advanced_insights"
                requiredTier="team"
                features={{ advanced_insights: true }}
            >
                <p>Secret feature content</p>
            </UpgradeGate>,
        );

        expect(screen.getByText("Secret feature content")).toBeInTheDocument();
        expect(screen.queryByRole("link", { name: /upgrade to team/i })).not.toBeInTheDocument();
    });

    it("renders capacity planning content for the canonical capacity forecast entitlement", () => {
        renderWithToaster(
            <UpgradeGate
                feature="capacity_forecast"
                requiredTier="team"
                features={{ capacity_forecast: true }}
            >
                <p>Monte Carlo forecast</p>
            </UpgradeGate>,
        );

        expect(screen.getByText("Monte Carlo forecast")).toBeInTheDocument();
        expect(screen.queryByRole("link", { name: /upgrade to team/i })).not.toBeInTheDocument();
    });

    it("renders the upgrade CTA overlay when the feature is missing", () => {
        renderWithToaster(
            <UpgradeGate
                feature="advanced_insights"
                requiredTier="team"
                features={{ advanced_insights: false }}
            >
                <p>Secret feature content</p>
            </UpgradeGate>,
        );

        expect(screen.getByText(/team plan feature/i)).toBeInTheDocument();
        expect(
            screen.getByRole("heading", { name: /unlock advanced insights/i }),
        ).toBeInTheDocument();
        expect(
            screen.getByText(/Unlock advanced insights, team-level metrics/i),
        ).toBeInTheDocument();
    });

    it("renders a link to /org/admin/settings with the required tier label", () => {
        renderWithToaster(
            <UpgradeGate feature="sso" requiredTier="enterprise" features={{ sso: false }}>
                <p>SSO settings</p>
            </UpgradeGate>,
        );

        const link = screen.getByRole("link", { name: /upgrade to enterprise/i });
        expect(link).toHaveAttribute("href", "/org/admin/settings");
    });

    it("falls back to a generic description when the required tier has no TIER_FEATURES entry", () => {
        renderWithToaster(
            <UpgradeGate
                feature="some_feature"
                requiredTier="phantom"
                features={{ some_feature: false }}
            >
                <p>child</p>
            </UpgradeGate>,
        );

        expect(screen.getByText(/Upgrade to unlock this feature/i)).toBeInTheDocument();
    });

    it("uses context features when the features prop is omitted (gated path)", () => {
        renderWithToaster(
            <UpgradeGate feature="advanced_insights" requiredTier="team">
                <p>hidden</p>
            </UpgradeGate>,
        );

        expect(
            screen.getByRole("heading", { name: /unlock advanced insights/i }),
        ).toBeInTheDocument();
    });

    it("renders the current plan tier from context", () => {
        renderWithToaster(
            <UpgradeGate
                feature="advanced_insights"
                requiredTier="team"
                features={{ advanced_insights: false }}
            >
                <p>hidden</p>
            </UpgradeGate>,
        );

        expect(screen.getByText(/current plan/i)).toBeInTheDocument();
        expect(screen.getByText("community")).toBeInTheDocument();
    });

    it("prefers an explicit current tier over context for standalone gates", () => {
        renderWithToaster(
            <UpgradeGate
                feature="advanced_insights"
                requiredTier="team"
                currentTier="enterprise"
                features={{ advanced_insights: false }}
            >
                <p>hidden</p>
            </UpgradeGate>,
        );

        expect(screen.getByText(/current plan/i)).toBeInTheDocument();
        expect(screen.getByText("enterprise")).toBeInTheDocument();
    });
});
