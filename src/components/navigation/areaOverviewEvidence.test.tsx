import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@/test/utils";

import type { AreaSignal, AreaSignalState } from "@/lib/areaSignals/types";
import { defaultMetricFilter } from "@/lib/filters/defaults";

import { AreaOverview } from "./AreaOverview";
import {
    AreaOverviewSignalFacts,
    areaOverviewBodyOrder,
    areaOverviewEvidenceSubject,
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
// cards; under the cluster heads the Risk cards come first, then Quality.
const CLUSTERED: AreaSignal[] = [
    signal("r-low", "low", { cluster: "Risk" }),
    signal("q-high", "high", { cluster: "Quality" }),
    signal("q-none", "unavailable", { cluster: "Quality" }),
    signal("q-crit", "critical", { cluster: "Quality" }),
    signal("r-crit", "critical", { cluster: "Risk" }),
];

describe("areaOverviewBodyOrder", () => {
    it("is the order AreaOverview draws: hero first, then the grid (flat area)", () => {
        const order = areaOverviewBodyOrder(FLAT).map((s) => s.id);
        expect(order).toEqual(drawnOrder(FLAT));
        expect(order[0]).toBe("crit");
        expect(order.at(-1)).toBe("none");
    });

    it("is the order AreaOverview draws with cluster heads (clustered area)", () => {
        const order = areaOverviewBodyOrder(CLUSTERED).map((s) => s.id);
        expect(order).toEqual(drawnOrder(CLUSTERED));
        expect(order).toEqual(["q-crit", "r-crit", "r-low", "q-high", "q-none"]);
    });

    it("lists only the grid when no signal has data", () => {
        const none = [signal("a", "unavailable"), signal("b", "unavailable")];
        expect(areaOverviewBodyOrder(none).map((s) => s.id)).toEqual(drawnOrder(none));
    });
});

describe("areaOverviewEvidenceSubject (the 'View evidence' subject of an overview page)", () => {
    it("is the page: a content subject with the page title and no explain metric", () => {
        const subject = areaOverviewEvidenceSubject("Diagnose", FLAT);
        expect(subject.title).toBe("Diagnose");
        expect("metric" in subject).toBe(false);
        expect("apiUrl" in subject).toBe(false);
        render(<>{subject.content}</>);
        expect(screen.getAllByTestId("evidence-fact")).toHaveLength(FLAT.length);
    });
});

describe("AreaOverviewSignalFacts", () => {
    it("shows every signal's served value and state in body order, with the caption", () => {
        render(
            <AreaOverviewSignalFacts
                title="Diagnose"
                signals={FLAT}
                description="Diagnostic sub-areas, ordered by severity."
            />,
        );
        expect(screen.getByText("Diagnostic sub-areas, ordered by severity.")).toBeInTheDocument();
        const list = screen.getByTestId("area-overview-signal-list");
        expect(list).toHaveAttribute("aria-label", "Diagnose signals");
        expect(
            within(list)
                .getAllByTestId("evidence-fact")
                .map((row) => row.textContent),
        ).toEqual([
            "crit · crit metric42% · Critical",
            "high · high metric42% · High",
            "low · low metric42% · Low",
            "neutral · neutral metric42% · Info",
            "high-demoted · high-demoted metric42% · High",
            "none · none metricNot reported",
        ]);
    });

    it("shows 'Not reported' for a signal with no data, never a value", () => {
        render(<AreaOverviewSignalFacts title="Diagnose" signals={FLAT} />);
        const row = screen
            .getAllByTestId("evidence-fact")
            .find((node) => node.textContent?.startsWith("none"));
        expect(row).toHaveAttribute("data-reported", "false");
        expect(row).toHaveTextContent("Not reported");
    });
});
