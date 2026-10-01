/** KpiTile component tests — CHAOS-1240. */
import { afterEach, describe, expect, it } from "vitest";
import { render, screen, cleanup } from "@/test/utils";
import { KpiTile } from "./KpiTile";

describe("KpiTile", () => {
    afterEach(() => cleanup());

    it("renders label and value", () => {
        render(<KpiTile label="Open Alerts" value={42} />);

        expect(screen.getByText("Open Alerts")).toBeInTheDocument();
        expect(screen.getByText("42")).toBeInTheDocument();
    });

    it("accepts a string value (e.g. formatted duration)", () => {
        render(<KpiTile label="MTTF" value="3.5d" />);

        expect(screen.getByText("3.5d")).toBeInTheDocument();
    });

    it("renders a positive delta as an upward arrow indicator", () => {
        render(<KpiTile label="Critical" value={10} delta={3} />);

        expect(screen.getByText(/\+3/)).toBeInTheDocument();
        expect(screen.getByText(/↑/)).toBeInTheDocument();
    });

    it("renders a negative delta as a downward arrow indicator", () => {
        render(<KpiTile label="Critical" value={4} delta={-6} />);

        expect(screen.getByText(/-6/)).toBeInTheDocument();
        expect(screen.getByText(/↓/)).toBeInTheDocument();
    });

    it("renders 'no change' copy when delta is 0", () => {
        render(<KpiTile label="Critical" value={4} delta={0} />);

        expect(screen.getByText(/no change/i)).toBeInTheDocument();
    });

    it("hides the value and delta and shows skeletons while loading", () => {
        render(<KpiTile label="Open Alerts" value={42} delta={3} loading />);

        expect(screen.queryByText("42")).not.toBeInTheDocument();
        expect(screen.queryByText(/\+3/)).not.toBeInTheDocument();
    });

    it("draws no colored edge and no pill by default", () => {
        const { container } = render(<KpiTile label="Open" value={5} />);

        expect(container.firstElementChild?.className).not.toMatch(/border-l-/);
        expect(screen.queryByTestId("kpi-pill")).toBeNull();
    });

    it("shows the Critical pill with its word and icon, not a colored edge", () => {
        const { container } = render(
            <KpiTile label="Critical" value={2} pill={{ label: "Critical", tone: "negative" }} />,
        );

        const pill = screen.getByTestId("kpi-pill");
        expect(pill).toHaveTextContent("Critical");
        expect(pill).toHaveAttribute("data-tone", "negative");
        expect(pill.querySelector("svg")).not.toBeNull();
        expect(container.firstElementChild?.className).not.toMatch(/border-l-/);
    });

    it("shows the High pill with the caution tone", () => {
        render(<KpiTile label="High" value={5} pill={{ label: "High", tone: "caution" }} />);

        expect(screen.getByTestId("kpi-pill")).toHaveAttribute("data-tone", "caution");
    });

    it("hides the pill while loading", () => {
        render(
            <KpiTile label="High" value={5} loading pill={{ label: "High", tone: "caution" }} />,
        );

        expect(screen.queryByTestId("kpi-pill")).toBeNull();
    });
});
