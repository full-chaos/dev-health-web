import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PrTestOpsSummary } from "../PrTestOpsSummary";

describe("PrTestOpsSummary", () => {
  it("renders with full data", () => {
    render(
      <PrTestOpsSummary
        prId="PR-123"
        repoId="frontend-web"
        pipelineStatus={{ status: "success", duration: "5m" }}
        testResults={{ passed: 100, failed: 2, skipped: 1, flaky: 3 }}
        coverageDelta={1.5}
        releaseConfidence={0.85}
      />,
    );

    expect(screen.getByText("TestOps Summary")).toBeInTheDocument();
    expect(screen.getByText("frontend-web • PR-123")).toBeInTheDocument();

    const pipelineStatus = screen.getByTestId("pipeline-status");
    expect(pipelineStatus).toHaveTextContent("success (5m)");
    expect(pipelineStatus).toHaveClass("text-green-500");

    expect(screen.getByTestId("test-passed")).toHaveTextContent("100");
    expect(screen.getByTestId("test-failed")).toHaveTextContent("2 failed");
    expect(screen.getByTestId("test-flaky")).toHaveTextContent("3");

    const coverageDelta = screen.getByTestId("coverage-delta");
    expect(coverageDelta).toHaveTextContent("+1.5%");
    expect(coverageDelta).toHaveClass("text-green-500");

    const releaseConfidence = screen.getByTestId("release-confidence");
    expect(releaseConfidence).toHaveTextContent("85%");
    expect(releaseConfidence).toHaveClass("text-green-500");
  });

  it("renders with partial/missing data", () => {
    render(<PrTestOpsSummary prId="PR-456" repoId="backend-api" />);

    expect(screen.getByText("TestOps Summary")).toBeInTheDocument();
    expect(screen.getByText("backend-api • PR-456")).toBeInTheDocument();

    expect(screen.queryByTestId("pipeline-status")).not.toBeInTheDocument();

    const noDataElements = screen.getAllByText("No data");
    expect(noDataElements).toHaveLength(4);
  });

  it("renders traffic light color logic correctly for failure/negative values", () => {
    render(
      <PrTestOpsSummary
        prId="PR-789"
        repoId="mobile-app"
        pipelineStatus={{ status: "failure" }}
        testResults={{ passed: 50, failed: 5, skipped: 0, flaky: 0 }}
        coverageDelta={-2.5}
        releaseConfidence={0.4}
      />,
    );

    const pipelineStatus = screen.getByTestId("pipeline-status");
    expect(pipelineStatus).toHaveTextContent("failure");
    expect(pipelineStatus).toHaveClass("text-red-500");

    const coverageDelta = screen.getByTestId("coverage-delta");
    expect(coverageDelta).toHaveTextContent("-2.5%");
    expect(coverageDelta).toHaveClass("text-red-500");

    const releaseConfidence = screen.getByTestId("release-confidence");
    expect(releaseConfidence).toHaveTextContent("40%");
    expect(releaseConfidence).toHaveClass("text-red-500");
  });

  it("renders traffic light color logic correctly for amber/warning values", () => {
    render(<PrTestOpsSummary prId="PR-101" repoId="data-pipeline" releaseConfidence={0.6} />);

    const releaseConfidence = screen.getByTestId("release-confidence");
    expect(releaseConfidence).toHaveTextContent("60%");
    expect(releaseConfidence).toHaveClass("text-amber-500");
  });
});
