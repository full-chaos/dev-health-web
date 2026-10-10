import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockData } = vi.hoisted(() => ({ mockData: vi.fn() }));

vi.mock("@/lib/api/system", () => ({ checkApiHealth: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock("@/lib/config", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/config")>()),
    getServerEnv: () => ({}),
}));
vi.mock("@/lib/feature-flags/fetchers", () => ({
    fetchFeatureFlagsData: mockData,
    fetchFeatureFlagList: vi.fn().mockResolvedValue({ items: [], totalCount: 0 }),
}));
vi.mock("./actions", () => ({ fetchFlagPage: vi.fn() }));
vi.mock("@/components/shell/PageHeader", () => ({
    PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock("@/components/shell/ScopeBar", () => ({ ScopeBar: () => <div data-testid="scope-bar" /> }));
vi.mock("@/components/feature-flags/FeatureFlagTable", () => ({
    FeatureFlagTable: () => <div data-testid="flag-table" />,
}));

import FeatureFlagsPage from "./page";

// CHAOS-9077: the tone of a change follows the measure's direction in FF_MEASURES. Impact
// Coverage Ratio is "up" (a rise is good); Active Flags is "neutral" (no tone either way).
const data = (delta: number) => ({
    summary: {
        activeFlags: 4,
        activeFlagsDelta: delta,
        releaseFrictionDelta: 1.5,
        releaseFrictionSeverity: "moderate",
        releaseErrorRateDelta: 0.2,
        coverageRatio: 40,
        coverageRatioDelta: delta,
    },
});

const tileDelta = (label: string) => {
    const tile = screen.getByText(label).closest("[data-testid='metric-title']")!.parentElement!;
    return within(tile).getByTestId("metric-delta");
};

describe("Feature Flags tiles: tone of the change", () => {
    beforeEach(() => vi.clearAllMocks());

    it("Active Flags (neutral measure) is muted for a rise and for a fall", async () => {
        for (const delta of [5, -5]) {
            mockData.mockResolvedValue(data(delta));
            const view = render(await FeatureFlagsPage({ searchParams: Promise.resolve({}) }));
            const el = tileDelta("Active Flags");
            expect(el).toHaveClass("text-(--ink-muted)");
            expect(el).not.toHaveClass("text-(--positive)");
            expect(el).not.toHaveClass("text-(--accent-negative)");
            view.unmount();
        }
    });

    it("Impact Coverage Ratio (higher is better): a rise is good, a fall is bad", async () => {
        mockData.mockResolvedValue(data(5));
        const up = render(await FeatureFlagsPage({ searchParams: Promise.resolve({}) }));
        expect(tileDelta("Impact Coverage Ratio")).toHaveClass("text-(--positive)");
        up.unmount();
        mockData.mockResolvedValue(data(-5));
        render(await FeatureFlagsPage({ searchParams: Promise.resolve({}) }));
        expect(tileDelta("Impact Coverage Ratio")).toHaveClass("text-(--accent-negative)");
    });
});
