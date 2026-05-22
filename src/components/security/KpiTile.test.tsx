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

  it("applies the danger tone border when tone='danger'", () => {
    const { container } = render(<KpiTile label="Critical" value={2} tone="danger" />);

    const root = container.querySelector("div");
    expect(root?.className).toContain("border-l-red-600");
  });

  it("applies the warn tone border when tone='warn'", () => {
    const { container } = render(<KpiTile label="Open" value={5} tone="warn" />);

    const root = container.querySelector("div");
    expect(root?.className).toContain("border-l-amber-400");
  });
});
