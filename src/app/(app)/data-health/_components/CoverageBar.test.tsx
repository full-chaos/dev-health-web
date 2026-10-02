import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { CoverageBar } from "./CoverageBar";

test("renders with correct percentage", () => {
    render(<CoverageBar coveragePercent={85} label="Test Coverage" />);
    expect(screen.getByText("Test Coverage")).toBeDefined();
    expect(screen.getByText("85%")).toBeDefined();
});

test("clamps percentage to 0-100", () => {
    render(<CoverageBar coveragePercent={150} label="Over" />);
    expect(screen.getByText("100%")).toBeDefined();
});

// CHAOS-7677: the fill is a status token, not a raw palette class, so it reads in light and dark.
const fillOf = (container: HTMLElement) => {
    const fill = container.querySelector<HTMLElement>("[style*='width']");
    if (!fill) throw new Error("no fill element");
    return fill;
};

test.each([
    [95, "bg-(--positive)"],
    [90, "bg-(--positive)"],
    [89, "bg-(--caution)"],
    [70, "bg-(--caution)"],
    [69, "bg-(--negative)"],
    [0, "bg-(--negative)"],
])("coverage %i percent fills with %s", (percent, token) => {
    const { container } = render(<CoverageBar coveragePercent={percent} />);
    const classes = fillOf(container).className.split(/\s+/);
    expect(classes).toContain(token);
    expect(classes.filter((c) => /^bg-(red|green|yellow)-/.test(c))).toEqual([]);
});
