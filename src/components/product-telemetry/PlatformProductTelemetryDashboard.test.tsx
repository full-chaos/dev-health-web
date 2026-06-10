import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@/test/utils";

import { PlatformProductTelemetryDashboard } from "./PlatformProductTelemetryDashboard";
import type { ProductTelemetryPlatformDashboardData } from "@/lib/graphql/productTelemetryFetchers";

const startDate = "2026-05-01";
const endDate = "2026-05-25";

const baseDashboard: ProductTelemetryPlatformDashboardData = {
    dailyActiveUsers: [{ day: "2026-05-24", activeAnonymousUsers: 7 }],
    topRoutes: [],
    featureViews: [],
    filterChanges: [],
    chartInteractions: [],
    clientErrors: [],
    sessionSummary: {},
    totals: {
        activeOrgs: 7,
        anonymousUsers: 320,
        sessions: 1100,
        events: 15000,
    },
    topOrgs: [],
};

describe("PlatformProductTelemetryDashboard", () => {
    beforeEach(() => {
        Object.defineProperty(window, "matchMedia", {
            writable: true,
            value: vi.fn().mockImplementation((query: string) => ({
                matches: false,
                media: query,
                onchange: null,
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                dispatchEvent: vi.fn(),
            })),
        });
        global.ResizeObserver = class ResizeObserver {
            observe = vi.fn();
            unobserve = vi.fn();
            disconnect = vi.fn();
        };
    });

    it("renders the four totals stat cards", () => {
        render(
            <PlatformProductTelemetryDashboard
                dashboard={baseDashboard}
                startDate={startDate}
                endDate={endDate}
            />,
        );

        const expectStat = (label: string, value: string) => {
            const card = screen.getByText(label).closest("div");
            expect(card).not.toBeNull();
            expect(within(card as HTMLElement).getByText(value)).toBeInTheDocument();
        };

        expectStat("Active orgs", "7");
        expectStat("Anonymous users", "320");
        expectStat("Sessions", "1,100");
        expectStat("Events", "15,000");
    });

    it("renders top-orgs table rows with drilldown links for resolved orgs", () => {
        const orgId = "org_acme_123";
        const orgIdHash = "unresolved_org_hash_abcdef1234567890";

        render(
            <PlatformProductTelemetryDashboard
                dashboard={{
                    ...baseDashboard,
                    topOrgs: [
                        {
                            orgId,
                            orgName: "Acme Corp",
                            orgIdHash: "resolved_hash_1234567890abcdef",
                            events: 250,
                            sessions: 40,
                            anonymousUsers: 22,
                        },
                        {
                            orgIdHash,
                            events: 180,
                            sessions: 33,
                            anonymousUsers: 11,
                        },
                    ],
                }}
                startDate={startDate}
                endDate={endDate}
            />,
        );

        expect(screen.getByRole("link", { name: "Acme Corp" })).toHaveAttribute(
            "href",
            `/superadmin/product-telemetry/${orgId}?startDate=${startDate}&endDate=${endDate}`,
        );

        const hashLabel = `${orgIdHash.slice(0, 12)}…`;
        expect(screen.getByText(hashLabel)).toBeInTheDocument();
        expect(screen.queryByRole("link", { name: hashLabel })).toBeNull();
    });

    it("renders an empty state when no top orgs exist", () => {
        render(
            <PlatformProductTelemetryDashboard
                dashboard={baseDashboard}
                startDate={startDate}
                endDate={endDate}
            />,
        );

        expect(
            screen.getByText("No orgs reported product telemetry in this window."),
        ).toBeInTheDocument();
    });

    it("delegates section payloads to the embedded per-org dashboard", () => {
        render(
            <PlatformProductTelemetryDashboard
                dashboard={{
                    ...baseDashboard,
                    topRoutes: [
                        {
                            routePattern: "/metrics",
                            events: 90,
                            sessions: 33,
                            anonymousUsers: 25,
                        },
                    ],
                }}
                startDate={startDate}
                endDate={endDate}
            />,
        );

        expect(screen.getAllByText("/metrics").length).toBeGreaterThan(0);
    });
});
