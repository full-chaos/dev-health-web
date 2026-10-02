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
        const link = screen.getByRole("link", { name: "Security" });
        expect(link.getAttribute("href")).toContain("/security");
        expect(screen.getAllByRole("link")).toHaveLength(1);
    });

    it("draws the caller's action text as the one primary link, and no overlay link", () => {
        render(
            <PrimarySignalHero
                signal={base}
                filters={defaultMetricFilter}
                actionLabel="Inspect code"
            />,
        );
        const cta = screen.getByRole("link", { name: "Inspect code" });
        expect(cta.getAttribute("href")).toContain("/security");
        expect(screen.getAllByRole("link")).toHaveLength(1);
        expect(screen.queryByTestId("area-signal-hero-link")).toBeNull();
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

    it("colors the big value by severity token, never a raw color", () => {
        const { rerender } = render(
            <PrimarySignalHero signal={base} filters={defaultMetricFilter} />,
        );
        expect(screen.getByTestId("area-signal-value")).toHaveClass("text-(--accent-negative)");
        rerender(
            <PrimarySignalHero signal={{ ...base, state: "high" }} filters={defaultMetricFilter} />,
        );
        expect(screen.getByTestId("area-signal-value")).toHaveClass("text-(--accent-3)");
        rerender(
            <PrimarySignalHero signal={{ ...base, state: "low" }} filters={defaultMetricFilter} />,
        );
        expect(screen.getByTestId("area-signal-value")).toHaveClass("text-foreground");
    });

    it("draws the state as a small tinted pill", () => {
        render(<PrimarySignalHero signal={base} filters={defaultMetricFilter} />);
        const pill = screen.getByTestId("area-signal-badge");
        expect(pill).toHaveClass("rounded-sm");
        expect(pill.className).not.toMatch(/\bborder\b|uppercase|tracking-/);
    });
});
