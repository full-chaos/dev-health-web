/** AreaOverview component tests (CHAOS-2082). */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@/test/utils";

import { AreaOverview } from "./AreaOverview";
import { getAreaById } from "@/lib/navigation/areas";
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

describe("AreaOverview note slot", () => {
    it("renders no note unless one is passed (other areas are unchanged)", () => {
        const signals = [signal("opportunities", "neutral")];
        const { rerender } = render(
            <AreaOverview areaId="improve" signals={signals} filters={defaultMetricFilter} />,
        );
        expect(screen.queryByTestId("area-overview-note")).toBeNull();
        rerender(
            <AreaOverview
                areaId="improve"
                signals={signals}
                filters={defaultMetricFilter}
                note={<p>a note</p>}
            />,
        );
        expect(screen.getByTestId("area-overview-note")).toHaveTextContent("a note");
    });
});

describe("AreaOverview — hero action, group heads, no eyebrow", () => {
    it("makes the whole hero one link into the sub-area (no invented action text)", () => {
        renderOverview([signal("crit", "critical"), signal("high", "high")]);
        const hero = screen.getByTestId("area-overview-hero");
        expect(within(hero).getByRole("link", { name: "crit" })).toHaveAttribute(
            "href",
            expect.stringContaining("/crit"),
        );
        expect(within(hero).getByText("Primary signal")).toBeInTheDocument();
    });

    it("draws no eyebrow unless a title is passed", () => {
        const { rerender } = renderOverview([signal("crit", "critical")]);
        expect(screen.queryByText(/area$/i)).toBeNull();
        expect(screen.queryByText("Related workflows")).toBeNull();
        expect(screen.getByTestId("area-overview").firstElementChild).toBe(
            screen.getByTestId("area-overview-hero"),
        );
        rerender(
            <AreaOverview
                areaId="govern"
                signals={[signal("crit", "critical")]}
                filters={defaultMetricFilter}
                title="Eyebrow"
            />,
        );
        expect(screen.getByText("Eyebrow")).toBeInTheDocument();
    });

    it("splits the grid under group heads when signals carry clusters", () => {
        renderOverview([
            signal("hero", "critical", { cluster: "Quality" }),
            signal("q2", "high", { cluster: "Quality" }),
            signal("r1", "medium", { cluster: "Risk" }),
        ]);
        const groups = screen.getAllByTestId("area-overview-cluster");
        expect(groups.map((g) => g.getAttribute("data-cluster"))).toEqual(["Quality", "Risk"]);
        expect(within(groups[0]).getByText("Quality")).toBeInTheDocument();
        expect(
            within(groups[0])
                .getAllByTestId("area-signal-card")
                .map((c) => c.getAttribute("data-signal-id")),
        ).toEqual(["q2"]);
        expect(
            within(groups[1])
                .getAllByTestId("area-signal-card")
                .map((c) => c.getAttribute("data-signal-id")),
        ).toEqual(["r1"]);
    });

    it("keeps one flat grid and no group heads without clusters", () => {
        renderOverview([signal("a", "critical"), signal("b", "high"), signal("c", "low")]);
        expect(screen.queryByTestId("area-overview-cluster")).toBeNull();
        expect(screen.getAllByTestId("area-overview-grid")).toHaveLength(1);
    });
});

describe("AreaOverview — hero action text comes from the destination (prototype copy)", () => {
    it("pins the two prototype labels on the registry (app.js 97 and 108)", () => {
        const label = (area: "diagnose" | "improve", id: string) =>
            getAreaById(area)?.hubItems.find((i) => i.id === id)?.heroCta;
        expect(label("diagnose", "code")).toBe("Inspect code");
        expect(label("improve", "opportunities")).toBe("Review opportunities");
    });

    it("draws the Code hero with the visible button and no overlay link", () => {
        render(
            <AreaOverview
                areaId="diagnose"
                signals={[signal("code", "critical", { href: "/code" })]}
                filters={defaultMetricFilter}
            />,
        );
        const hero = screen.getByTestId("area-overview-hero");
        expect(within(hero).getByRole("link", { name: "Inspect code" })).toHaveAttribute(
            "href",
            expect.stringContaining("/code"),
        );
        expect(within(hero).queryByTestId("area-signal-hero-link")).toBeNull();
    });

    it("draws the 'Review opportunities' button on the Improve hero, a synthesized signal that links to /opportunities", () => {
        render(
            <AreaOverview
                areaId="improve"
                signals={[
                    signal("improve-top-signal", "critical", { href: "/opportunities" }),
                    signal("opportunities", "neutral", { href: "/opportunities" }),
                    signal("experiments", "neutral", { href: "/improve/experiments" }),
                ]}
                filters={defaultMetricFilter}
            />,
        );
        const hero = screen.getByTestId("area-overview-hero");
        expect(within(hero).getByRole("link", { name: "Review opportunities" })).toHaveAttribute(
            "href",
            expect.stringContaining("/opportunities"),
        );
        expect(within(hero).queryByTestId("area-signal-hero-link")).toBeNull();
        // The three destination cards stay: the hero is not one of them.
        expect(screen.getAllByTestId("area-overview-grid")[0].children.length).toBe(2);
    });

    it("keeps the whole-hero link, no button, for a destination without prototype copy", () => {
        render(
            <AreaOverview
                areaId="diagnose"
                signals={[signal("flow", "critical", { href: "/flow" })]}
                filters={defaultMetricFilter}
            />,
        );
        const hero = screen.getByTestId("area-overview-hero");
        expect(within(hero).getByTestId("area-signal-hero-link")).toBeInTheDocument();
        expect(within(hero).queryByRole("link", { name: "Inspect code" })).toBeNull();
    });
});

describe("AreaOverview — a no-data Risk card stays a normal card in its group (D16)", () => {
    it("keeps the unavailable Feature Flags card inside the Risk group with card chrome", () => {
        renderOverview([
            signal("hero", "critical", { cluster: "Quality" }),
            signal("risk", "high", { cluster: "Risk" }),
            signal("flags", "unavailable", { cluster: "Risk", demoted: true }),
        ]);
        const groups = screen.getAllByTestId("area-overview-cluster");
        expect(groups.map((g) => g.getAttribute("data-cluster"))).toEqual(["Risk"]);
        const cards = within(groups[0]).getAllByTestId("area-signal-card");
        expect(cards.map((c) => c.getAttribute("data-signal-id"))).toEqual(["risk", "flags"]);
        expect(cards[1]).toHaveClass("border", "bg-(--card)");
    });
});
