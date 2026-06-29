/** AreaOverview component tests (CHAOS-2082). */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@/test/utils";

import { AreaOverview } from "./AreaOverview";
import type { AreaSignal, AreaSignalState } from "@/lib/areaSignals/types";
import { defaultMetricFilter } from "@/lib/filters/defaults";

vi.mock("next/link", () => ({
    default: ({
        href,
        children,
        ...props
    }: {
        href: string;
        children: React.ReactNode;
        [key: string]: unknown;
    }) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}));

function signal(id: string, state: AreaSignalState, extra: Partial<AreaSignal> = {}): AreaSignal {
    return {
        id,
        label: id,
        href: `/${id}`,
        metricLabel: `${id} metric`,
        value: state === "unavailable" ? "" : "42%",
        state,
        ...extra,
    };
}

function renderOverview(signals: AreaSignal[]) {
    return render(<AreaOverview areaId="govern" signals={signals} filters={defaultMetricFilter} />);
}

afterEach(cleanup);

describe("AreaOverview — summarize + route (no hero/grid duplication)", () => {
    it("renders nothing when there are no signals", () => {
        const { container } = renderOverview([]);
        expect(container.firstChild).toBeNull();
    });

    it("promotes the single most-severe available signal to the hero", () => {
        renderOverview([signal("low", "low"), signal("crit", "critical"), signal("high", "high")]);
        const hero = screen.getByTestId("area-overview-hero");
        expect(within(hero).getByTestId("area-signal-card").getAttribute("data-signal-id")).toBe(
            "crit",
        );
        // The hero card carries the emphasized treatment exactly once.
        const emphasized = screen
            .getAllByTestId("area-signal-card")
            .filter((c) => c.getAttribute("data-emphasized") === "true");
        expect(emphasized).toHaveLength(1);
        expect(emphasized[0].getAttribute("data-signal-id")).toBe("crit");
    });

    it("excludes the hero sub-area from the grid (no card repeated)", () => {
        renderOverview([
            signal("crit", "critical"),
            signal("high", "high"),
            signal("med", "medium"),
        ]);

        const hero = screen.getByTestId("area-overview-hero");
        const grid = screen.getByTestId("area-overview-grid");

        // Hero appears once and is NOT present in the grid.
        expect(within(hero).getByTestId("area-signal-card").getAttribute("data-signal-id")).toBe(
            "crit",
        );
        const gridIds = within(grid)
            .getAllByTestId("area-signal-card")
            .map((c) => c.getAttribute("data-signal-id"));
        expect(gridIds).toEqual(["high", "med"]);
        expect(gridIds).not.toContain("crit");

        // Each id appears exactly once across the whole Overview.
        const allIds = screen
            .getAllByTestId("area-signal-card")
            .map((c) => c.getAttribute("data-signal-id"));
        expect(new Set(allIds).size).toBe(allIds.length);
    });

    it("sinks empty/unconnected sub-areas to a separate muted tier after real signals", () => {
        renderOverview([
            signal("ok", "high"),
            signal("gap", "unavailable"),
            signal("med", "medium"),
        ]);

        const grid = screen.getByTestId("area-overview-grid");
        const gridCards = within(grid).getAllByTestId("area-signal-card");
        expect(gridCards.map((c) => c.getAttribute("data-signal-id"))).toEqual(["med", "gap"]);

        const gapCard = gridCards.find((c) => c.getAttribute("data-signal-id") === "gap")!;
        expect(gapCard).toHaveAttribute("data-state", "unavailable");
        expect(within(gapCard).getByTestId("area-signal-unavailable")).toBeInTheDocument();
    });

    it("never surfaces the 'No area metric unavailable' double-negative copy", () => {
        renderOverview([
            signal("ok", "high"),
            signal("gap", "unavailable", { metricLabel: "No area metric" }),
        ]);
        expect(screen.queryByText(/No area metric unavailable/i)).toBeNull();
        expect(screen.queryByText(/No area metric/i)).toBeNull();
    });

    it("falls back to the muted tier alone when no real-data signal exists", () => {
        renderOverview([signal("a", "unavailable"), signal("b", "unavailable")]);
        // No hero (an unavailable metric is never the top signal).
        expect(screen.queryByTestId("area-overview-hero")).toBeNull();
        const grid = screen.getByTestId("area-overview-grid");
        const gridCards = within(grid).getAllByTestId("area-signal-card");
        expect(gridCards).toHaveLength(2);
        expect(gridCards[0]).toHaveAttribute("data-signal-id", "a");
        expect(gridCards[1]).toHaveAttribute("data-signal-id", "b");
    });

    it("renders a PREVIEW empty-tier chip as non-clickable, a routed one as a link (CHAOS-2217)", () => {
        renderOverview([
            signal("routed", "unavailable"),
            signal("preview", "unavailable", { preview: true }),
        ]);
        const grid = screen.getByTestId("area-overview-grid");

        // The preview chip is NOT a link (dead route can't 404) but stays visible.
        const previewCards = within(grid).getAllByTestId("area-signal-card");
        const previewChip = previewCards.find(
            (el) => el.getAttribute("data-signal-id") === "preview",
        )!;
        expect(previewChip.tagName).not.toBe("A");
        expect(previewChip.getAttribute("aria-disabled")).toBe("true");

        // The routed unavailable chip remains a link.
        const routedLink = previewCards.find(
            (el) => el.getAttribute("data-signal-id") === "routed",
        )!;
        expect(routedLink.tagName).toBe("A");
        expect(routedLink).toHaveAttribute("data-signal-id", "routed");
    });
});
