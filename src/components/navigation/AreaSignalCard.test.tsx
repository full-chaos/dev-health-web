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
});
