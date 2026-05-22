import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import {
  ChordChartControls,
  CHORD_CONTROLS_DEFAULTS,
  parseChordControlsFromSearchParams,
  serializeChordControlsToSearchParams,
} from "./ChordChartControls";

describe("ChordChartControls", () => {
  it("renders defaults correctly", () => {
    const onChange = vi.fn();
    render(<ChordChartControls value={CHORD_CONTROLS_DEFAULTS} onChange={onChange} />);

    // Direction
    const bilateralBtn = screen.getByRole("radio", { name: "Bilateral" });
    expect(bilateralBtn).toHaveAttribute("aria-checked", "true");

    // Grouping
    const select = screen.getByLabelText("Group by");
    expect(select).toHaveValue("team");

    // Top-N
    const topNInput = screen.getByLabelText("Entities");
    expect(topNInput).toHaveValue(8);

    // Self-links
    const selfLinksCheckbox = screen.getByLabelText("Include self-links");
    expect(selfLinksCheckbox).not.toBeChecked();

    // Show Other
    const showOtherCheckbox = screen.getByLabelText("Show 'Other' bucket");
    expect(showOtherCheckbox).toBeChecked();
  });

  it("changing direction fires onChange", async () => {
    const onChange = vi.fn();
    render(<ChordChartControls value={CHORD_CONTROLS_DEFAULTS} onChange={onChange} />);

    const inflowBtn = screen.getByRole("radio", { name: "Inflow" });
    await userEvent.click(inflowBtn);

    expect(onChange).toHaveBeenCalledWith({
      ...CHORD_CONTROLS_DEFAULTS,
      direction: "in",
    });
  });

  it("changing grouping fires onChange", async () => {
    const onChange = vi.fn();
    render(<ChordChartControls value={CHORD_CONTROLS_DEFAULTS} onChange={onChange} />);

    const select = screen.getByLabelText("Group by");
    await userEvent.selectOptions(select, "repo");

    expect(onChange).toHaveBeenCalledWith({
      ...CHORD_CONTROLS_DEFAULTS,
      grouping: "repo",
    });
  });

  it("top-N clamps to [3, 16]", async () => {
    const onChange = vi.fn();
    render(<ChordChartControls value={CHORD_CONTROLS_DEFAULTS} onChange={onChange} />);

    const topNInput = screen.getByLabelText("Entities");

    // Type 99 -> clamps to 16
    await userEvent.clear(topNInput);
    await userEvent.type(topNInput, "99");
    fireEvent.blur(topNInput);

    expect(onChange).toHaveBeenCalledWith({
      ...CHORD_CONTROLS_DEFAULTS,
      topN: 16,
    });

    // Type 1 -> clamps to 3
    await userEvent.clear(topNInput);
    await userEvent.type(topNInput, "1");
    fireEvent.blur(topNInput);

    expect(onChange).toHaveBeenCalledWith({
      ...CHORD_CONTROLS_DEFAULTS,
      topN: 3,
    });
  });

  it("self-links toggle fires onChange", async () => {
    const onChange = vi.fn();
    render(<ChordChartControls value={CHORD_CONTROLS_DEFAULTS} onChange={onChange} />);

    const selfLinksCheckbox = screen.getByLabelText("Include self-links");
    await userEvent.click(selfLinksCheckbox);

    expect(onChange).toHaveBeenCalledWith({
      ...CHORD_CONTROLS_DEFAULTS,
      showSelfLinks: true,
    });
  });

  it("otherAvailable=false dims the Show-Other control", () => {
    const onChange = vi.fn();
    render(
      <ChordChartControls
        value={CHORD_CONTROLS_DEFAULTS}
        onChange={onChange}
        otherAvailable={false}
      />,
    );

    const showOtherLabel = screen.getByText("Show 'Other' bucket").closest("label");
    expect(showOtherLabel).toHaveClass("opacity-50");
    expect(showOtherLabel).toHaveAttribute("aria-disabled", "true");

    const showOtherCheckbox = screen.getByLabelText("Show 'Other' bucket");
    expect(showOtherCheckbox).toBeDisabled();
  });

  describe("URL helpers", () => {
    it("parseChordControlsFromSearchParams parses valid params", () => {
      const sp = new URLSearchParams("?chord.dir=in&chord.n=5");
      const parsed = parseChordControlsFromSearchParams(sp);

      expect(parsed).toEqual({
        ...CHORD_CONTROLS_DEFAULTS,
        direction: "in",
        topN: 5,
      });
    });

    it("parseChordControlsFromSearchParams falls back on invalid", () => {
      // 99 is out of bounds, should clamp to 16
      const sp = new URLSearchParams("?chord.n=99&chord.dir=invalid");
      const parsed = parseChordControlsFromSearchParams(sp);

      expect(parsed).toEqual({
        ...CHORD_CONTROLS_DEFAULTS,
        direction: "bilateral", // fallback to default
        topN: 16, // clamped
      });
    });

    it("serializeChordControlsToSearchParams omits defaults", () => {
      const sp = new URLSearchParams("?other=keep");
      const serialized = serializeChordControlsToSearchParams(CHORD_CONTROLS_DEFAULTS, sp);

      expect(serialized.toString()).toBe("other=keep");
    });

    it("serializeChordControlsToSearchParams writes non-defaults", () => {
      const sp = new URLSearchParams();
      const serialized = serializeChordControlsToSearchParams(
        {
          ...CHORD_CONTROLS_DEFAULTS,
          direction: "in",
          showSelfLinks: true,
        },
        sp,
      );

      expect(serialized.get("chord.dir")).toBe("in");
      expect(serialized.get("chord.self")).toBe("true");
      expect(serialized.has("chord.group")).toBe(false);
    });
  });
});
