import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@/test/utils";

import { AreaSignalCard } from "./AreaSignalCard";
import type { AreaSignal } from "@/lib/areaSignals/types";
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

const base: AreaSignal = {
    id: "security",
    label: "Security",
    href: "/security",
    metricLabel: "Open alerts",
    value: "9",
    state: "high",
    direction: "up",
};

const draw = (signal: AreaSignal, emphasized = false) =>
    render(
        <AreaSignalCard signal={signal} filters={defaultMetricFilter} emphasized={emphasized} />,
    );

afterEach(cleanup);

describe("AreaSignalCard pinned behaviour (before the CHAOS-7598 restyle)", () => {
    it("normal card: link with its attributes, label, badge word, value, glyph and metric label", () => {
        draw(base);
        const card = screen.getByTestId("area-signal-card");
        expect(card.tagName).toBe("A");
        expect(card.getAttribute("href")).toContain("/security");
        expect(card).toHaveAttribute("data-signal-id", "security");
        expect(card).toHaveAttribute("data-state", "high");
        expect(card).toHaveAttribute("data-demoted", "false");
        expect(card).toHaveAttribute("data-emphasized", "false");
        expect(screen.getByRole("heading", { level: 3, name: "Security" })).toBeInTheDocument();
        expect(screen.getByTestId("area-signal-badge")).toHaveTextContent("High");
        expect(screen.getByTestId("area-signal-value")).toHaveTextContent("9");
        expect(screen.getByText("↑")).toBeInTheDocument();
        expect(screen.getByText("Open alerts")).toBeInTheDocument();
        expect(screen.queryByText("Top signal")).toBeNull();
    });

    it("hero: emphasized attribute and the 'Top signal' label", () => {
        draw(base, true);
        expect(screen.getByTestId("area-signal-card")).toHaveAttribute("data-emphasized", "true");
        expect(screen.getByText("Top signal")).toBeInTheDocument();
    });

    it("demoted card keeps its attribute", () => {
        draw({ ...base, demoted: true });
        expect(screen.getByTestId("area-signal-card")).toHaveAttribute("data-demoted", "true");
    });

    it("a card without a value shows the metric label alone", () => {
        draw({ ...base, value: "", state: "neutral", direction: undefined });
        expect(screen.queryByTestId("area-signal-value")).toBeNull();
        expect(screen.getByText("Open alerts")).toBeInTheDocument();
        expect(screen.getByTestId("area-signal-badge")).toBeInTheDocument();
    });

    it("unavailable card: link, muted tier, DataState inside, no badge and no value", () => {
        draw({ ...base, value: "", state: "unavailable", direction: undefined });
        const card = screen.getByTestId("area-signal-card");
        expect(card.tagName).toBe("A");
        expect(card).toHaveAttribute("data-state", "unavailable");
        expect(card).toHaveAttribute("data-tier", "muted");
        expect(screen.getByTestId("area-signal-unavailable")).toBeInTheDocument();
        expect(screen.queryByTestId("area-signal-badge")).toBeNull();
        expect(screen.queryByTestId("area-signal-value")).toBeNull();
    });

    it("preview card: not a link, aria-disabled, preview attribute", () => {
        draw({ ...base, value: "", state: "unavailable", direction: undefined, preview: true });
        const card = screen.getByTestId("area-signal-card");
        expect(card.tagName).toBe("DIV");
        expect(card).toHaveAttribute("aria-disabled", "true");
        expect(card).toHaveAttribute("data-preview", "true");
        expect(screen.queryByRole("link")).toBeNull();
    });

    it("markup of the four kinds (snapshot taken before the restyle)", () => {
        const kinds = [
            [base, false],
            [base, true],
            [{ ...base, demoted: true }, false],
            [{ ...base, value: "", state: "unavailable", direction: undefined }, false],
        ] as const;
        const html = kinds.map(([s, e]) => {
            const { container, unmount } = draw(s as AreaSignal, e);
            const out = container.innerHTML;
            unmount();
            return out;
        });
        expect(html).toMatchSnapshot();
    });

    it("unavailable card is full contrast: no opacity fade, its own neutral dashed look", () => {
        draw({ ...base, value: "", state: "unavailable", direction: undefined });
        const card = screen.getByTestId("area-signal-card");
        expect(card.className).not.toMatch(/opacity-/);
        expect(card.innerHTML).not.toMatch(/opacity-/);
        expect(card.querySelector(".border-dashed")).not.toBeNull();
        // The state is named in words, not implied by dimming.
        expect(screen.getByText("No data for this window")).toBeInTheDocument();
    });

    it("hero has a severity edge, no gradient and a plain-ink value", () => {
        draw(base, true);
        const card = screen.getByTestId("area-signal-card");
        expect(card.className).toContain("border-l-(--accent-3)");
        expect(card.className).not.toContain("gradient");
        expect(screen.getByTestId("area-signal-value").className).not.toContain("metric-hero");
    });

    it("every severity state maps to a hero edge", () => {
        for (const state of ["critical", "high", "medium", "low", "neutral"] as const) {
            const { unmount } = draw({ ...base, state }, true);
            expect(screen.getByTestId("area-signal-card").className).toMatch(/border-l-\(--/);
            unmount();
        }
    });
});

describe("AreaSignalCard approved look (CHAOS-8062)", () => {
    const sig = (extra: Partial<AreaSignal> = {}): AreaSignal => ({
        id: "cov",
        label: "TestOps",
        href: "/testops",
        metricLabel: "Line coverage",
        value: "60%",
        state: "high",
        ...extra,
    });
    const renderCard = (signal: AreaSignal) =>
        render(<AreaSignalCard signal={signal} filters={defaultMetricFilter} />);

    it("draws the severity word as a small tinted pill: no outline, no forced caps", () => {
        renderCard(sig());
        const pill = screen.getByTestId("area-signal-badge");
        expect(pill).toHaveTextContent("High");
        expect(pill).toHaveClass("rounded-full!", "bg-(--accent-3)/12");
        expect(pill.className).not.toMatch(/\bborder\b|uppercase|tracking-/);
    });

    it("puts the metric name below the value as link text with an arrow", () => {
        renderCard(sig());
        const value = screen.getByTestId("area-signal-value");
        const metric = screen.getByTestId("area-signal-metric");
        expect(metric).toHaveTextContent("Line coverage →");
        expect(metric.className).not.toMatch(/uppercase|tracking-/);
        expect(metric).toHaveClass("text-(--accent-2)");
        expect(
            value.compareDocumentPosition(metric) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(value.parentElement).not.toContainElement(metric);
    });

    it("draws an unavailable signal as a normal card with the no-data state inside", () => {
        renderCard(sig({ state: "unavailable", value: "", label: "Feature Flags" }));
        const card = screen.getByTestId("area-signal-card");
        expect(card).toHaveClass("border", "bg-(--card)", "rounded-(--radius-md)");
        expect(screen.getByRole("heading", { name: "Feature Flags" })).toBeInTheDocument();
        expect(screen.getByTestId("area-signal-unavailable")).toBeInTheDocument();
    });

    describe("three different states (CHAOS-8168)", () => {
        const empty: AreaSignal = { ...base, state: "unavailable", value: "" };

        it('an empty window says "No data for this window", with no error', () => {
            draw(empty);
            expect(screen.getByTestId("area-signal-unavailable")).toHaveTextContent(
                "No data for this window",
            );
            expect(screen.queryByTestId("area-signal-failed")).not.toBeInTheDocument();
        });

        it("a failed read says it could not be read, in one plain sentence, and is not the empty state", () => {
            draw({ ...empty, failed: true });
            const failed = screen.getByTestId("area-signal-failed");
            expect(failed).toHaveTextContent("Could not be read");
            expect(failed).toHaveTextContent("The data for this view could not be read.");
            expect(screen.queryByText("No data for this window")).not.toBeInTheDocument();
            expect(screen.getByTestId("area-signal-card")).toHaveAttribute("data-failed", "true");
            expect(screen.getByTestId("area-signal-card")).toHaveAttribute(
                "data-state",
                "unavailable",
            );
        });

        it("a served value is drawn as the value, with neither state", () => {
            draw(base);
            expect(screen.queryByTestId("area-signal-failed")).not.toBeInTheDocument();
            expect(screen.queryByTestId("area-signal-unavailable")).not.toBeInTheDocument();
            expect(screen.getByTestId("area-signal-value")).toHaveTextContent("9");
        });
    });
});
