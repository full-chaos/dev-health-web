import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/utils";
import userEvent from "@testing-library/user-event";
import { ChordSummaryPanel } from "./ChordSummaryPanel";
import type { ChordDataset } from "@/lib/types";

const mockDataset: ChordDataset = {
  nodes: [
    { id: "A", label: "Team A" },
    { id: "B", label: "Team B" },
    { id: "C", label: "Team C" },
    { id: "Other", label: "Other", isOther: true },
  ],
  matrix: [
    [0, 10, 5, 0],
    [5, 0, 20, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  totalFlow: 40,
  grouping: "team",
  summary: {
    topImporters: [
      { id: "B", label: "Team B", net: 1200 },
      { id: "C", label: "Team C", net: 42 },
    ],
    topExporters: [{ id: "A", label: "Team A", net: 1500000 }],
    strongestBilateral: [{ a: "A", b: "B", bilateralValue: 15 }],
    otherShare: 0.15,
  },
};

describe("ChordSummaryPanel", () => {
  it("renders all four sections for a non-empty dataset", () => {
    render(<ChordSummaryPanel dataset={mockDataset} />);

    expect(screen.getByText("Top importers")).toBeInTheDocument();
    expect(screen.getByText("Top exporters")).toBeInTheDocument();
    expect(screen.getByText("Strongest exchange")).toBeInTheDocument();

    // Check formatted values
    expect(screen.getByText("+1.2k")).toBeInTheDocument();
    expect(screen.getByText("+42")).toBeInTheDocument();
    expect(screen.getByText("-1.5M")).toBeInTheDocument();
    expect(screen.getByText("15")).toBeInTheDocument();

    // Check overflow row
    expect(screen.getByText(/15.0% of flow collapsed into 'Other'/)).toBeInTheDocument();
    expect(screen.getByText(/\(1 entities\)/)).toBeInTheDocument();
  });

  it("shows skeletons when loading", () => {
    const { container } = render(<ChordSummaryPanel dataset={mockDataset} loading />);

    // Should not render text content
    expect(screen.queryByText("Top importers")).not.toBeInTheDocument();
    expect(screen.queryByText("Team B")).not.toBeInTheDocument();

    // Should render skeleton elements
    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("shows empty state when dataset is null", () => {
    render(<ChordSummaryPanel dataset={null} />);

    expect(screen.getByText("No summary yet")).toBeInTheDocument();
    expect(screen.getByText("Adjust filters to reveal exchange patterns.")).toBeInTheDocument();
  });

  it("shows empty state when dataset has no nodes", () => {
    render(<ChordSummaryPanel dataset={{ ...mockDataset, nodes: [] }} />);

    expect(screen.getByText("No summary yet")).toBeInTheDocument();
  });

  it("does not render overflow row when otherShare is 0", () => {
    const datasetWithoutOther = {
      ...mockDataset,
      summary: { ...mockDataset.summary, otherShare: 0 },
    };
    render(<ChordSummaryPanel dataset={datasetWithoutOther} />);

    expect(screen.queryByText(/collapsed into 'Other'/)).not.toBeInTheDocument();
  });

  it("fires onEntitySelect when a row is clicked", async () => {
    const onEntitySelect = vi.fn();
    render(<ChordSummaryPanel dataset={mockDataset} onEntitySelect={onEntitySelect} />);

    const user = userEvent.setup();

    // Click an importer
    const importerBtn = screen.getByRole("button", { name: /Rank 1: Team B, \+1.2k/ });
    await user.click(importerBtn);
    expect(onEntitySelect).toHaveBeenCalledWith("B");

    // Click an exporter
    const exporterBtn = screen.getByRole("button", { name: /Rank 1: Team A, -1.5M/ });
    await user.click(exporterBtn);
    expect(onEntitySelect).toHaveBeenCalledWith("A");

    // Click a bilateral row
    const bilateralBtn = screen.getByRole("button", { name: /Rank 1: Team A and Team B, 15/ });
    await user.click(bilateralBtn);
    expect(onEntitySelect).toHaveBeenCalledWith("A");
  });
});
