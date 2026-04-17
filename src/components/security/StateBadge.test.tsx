/** StateBadge component tests — CHAOS-1240. */
import { afterEach, describe, expect, it } from "vitest";
import { render, screen, cleanup } from "@/test/utils";
import { StateBadge } from "./StateBadge";
import type { SecurityState } from "@/lib/filters/security";

describe("StateBadge", () => {
  afterEach(() => cleanup());

  it.each<[SecurityState, string]>([
    ["open", "Open"],
    ["fixed", "Fixed"],
    ["dismissed", "Dismissed"],
    ["detected", "Detected"],
    ["confirmed", "Confirmed"],
    ["resolved", "Resolved"],
  ])("renders the label for state=%s", (state, label) => {
    render(<StateBadge state={state} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("uses the warn tone classes for open/detected/confirmed", () => {
    for (const state of ["open", "detected", "confirmed"] as const) {
      const { unmount } = render(<StateBadge state={state} />);
      const badge = screen.getByText(new RegExp(state, "i"));
      expect(badge.className).toContain("bg-amber-100");
      unmount();
    }
  });

  it("uses the success tone classes for fixed and resolved", () => {
    for (const state of ["fixed", "resolved"] as const) {
      const { unmount } = render(<StateBadge state={state} />);
      const badge = screen.getByText(new RegExp(state, "i"));
      expect(badge.className).toContain("bg-emerald-100");
      unmount();
    }
  });

  it("uses the muted tone for dismissed and unrecognized values", () => {
    render(<StateBadge state="dismissed" />);
    const badge = screen.getByText("Dismissed");
    expect(badge.className).toContain("bg-slate-100");
  });
});
