import { describe, it, expect, vi } from "vitest";

const sparkProps = vi.hoisted(() => ({ last: null as null | Record<string, unknown> }));
vi.mock("@/components/charts/SparklineChart", () => ({
    SparklineChart: (props: Record<string, unknown>) => {
        sparkProps.last = props;
        return <div data-testid="sparkline" />;
    },
}));

import { MetricCard } from "./MetricCard";
import { render, screen, userEvent } from "@/test/utils";

const series = [
    { ts: "2026-06-01", value: 1 },
    { ts: "2026-06-02", value: 2 },
];

describe("MetricCard tile as the approved prototype: title", () => {
    it("shows the label as written (not uppercase), 12px medium, muted", () => {
        render(<MetricCard label="Cycle Time" value={1} />);
        const title = screen.getByTestId("metric-title");
        expect(title).toHaveTextContent("Cycle Time");
        expect(title).toHaveClass("text-xs", "font-medium", "text-(--ink-muted)");
        expect(title.className).not.toContain("uppercase");
        expect(title.className).not.toContain("text-label-caps");
    });
});

describe("MetricCard tile as the approved prototype: value with a small unit", () => {
    it("shows the number big and the unit small and muted beside it", () => {
        render(<MetricCard label="Cycle Time" value={1.5} unit="days" />);
        const value = screen.getByTestId("metric-value");
        expect(value).toHaveClass("text-[1.75rem]", "font-bold", "text-foreground");
        expect(value.firstElementChild).toHaveTextContent(/^1\.5$/);
        const unit = screen.getByTestId("metric-unit");
        expect(unit).toHaveTextContent(/^days$/);
        expect(unit).toHaveClass("text-xs", "font-normal", "text-(--ink-muted)");
        expect(value).toContainElement(unit);
        // The text reads "1.5 days" (a real space; the flex gap draws it).
        expect(value.textContent).toBe("1.5 days");
        // The joined short form ("1.5d") is gone from the tile face.
        expect(screen.queryByText("1.5d")).toBeNull();
    });

    it("shows a percent as number and '%' apart, and a unitless value with no unit element", () => {
        const { unmount } = render(<MetricCard label="Coverage" value={72} unit="%" />);
        expect(screen.getByTestId("metric-value").firstElementChild).toHaveTextContent(/^72$/);
        expect(screen.getByTestId("metric-unit")).toHaveTextContent(/^%$/);
        unmount();
        render(<MetricCard label="Flags" value={12} unit="" />);
        expect(screen.getByTestId("metric-value").textContent).toBe("12");
        expect(screen.queryByTestId("metric-unit")).toBeNull();
    });

    it("shows an absent value as muted 'Not reported', distinct from a served zero", () => {
        const { unmount } = render(<MetricCard label="Blocked Work" unit="hours" />);
        const missing = screen.getByTestId("metric-value");
        expect(missing).toHaveTextContent(/^Not reported$/);
        expect(missing).toHaveClass("text-(--ink-muted)");
        expect(screen.queryByTestId("metric-unit")).toBeNull();
        expect(screen.queryByText("0")).toBeNull();
        expect(screen.queryByText("--")).toBeNull();
        unmount();
        render(<MetricCard label="Blocked Work" value={0} unit="hours" />);
        const zero = screen.getByTestId("metric-value");
        expect(zero.firstElementChild).toHaveTextContent(/^0$/);
        expect(zero).toHaveClass("text-foreground");
        expect(screen.getByTestId("metric-unit")).toHaveTextContent(/^hours$/);
        expect(screen.queryByText("Not reported")).toBeNull();
    });
});

describe("MetricCard small served values", () => {
    it("shows a served 0.3 hours as 0.3 hours, not 0", () => {
        render(<MetricCard label="Review Latency" value={0.3} unit="hours" />);
        expect(screen.getByTestId("metric-value").firstElementChild).toHaveTextContent(/^0\.3$/);
        expect(screen.getByTestId("metric-unit")).toHaveTextContent(/^hours$/);
    });

    it("shows a served +0.3% change as +0.3%, not 0%", () => {
        render(<MetricCard label="Coverage" value={60} unit="%" delta={0.3} />);
        expect(screen.getByTestId("metric-delta").textContent).toBe("+0.3%");
        // It is a change, so it is not titled "No change"; too small to rate, so it is muted.
        expect(screen.getByTestId("metric-delta")).not.toHaveAttribute("title");
        expect(screen.getByTestId("metric-delta")).toHaveClass("text-(--ink-muted)");
    });

    it("shows a served value too small for one decimal as <0.1, not 0", () => {
        render(<MetricCard label="Change Failure Rate" value={0.04} unit="%" />);
        expect(screen.getByTestId("metric-value").firstElementChild).toHaveTextContent(/^<0\.1$/);
    });
});

describe("MetricCard tile as the approved prototype: meta line", () => {
    const meta = () => screen.getByTestId("metric-meta");

    it("puts the meta line after the value and reads '<delta> · <note>'", () => {
        render(
            <MetricCard
                label="Coverage"
                value={72}
                unit="%"
                delta={5}
                caption="vs previous window"
                spark={series}
            />,
        );
        expect(meta().textContent).toBe("+5% · vs previous window");
        expect(
            screen.getByTestId("metric-value").compareDocumentPosition(meta()) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(meta()).toHaveClass("text-label-caps", "tracking-normal", "text-(--ink-muted)");
        expect(meta().className).not.toContain("uppercase");
    });

    it("shows the delta as a signed number with no arrow, and keeps the polarity tone", () => {
        const { unmount } = render(
            <MetricCard label="Queue" value={12} unit="m" delta={-3} inverseGood spark={series} />,
        );
        // Lower is better: a fall is good.
        expect(screen.getByTestId("metric-delta").textContent).toBe("-3%");
        expect(screen.getByTestId("metric-delta")).toHaveClass("text-(--positive)", "font-medium");
        unmount();
        render(<MetricCard label="Queue" value={12} unit="m" delta={3} inverseGood />);
        // Truthful number: a rise reads +3%, never a negated -3%; the tone is a regression.
        expect(screen.getByTestId("metric-delta").textContent).toBe("+3%");
        expect(screen.getByTestId("metric-delta")).toHaveClass("text-(--accent-negative)");
    });

    it("a delta of zero is muted and says 'No change' in its title", () => {
        render(<MetricCard label="L" value={1} delta={0} spark={series} />);
        const delta = screen.getByTestId("metric-delta");
        expect(delta.textContent).toBe("0%");
        expect(delta).toHaveClass("text-(--ink-muted)");
        expect(delta).toHaveAttribute("title", "No change");
    });

    it("a delta alone has no dot; an unavailable delta shows its label, with the dot only before a note", () => {
        const { unmount } = render(<MetricCard label="L" value={1} delta={5} spark={series} />);
        expect(meta().textContent).toBe("+5%");
        unmount();
        const second = render(
            <MetricCard
                label="L"
                value={1}
                caption="the note"
                deltaUnavailableLabel="Insufficient history"
                spark={series}
            />,
        );
        expect(meta().textContent).toBe("Insufficient history · the note");
        second.unmount();
        render(
            <MetricCard
                label="L"
                value={1}
                deltaUnavailableLabel="Insufficient history"
                spark={series}
            />,
        );
        expect(meta().textContent).toBe("Insufficient history");
    });

    it("carries no claim of its own: without a caption there is no note", () => {
        render(<MetricCard label="L" value={1} delta={5} spark={series} href="/x" />);
        expect(meta().textContent).toBe("+5%");
        expect(screen.queryByText(/baseline/i)).toBeNull();
        expect(screen.queryByText(/previous window/i)).toBeNull();
    });

    it("is narrower beside a sparkline (55%) than without one (90%)", () => {
        const { unmount } = render(<MetricCard label="L" value={1} delta={5} spark={series} />);
        expect(meta()).toHaveClass("max-w-[55%]");
        unmount();
        render(<MetricCard label="L" value={1} delta={5} />);
        expect(meta()).toHaveClass("max-w-[90%]");
    });
});

describe("MetricCard tile as the approved prototype: trend", () => {
    it("draws the sparkline bottom right in the tile variant when a series is served", () => {
        render(<MetricCard label="L" value={1} delta={5} spark={series} />);
        const slot = screen.getByTestId("metric-spark");
        expect(slot).toContainElement(screen.getByTestId("sparkline"));
        expect(slot).toHaveClass("absolute", "right-4", "bottom-6.5", "h-7.75");
        expect(slot.className).toContain("min-[71.9375rem]:w-21.75");
        expect(sparkProps.last).toMatchObject({
            variant: "tile",
            height: 31,
            data: [1, 2],
            categories: ["2026-06-01", "2026-06-02"],
        });
    });

    it("says 'No trend yet' in the meta line, and draws no flat line, when no series is served", () => {
        render(<MetricCard label="Blocked Work" value={0} unit="hours" />);
        expect(screen.queryByTestId("sparkline")).toBeNull();
        expect(screen.queryByTestId("metric-spark")).toBeNull();
        expect(screen.getByTestId("metric-meta").textContent).toBe(
            "No prior period · No trend yet",
        );
        expect(screen.getByText("No trend yet")).toHaveAttribute(
            "title",
            "Not enough data points to plot a trend yet",
        );
    });

    it("a series of one point is no trend", () => {
        render(<MetricCard label="L" value={5} spark={[{ ts: "2026-06-01", value: 5 }]} />);
        expect(screen.queryByTestId("sparkline")).toBeNull();
        expect(screen.getByText("No trend yet")).toBeInTheDocument();
    });

    it("the end dot takes the bad tone only when the delta is a regression", () => {
        const tone = () => (sparkProps.last as { tone: string }).tone;
        const a = render(
            <MetricCard label="L" value={1} delta={5} inverseGood={false} spark={series} />,
        );
        expect(tone()).toBe("default");
        a.unmount();
        const b = render(
            <MetricCard label="L" value={1} delta={-5} inverseGood={false} spark={series} />,
        );
        expect(tone()).toBe("bad");
        b.unmount();
        const c = render(<MetricCard label="L" value={1} delta={5} inverseGood spark={series} />);
        expect(tone()).toBe("bad");
        c.unmount();
        const d = render(<MetricCard label="L" value={1} spark={series} />);
        expect(tone()).toBe("default");
        d.unmount();
        // A caller's own delta node has no polarity the tile can read.
        render(
            <MetricCard label="L" value={1} delta={-5} deltaSlot={<span>x</span>} spark={series} />,
        );
        expect(tone()).toBe("default");
    });

    it("noTrendLabel changes the text; an empty one shows nothing", () => {
        const { unmount } = render(<MetricCard label="L" value={1} noTrendLabel="Trend" />);
        expect(screen.getByTestId("metric-meta").textContent).toBe("No prior period · Trend");
        unmount();
        render(<MetricCard label="L" value={1} noTrendLabel="" />);
        expect(screen.getByTestId("metric-meta").textContent).toBe("No prior period");
    });
});

describe("MetricCard evidence access: the whole tile is the control", () => {
    it("onOpenEvidence makes the tile one button named '<label>: Open evidence' that calls it", async () => {
        const onOpen = vi.fn();
        const { container } = render(
            <MetricCard label="Cycle Time" value={1} delta={5} onOpenEvidence={onOpen} />,
        );
        const button = screen.getByRole("button", { name: "Cycle Time: Open evidence" });
        expect(screen.getAllByRole("button")).toHaveLength(1);
        // It covers the tile, and the tile face carries no "Open evidence" text.
        expect(button).toHaveClass("absolute", "inset-0", "z-10");
        expect(button.parentElement).toBe(container.firstElementChild);
        expect(screen.queryByText("Open evidence")).toBeNull();
        await userEvent.click(button);
        expect(onOpen).toHaveBeenCalledTimes(1);
    });

    it("the tile button is reached with Tab and opens with Enter and with Space", async () => {
        const onOpen = vi.fn();
        render(<MetricCard label="Cycle Time" value={1} onOpenEvidence={onOpen} />);
        await userEvent.tab();
        const button = screen.getByRole("button", { name: "Cycle Time: Open evidence" });
        expect(button).toHaveFocus();
        expect(button.className).toContain("focus-visible:ring-2");
        await userEvent.keyboard("{Enter}");
        await userEvent.keyboard(" ");
        expect(onOpen).toHaveBeenCalledTimes(2);
    });

    it("a click on the sparkline of a button tile opens the same evidence, and the mark stays above the overlay", async () => {
        const onOpen = vi.fn();
        render(<MetricCard label="L" value={1} spark={series} onOpenEvidence={onOpen} />);
        expect(screen.getByTestId("metric-spark")).toHaveClass("z-20");
        await userEvent.click(screen.getByTestId("sparkline"));
        expect(onOpen).toHaveBeenCalledTimes(1);
    });

    it("href keeps the whole-tile link and its name, with no 'Open evidence' text on the face", () => {
        const { unmount } = render(<MetricCard label="Coverage" href="/x" value={1} />);
        const link = screen.getByRole("link");
        expect(link).toHaveAttribute("href", "/x");
        expect(link).toHaveAttribute("aria-label", "Coverage: Open evidence");
        expect(link).toHaveClass("absolute", "inset-0", "z-10");
        expect(screen.queryByText("Open evidence")).toBeNull();
        unmount();
        render(<MetricCard label="Coverage" href="/x" value={1} caption="Line coverage" />);
        expect(screen.getByRole("link")).toHaveAttribute("aria-label", "Coverage: Line coverage");
    });

    it("with both href and onOpenEvidence the tile is the button, not a link", () => {
        render(<MetricCard label="L" value={1} href="/x" onOpenEvidence={() => {}} />);
        expect(screen.getByRole("button", { name: "L: Open evidence" })).toBeInTheDocument();
        expect(screen.queryByRole("link")).toBeNull();
    });

    it("a tile with no href and no onOpenEvidence is not a control: no button, no link, no hover cue", () => {
        const { container } = render(<MetricCard label="L" value={1} delta={5} />);
        expect(container.querySelector("button")).toBeNull();
        expect(container.querySelector("a")).toBeNull();
        expect(screen.getByTestId("metric-title").className).not.toContain("group-hover");
    });

    it("evidenceHref adds a footer link above the overlay and moves the sparkline to the top", () => {
        render(<MetricCard label="L" value={1} evidenceHref="/explore?metric=x" spark={series} />);
        const footer = screen.getByRole("link", { name: "Open evidence" });
        expect(footer).toHaveAttribute("href", "/explore?metric=x");
        expect(footer).toHaveClass("z-20");
        expect(screen.getByTestId("metric-spark")).toHaveClass("top-15");
        expect(screen.getByTestId("metric-spark").className).not.toContain("bottom-6.5");
    });
});

describe("MetricCard opt-in props that stay", () => {
    it("deltaSlot replaces the delta, byte for byte", () => {
        render(
            <MetricCard
                label="L"
                value={1}
                delta={5}
                deltaSlot={<span data-testid="mine">+9%</span>}
                spark={series}
            />,
        );
        expect(screen.getByTestId("mine")).toHaveTextContent("+9%");
        expect(screen.queryByTestId("metric-delta")).toBeNull();
        expect(screen.getByTestId("metric-meta").textContent).toBe("+9%");
    });

    it("an empty-fragment deltaSlot means no delta part, and no stray dot before a note", () => {
        const { unmount } = render(
            <MetricCard label="L" value={1} deltaSlot={<></>} caption="the note" spark={series} />,
        );
        expect(screen.getByTestId("metric-meta").textContent).toBe("the note");
        unmount();
        // Nothing to say at all: no meta line.
        render(<MetricCard label="L" value={1} deltaSlot={<></>} hideTrend />);
        expect(screen.queryByTestId("metric-meta")).toBeNull();
    });

    it("as changes only the root element", () => {
        const { container } = render(<MetricCard label="L" value={1} as="article" />);
        expect(container.firstElementChild?.tagName).toBe("ARTICLE");
    });

    it("the tile keeps the prototype box: padding, min height, radius, surface and stroke", () => {
        const { container } = render(<MetricCard label="L" value={1} />);
        expect(container.firstElementChild).toHaveClass(
            "relative",
            "min-h-31",
            "min-w-0",
            "rounded-(--radius-md)",
            "border",
            "border-(--card-stroke)",
            "bg-card",
            "p-3.75",
        );
        const cls = container.firstElementChild?.className ?? "";
        expect(cls).toContain("min-[71.9375rem]:px-5");
        expect(cls).toContain("min-[71.9375rem]:py-4.5");
    });
});
