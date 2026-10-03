import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/charts/SparklineChart", () => ({
    SparklineChart: () => <div data-testid="sparkline" />,
}));

import { MetricCard } from "./MetricCard";
import { render, screen, within } from "@/test/utils";

describe("MetricCard headAction (CHAOS-8214)", () => {
    it("draws the node at the right end of the title line, inside the tile head", () => {
        render(<MetricCard label="Open alerts" value={3} headAction={<span>High</span>} />);
        const head = screen.getByTestId("metric-title");
        const slot = within(head).getByTestId("metric-head-action");
        expect(slot).toHaveTextContent("High");
        expect(slot.className).toContain("ml-auto");
        // It is a mark: the title text and the slot are siblings in the head.
        expect(within(head).getByText("Open alerts")).toBeInTheDocument();
    });

    it("draws nothing extra without headAction", () => {
        render(<MetricCard label="Open alerts" value={3} />);
        expect(screen.queryByTestId("metric-head-action")).not.toBeInTheDocument();
    });

    it("keeps the tile link and the title on a linked tile", () => {
        render(
            <MetricCard
                label="Flags"
                href="/feature-flags"
                value={2}
                headAction={<span>Low</span>}
            />,
        );
        expect(screen.getByRole("link", { name: /Flags/ })).toHaveAttribute(
            "href",
            "/feature-flags",
        );
        expect(screen.getByTestId("metric-head-action")).toHaveTextContent("Low");
    });
});
