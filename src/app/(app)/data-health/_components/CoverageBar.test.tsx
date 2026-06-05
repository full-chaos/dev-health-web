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
