import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@/test/utils";

import { ProductTelemetryDashboard } from "./ProductTelemetryDashboard";
import type { ProductTelemetryDashboardData } from "@/lib/graphql/productTelemetryFetchers";

const sampleDashboard: ProductTelemetryDashboardData = {
	dailyActiveUsers: [{ day: "2026-05-24", activeAnonymousUsers: 7 }],
	topRoutes: [
		{ routePattern: "/metrics", events: 9, sessions: 3, anonymousUsers: 2 },
	],
	featureViews: [
		{
			feature: "investment",
			surface: "dashboard",
			views: 5,
			anonymousUsers: 2,
		},
	],
	filterChanges: [
		{ view: "metrics", filterKey: "team", changes: 4, avgValueCount: 1.5 },
	],
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

		expect(
			screen.getAllByText("No product telemetry events in this window."),
		).toHaveLength(6);
		// Each empty feed adopts the shared DataState taxonomy (CHAOS-2061).
		expect(screen.getAllByText("Enabled but no findings")).toHaveLength(6);
	});
});
