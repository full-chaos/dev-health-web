import { describe, expect, it } from "vitest";
import { render, screen } from "@/test/utils";
import { NoSurveillanceContract } from "./NoSurveillanceContract";

describe("NoSurveillanceContract", () => {
  it("states the no-surveillance guardrails", () => {
    render(<NoSurveillanceContract />);

    expect(screen.getByText("No-surveillance contract")).toBeInTheDocument();
    expect(screen.getByText("No leaderboards")).toBeInTheDocument();
    expect(screen.getByText("Team and repo first")).toBeInTheDocument();
    expect(screen.getByText("Reflection or coaching only")).toBeInTheDocument();
  });
});
