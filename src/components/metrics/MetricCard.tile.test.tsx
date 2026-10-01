import { describe, it, expect, vi } from "vitest";

vi.mock("@/components/charts/SparklineChart", () => ({
    SparklineChart: () => <div data-testid="sparkline" />,
}));

import { MetricCard } from "./MetricCard";
import { render, screen } from "@/test/utils";

describe("MetricCard tile layout (CHAOS-7597)", () => {
    it("puts the delta before the note on one meta line, after the value", () => {
        render(<MetricCard label="Coverage" value={72} unit="%" delta={5} caption="vs last 90d" />);
        const value = screen.getByText("72%");
        const delta = screen.getByText(/\+5%/);
        const note = screen.getByText("vs last 90d");
        expect(
            value.compareDocumentPosition(delta) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(delta.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("keeps the delta text byte-equal, arrow plus sign, and the inverse tone", () => {
        render(<MetricCard label="Queue" value={12} unit="m" delta={-3} inverseGood />);
        const delta = screen.getByText(/-3%/);
        expect(delta.textContent).toBe("↓ -3%");
        expect(delta).toHaveClass("text-(--positive)");
    });

    it("shows a missing value as muted '--', distinct from a real zero", () => {
        const { unmount } = render(<MetricCard label="Coverage" />);
        const missing = screen.getByText("--");
        expect(missing).toHaveClass("text-(--ink-muted)");
        expect(screen.queryByText("0")).not.toBeInTheDocument();
        unmount();
        render(<MetricCard label="Coverage" value={0} />);
        expect(screen.queryByText("--")).not.toBeInTheDocument();
        const zero = screen.getByText("0");
        expect(zero).not.toHaveClass("text-(--ink-muted)");
    });

    it("draws no sparkline (no flat line) when there is no trend data", () => {
        render(<MetricCard label="Coverage" value={5} spark={[{ ts: "2026-06-01", value: 5 }]} />);
        expect(screen.queryByTestId("sparkline")).not.toBeInTheDocument();
        expect(screen.getByText("No trend yet")).toBeInTheDocument();
    });

    it("keeps the overlay link and its aria-label", () => {
        render(<MetricCard label="Coverage" href="/x" value={1} />);
        expect(screen.getByRole("link")).toHaveAttribute("aria-label", "Coverage: Open evidence");
    });
});

describe("MetricCard meta line separators (CHAOS-7597)", () => {
    const meta = (container: HTMLElement) =>
        container.querySelector(".mt-2.text-xs") as HTMLElement;

    it("delta and note share one line with the dot only between them", () => {
        const { container } = render(
            <MetricCard label="L" value={1} unit="%" delta={5} caption="the note" />,
        );
        expect(meta(container).textContent).toBe("↑ +5% · the note");
    });

    it("delta alone has no dot", () => {
        const { container } = render(<MetricCard label="L" value={1} unit="%" delta={5} />);
        expect(meta(container).textContent).toBe("↑ +5%");
    });

    it("an unavailable delta with a note has no leading dot, and without a note no dot at all", () => {
        const { container, unmount } = render(
            <MetricCard
                label="L"
                value={1}
                caption="the note"
                deltaUnavailableLabel="Insufficient history"
            />,
        );
        expect(meta(container).textContent).toBe("Insufficient history · the note");
        unmount();
        const second = render(
            <MetricCard label="L" value={1} deltaUnavailableLabel="Insufficient history" />,
        );
        expect(meta(second.container).textContent).toBe("Insufficient history");
    });
});
