import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/utils";
import { ClientTimestamp } from "./ClientTimestamp";

describe("ClientTimestamp", () => {
  it("renders fallback when no value is provided", () => {
    render(<ClientTimestamp fallback="N/A" />);
    expect(screen.getByText("N/A")).toBeInTheDocument();
  });

  it("renders fallback when value is null", () => {
    render(<ClientTimestamp value={null} fallback="Unknown" />);
    expect(screen.getByText("Unknown")).toBeInTheDocument();
  });

  it("renders a formatted date when a valid ISO value is given", () => {
    render(<ClientTimestamp value="2024-06-15T10:30:00Z" fallback="N/A" />);
    // jsdom environment = client snapshot returns true → formatLocal runs
    const span = document.querySelector("span");
    expect(span?.textContent).not.toBe("N/A");
    expect(span?.textContent).not.toBe("");
  });

  it("renders fallback for an invalid date string", () => {
    render(<ClientTimestamp value="not-a-date" fallback="Invalid" />);
    expect(screen.getByText("Invalid")).toBeInTheDocument();
  });

  it("renders prefix around the timestamp", () => {
    render(<ClientTimestamp value={null} prefix="Last: " fallback="N/A" />);
    const span = document.querySelector("span");
    expect(span?.textContent).toContain("Last:");
  });

  it("renders suffix after the timestamp", () => {
    render(<ClientTimestamp value={null} suffix=" ago" fallback="N/A" />);
    const span = document.querySelector("span");
    expect(span?.textContent).toContain("ago");
  });

  it("applies className to the wrapper span", () => {
    render(<ClientTimestamp value={null} className="text-red-500" fallback="N/A" />);
    const span = document.querySelector("span");
    expect(span).toHaveClass("text-red-500");
  });
});
