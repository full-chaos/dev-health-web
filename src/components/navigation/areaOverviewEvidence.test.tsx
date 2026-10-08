import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@/test/utils";
import { renderWithEvidenceDrawer } from "@/test/evidenceDrawer";

import type { AreaSignal, AreaSignalState } from "@/lib/areaSignals/types";
import { defaultMetricFilter } from "@/lib/filters/defaults";

import { AreaOverview } from "./AreaOverview";
import {
    AreaOverviewEvidenceAction,
    areaOverviewBodyOrder,
    areaOverviewFacts,
} from "./areaOverviewEvidence";

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

afterEach(cleanup);

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

/** The ids in the order the rendered overview draws its hero and cards. */
function drawnOrder(signals: AreaSignal[]): string[] {
    const { container } = render(
        <AreaOverview areaId="govern" signals={signals} filters={defaultMetricFilter} />,
    );
    const ids = Array.from(container.querySelectorAll("[data-signal-id]")).map(
        (node) => node.getAttribute("data-signal-id") ?? "",
    );
    cleanup();
    return ids;
}

const FLAT: AreaSignal[] = [
    signal("low", "low"),
    signal("none", "unavailable"),
    signal("crit", "critical"),
    signal("neutral", "neutral"),
    signal("high", "high"),
    signal("high-demoted", "high", { demoted: true }),
];

// Grouping changes the order here: the flat severity order would put q-high between the two Risk
// cards, and the first-seen group order would put Risk first. Govern's own group order (its hub
// items) is Quality, then Risk, so the Quality cards come first.
const CLUSTERED: AreaSignal[] = [
    signal("r-low", "low", { cluster: "Risk" }),
    signal("q-high", "high", { cluster: "Quality" }),
    signal("q-none", "unavailable", { cluster: "Quality" }),
    signal("q-crit", "critical", { cluster: "Quality" }),
    signal("r-crit", "critical", { cluster: "Risk" }),
];

describe("areaOverviewBodyOrder", () => {
    it("is the order AreaOverview draws: hero first, then the grid (flat area)", () => {
        const order = areaOverviewBodyOrder("govern", FLAT).map((s) => s.id);
        expect(order).toEqual(drawnOrder(FLAT));
        expect(order[0]).toBe("crit");
        expect(order.at(-1)).toBe("none");
    });

    it("is the order AreaOverview draws with cluster heads: the area's group order (Govern: Quality, then Risk)", () => {
        const order = areaOverviewBodyOrder("govern", CLUSTERED).map((s) => s.id);
        expect(order).toEqual(drawnOrder(CLUSTERED));
        expect(order).toEqual(["q-crit", "q-high", "q-none", "r-crit", "r-low"]);
    });

    it("lists only the grid when no signal has data", () => {
        const none = [signal("a", "unavailable"), signal("b", "unavailable")];
        expect(areaOverviewBodyOrder("govern", none).map((s) => s.id)).toEqual(drawnOrder(none));
    });
});

describe("areaOverviewFacts (the page facts of an overview page)", () => {
    it("lists every signal's served value and state in body order; no data reads 'Not reported'", () => {
        expect(areaOverviewFacts("diagnose", FLAT)).toEqual([
            { label: "crit · crit metric", value: "42% · Critical" },
            { label: "high · high metric", value: "42% · High" },
            { label: "low · low metric", value: "42% · Low" },
            { label: "neutral · neutral metric", value: "42% · Info" },
            { label: "high-demoted · high-demoted metric", value: "42% · High" },
            { label: "none · none metric", value: undefined },
        ]);
    });
});

describe("AreaOverviewEvidenceAction (the 'View evidence' action of an overview page)", () => {
    it("opens the shared drawer with the PAGE as the subject: its facts in body order, no explain metric", async () => {
        renderWithEvidenceDrawer(
            <AreaOverviewEvidenceAction title="Diagnose" areaId="diagnose" signals={FLAT} />,
        );
        fireEvent.click(screen.getByRole("button", { name: "View evidence" }));
        const dialog = within(screen.getByRole("dialog"));
        const list = dialog.getByTestId("page-evidence-facts");
        expect(list).toHaveAttribute("aria-label", "Diagnose");
        const rows = within(list).getAllByTestId("evidence-fact");
        expect(rows.map((row) => row.textContent)).toEqual([
            "crit · crit metric42% · Critical",
            "high · high metric42% · High",
            "low · low metric42% · Low",
            "neutral · neutral metric42% · Info",
            "high-demoted · high-demoted metric42% · High",
            "none · none metricUnknown",
        ]);
        expect(rows.at(-1)).toHaveAttribute("data-reported", "false");
        // A content subject: the request panel (an explain metric) is not mounted.
        expect(dialog.queryByTestId("evidence-panel")).toBeNull();
    });
});

describe("areaOverviewFacts for a failed read (CHAOS-8168)", () => {
    it("says Could not be read for a failed read and keeps Not reported for an empty one", () => {
        const facts = areaOverviewFacts("diagnose", [
            signal("failed-one", "unavailable", { failed: true }),
            signal("empty-one", "unavailable"),
        ]);
        const byLabel = Object.fromEntries(
            facts.map((f) => [String(f.label).split(" · ")[0], f.value]),
        );
        expect(byLabel["failed-one"]).toBe("Could not be read");
        expect(byLabel["empty-one"]).toBeUndefined(); // undefined value renders "Not reported"
    });
});
