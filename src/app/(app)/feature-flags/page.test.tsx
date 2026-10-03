import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockData, tileProps } = vi.hoisted(() => ({ mockData: vi.fn(), tileProps: vi.fn() }));

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
vi.mock("@/components/metrics/MetricCard", () => ({
    MetricCard: (props: { label: string; href?: string }) => {
        tileProps(props);
        return <article data-testid="tile">{props.label}</article>;
    },
}));

import FeatureFlagsPage from "./page";

const data = (severity: string | null) => ({
    summary: {
        activeFlags: 4,
        releaseFrictionDelta: 1.5,
        releaseFrictionSeverity: severity,
        releaseErrorRateDelta: 0.2,
        coverageRatio: 40,
    },
});

describe("Feature Flags page", () => {
    beforeEach(() => vi.clearAllMocks());

    it("is titled Feature Flags and its four tiles do not link to the page itself", async () => {
        mockData.mockResolvedValue(data("moderate"));

        render(await FeatureFlagsPage({ searchParams: Promise.resolve({}) }));

        expect(
            screen.getByRole("heading", { level: 1, name: "Feature Flags" }),
        ).toBeInTheDocument();
        expect(screen.getAllByTestId("tile")).toHaveLength(4);
        for (const [props] of tileProps.mock.calls) {
            expect(props.href).toBeUndefined();
        }
        expect(screen.getByTestId("flag-table")).toBeInTheDocument();
    });

    it("shows the friction severity as a pill, and unavailable as its own state", async () => {
        mockData.mockResolvedValue(data("high"));
        const first = render(await FeatureFlagsPage({ searchParams: Promise.resolve({}) }));
        expect(screen.getByTestId("release-friction-severity")).toHaveTextContent("High");
        first.unmount();

        mockData.mockResolvedValue(data(null));
        render(await FeatureFlagsPage({ searchParams: Promise.resolve({}) }));
        const pill = screen.getByTestId("release-friction-severity");
        expect(pill).toHaveTextContent("Unavailable");
        expect(pill).toHaveAttribute("data-severity", "unavailable");
    });

    it("draws the four tiles as one joined 2 x 2 metric strip", async () => {
        mockData.mockResolvedValue(data("moderate"));
        render(await FeatureFlagsPage({ searchParams: Promise.resolve({}) }));
        const strip = screen.getByTestId("feature-flag-tiles");
        expect(strip).toHaveAttribute("data-columns", "2");
        expect(
            within(strip)
                .getAllByTestId("tile")
                .map((t) => t.textContent),
        ).toEqual([
            "Active Flags",
            "Release Friction Delta",
            "Release Error Rate Delta",
            "Impact Coverage Ratio",
        ]);
    });

    it("puts the severity pill inside the Release Friction tile cell, and keeps the caption", async () => {
        mockData.mockResolvedValue(data("moderate"));
        render(await FeatureFlagsPage({ searchParams: Promise.resolve({}) }));
        const cell = screen.getByTestId("release-friction-tile");
        // The cell is a direct cell of the strip, and it holds both the tile and its pill.
        expect(cell.parentElement).toBe(screen.getByTestId("feature-flag-tiles"));
        expect(within(cell).getByTestId("tile")).toHaveTextContent("Release Friction Delta");
        expect(within(cell).getByTestId("release-friction-severity")).toHaveTextContent("Moderate");
        const friction = tileProps.mock.calls
            .map(([props]) => props as { label: string; caption?: string })
            .find((props) => props.label === "Release Friction Delta");
        expect(friction?.caption).toBe("Severity: moderate");
    });

    it("draws the flag registry as a table card titled Flag Registry", async () => {
        mockData.mockResolvedValue(data("low"));
        render(await FeatureFlagsPage({ searchParams: Promise.resolve({}) }));
        const card = screen.getByTestId("flag-registry");
        expect(card.tagName).toBe("SECTION");
        expect(within(card).getByRole("heading", { level: 2 })).toHaveTextContent("Flag Registry");
        expect(within(card).getByTestId("flag-table")).toBeInTheDocument();
    });
});
