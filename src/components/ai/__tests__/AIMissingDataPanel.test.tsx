import { describe, expect, it } from "vitest";
import { render, screen } from "@/test/utils";
import { AIMissingDataPanel } from "../AIMissingDataPanel";

describe("AIMissingDataPanel", () => {
  it("renders explicit missing metric state with required data source", () => {
    render(
      <AIMissingDataPanel
        title="Reviewer concentration"
        reason="Reviewer concentration is not in the schema."
        needed="Aggregated reviewer distribution buckets."
      />,
    );

    expect(screen.getByText("Missing data")).toBeInTheDocument();
    expect(screen.getByText("Reviewer concentration")).toBeInTheDocument();
    expect(screen.getByText(/Aggregated reviewer distribution buckets/)).toBeInTheDocument();
  });
});
