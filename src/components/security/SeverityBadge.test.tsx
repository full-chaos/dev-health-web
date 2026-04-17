/** SeverityBadge component tests — CHAOS-1240. */
import { afterEach, describe, expect, it } from "vitest";
import { render, screen, cleanup } from "@/test/utils";
import { SeverityBadge } from "./SeverityBadge";
import type { SecuritySeverity } from "@/lib/filters/security";

describe("SeverityBadge", () => {
  afterEach(() => cleanup());

  it.each<[SecuritySeverity, string]>([
    ["critical", "Critical"],
    ["high", "High"],
    ["medium", "Medium"],
    ["low", "Low"],
    ["unknown", "Unknown"],
  ])("renders the label for severity=%s", (severity, label) => {
    render(<SeverityBadge severity={severity} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("applies the critical color class", () => {
    render(<SeverityBadge severity="critical" />);
    const badge = screen.getByText("Critical");
    expect(badge.className).toContain("bg-red-600");
    expect(badge.className).toContain("text-white");
  });

  it("applies the low color class", () => {
    render(<SeverityBadge severity="low" />);
    const badge = screen.getByText("Low");
    expect(badge.className).toContain("bg-slate-400");
  });

  it("falls back to the unknown palette for an unrecognized value", () => {
    render(<SeverityBadge severity={"exotic" as SecuritySeverity} />);
    const badge = screen.getByText("exotic");
    expect(badge.className).toContain("bg-slate-300");
  });
});
