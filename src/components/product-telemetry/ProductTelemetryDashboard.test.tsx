import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@/test/utils";

const chartProps = vi.hoisted(() => ({ data: [] as Array<{ day: string; value: number | null }> }));

vi.mock("@/components/charts/TimeseriesChart", () => ({
    TimeseriesChart: (props: { data: Array<{ day: string; value: number | null }> }) => {
        chartProps.data = props.data;
        return <div data-testid="timeseries" />;
    },
}));

import { ProductTelemetryDashboard } from "./ProductTelemetryDashboard";
import type { ProductTelemetryDashboardData } from "@/lib/graphql/productTelemetryFetchers";

const sampleDashboard: ProductTelemetryDashboardData = {
    dailyActiveUsers: [{ day: "2026-05-24", activeAnonymousUsers: 7 }],
    topRoutes: [{ routePattern: "/metrics", events: 9, sessions: 3, anonymousUsers: 2 }],
    featureViews: [
        {
            feature: "investment",
            surface: "dashboard",
            views: 5,
            anonymousUsers: 2,
        },
    ],
    filterChanges: [{ view: "metrics", filterKey: "team", changes: 4, avgValueCount: 1.5 }],
    chartInteractions: [
        {
            chart: "quadrant",
            action: "hover",
            surface: "metrics",
            interactions: 8,
            sessions: 2,
        },
    ],
    clientErrors: [
        {
            routePattern: "/metrics",
            boundary: "chart",
            errorClass: "RenderError",
            errors: 2,
            affectedAnonymousUsers: 1,
        },
    ],
    sessionSummary: {
        p50DurationMs: 1000,
        p75DurationMs: 1500,
        p90DurationMs: 2500,
        p95DurationMs: 3000,
        avgPagesViewed: 4,
        avgInteractions: 11,
    },
};

describe("ProductTelemetryDashboard", () => {
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

    it("renders the product telemetry sections", () => {
        render(
            <ProductTelemetryDashboard
                dashboard={sampleDashboard}
                startDate="2026-05-01"
                endDate="2026-05-25"
            />,
        );

        expect(
            screen.getByRole("heading", { name: "Daily active anonymous users" }),
        ).toBeInTheDocument();
        expect(screen.getAllByText("/metrics")).toHaveLength(2);
        expect(screen.getByText("investment")).toBeInTheDocument();
        expect(screen.getByText("team")).toBeInTheDocument();
        expect(screen.getByText("quadrant")).toBeInTheDocument();
        expect(screen.getByText("RenderError")).toBeInTheDocument();
        expect(screen.getByText("3.0s")).toBeInTheDocument();
    });

    it("renders empty states when no product telemetry rows are available", () => {
        render(
            <ProductTelemetryDashboard
                dashboard={{
                    dailyActiveUsers: [],
                    topRoutes: [],
                    featureViews: [],
                    filterChanges: [],
                    chartInteractions: [],
                    clientErrors: [],
                    sessionSummary: {},
                }}
                startDate="2026-05-01"
                endDate="2026-05-25"
            />,
        );

        expect(screen.getAllByText("No product telemetry events in this window.")).toHaveLength(1);
        for (const kind of [
            "page_viewed",
            "feature_viewed",
            "filter_changed",
            "chart_interacted",
            "client_error",
        ]) {
            expect(
                screen.getByText(`No ${kind} events recorded in this window.`),
            ).toBeInTheDocument();
        }
        // Each empty feed adopts the shared DataState taxonomy (CHAOS-2061).
        expect(screen.getAllByText("Enabled but no findings")).toHaveLength(6);
    });

    it("says what each tile counts, naming the day of the latest-day tile", () => {
        render(
            <ProductTelemetryDashboard
                dashboard={{
                    ...sampleDashboard,
                    dailyActiveUsers: [
                        { day: "2026-05-24", activeAnonymousUsers: 7 },
                        { day: "2026-05-10", activeAnonymousUsers: 3 },
                    ],
                }}
                startDate="2026-05-01"
                endDate="2026-05-25"
            />,
        );

        expect(screen.getByText("Anonymous users, latest day")).toBeInTheDocument();
        expect(
            screen.getByText("Distinct anonymous users on 2026-05-24, the latest day with events"),
        ).toBeInTheDocument();
        expect(
            screen.getByText("Page-view events in the top 25 route patterns"),
        ).toBeInTheDocument();
    });

    it("plots the whole window and leaves days without rows as gaps", () => {
        render(
            <ProductTelemetryDashboard
                dashboard={{
                    ...sampleDashboard,
                    dailyActiveUsers: [
                        { day: "2026-05-24", activeAnonymousUsers: 7 },
                        { day: "2026-05-10", activeAnonymousUsers: 3 },
                    ],
                }}
                startDate="2026-05-01"
                endDate="2026-05-25"
            />,
        );

        expect(chartProps.data).toHaveLength(24);
        expect(chartProps.data.filter((p) => p.value !== null).map((p) => p.day)).toEqual([
            "2026-05-10",
            "2026-05-24",
        ]);
    });
});
