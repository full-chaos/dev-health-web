import { describe, it, expect } from "vitest";
import { render, screen } from "@/test/utils";
import { PreviewBadge } from "./PreviewBadge";

describe("PreviewBadge", () => {
  it("renders a span with 'Preview' text", () => {
    render(<PreviewBadge />);
    expect(screen.getByText("Preview")).toBeInTheDocument();
  });

  it("renders with the expected badge styles", () => {
    render(<PreviewBadge />);
    const badge = screen.getByText("Preview");
    expect(badge.tagName).toBe("SPAN");
    expect(badge).toHaveClass("uppercase");
  });

  it("applies a title attribute when provided", () => {
    render(<PreviewBadge title="This feature is in preview." />);
    expect(screen.getByText("Preview")).toHaveAttribute("title", "This feature is in preview.");
  });
});
