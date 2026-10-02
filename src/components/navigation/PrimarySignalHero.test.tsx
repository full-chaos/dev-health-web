import { describe, expect, it } from "vitest";

import { render, screen } from "@/test/utils";
import { defaultMetricFilter } from "@/lib/filters/defaults";
import type { AreaSignal } from "@/lib/areaSignals/types";
import { PrimarySignalHero } from "./PrimarySignalHero";

const base = {
    id: "security",
    label: "Security",
    href: "/security",
    metricLabel: "Open criticals",
    value: "5",
    state: "critical",
} as const satisfies AreaSignal;

describe("PrimarySignalHero", () => {
    it("shows the served value, metric, label, state and one primary action", () => {
        render(<PrimarySignalHero signal={base} filters={defaultMetricFilter} />);
        expect(screen.getByText("Primary signal")).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Security" })).toBeInTheDocument();
        expect(screen.getByTestId("area-signal-value")).toHaveTextContent("5");
        expect(screen.getByText("Open criticals")).toBeInTheDocument();
        expect(screen.getByTestId("area-signal-badge")).toHaveTextContent(/critical/i);
        const cta = screen.getByRole("link", { name: "Open Security" });
        expect(cta.getAttribute("href")).toContain("/security");
        expect(screen.getAllByRole("link")).toHaveLength(1);
    });

    it("never invents a value: no value node when none is served", () => {
        render(<PrimarySignalHero signal={{ ...base, value: "" }} filters={defaultMetricFilter} />);
        expect(screen.queryByTestId("area-signal-value")).toBeNull();
    });

    it("shows the driver caption only when served", () => {
        const { rerender } = render(
            <PrimarySignalHero signal={base} filters={defaultMetricFilter} />,
        );
        expect(screen.queryByTestId("area-signal-driver")).toBeNull();
        rerender(
            <PrimarySignalHero
                signal={{ ...base, driver: "Rework drag 12%" }}
                filters={defaultMetricFilter}
            />,
        );
        expect(screen.getByTestId("area-signal-driver")).toHaveTextContent("Rework drag 12%");
    });

    it("pins the approved padding (25px), gap (22px) and 3px severity edge", () => {
        render(<PrimarySignalHero signal={base} filters={defaultMetricFilter} />);
        const root = screen.getByTestId("area-signal-card");
        expect(root).toHaveClass("p-6.25", "gap-5.5", "border-l-3", "border-l-(--accent-negative)");
    });
});
