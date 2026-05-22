import { describe, expect, it, vi } from "vitest";
import { render, screen, userEvent } from "@/test/utils";
import { SchedulePicker } from "./SchedulePicker";

describe("SchedulePicker", () => {
  it("renders all schedule preset options", () => {
    render(<SchedulePicker value={null} timezone={null} onChange={vi.fn()} />);

    expect(screen.getByText("Manual only (no schedule)")).toBeInTheDocument();
    expect(screen.getByText("Every hour")).toBeInTheDocument();
    expect(screen.getByText("Every 6 hours")).toBeInTheDocument();
    expect(screen.getByText("Daily at midnight")).toBeInTheDocument();
    expect(screen.getByText("Weekly on Monday")).toBeInTheDocument();
    expect(screen.getByText("Custom cron expression")).toBeInTheDocument();
  });

  it("selecting a preset calls onChange with cron", async () => {
    const onChange = vi.fn();
    render(<SchedulePicker value={null} timezone={null} onChange={onChange} />);

    await userEvent.click(screen.getByLabelText("Every hour"));

    expect(onChange).toHaveBeenCalledWith("0 * * * *", expect.any(String));
  });

  it("shows custom cron input when custom is selected", async () => {
    const onChange = vi.fn();
    render(<SchedulePicker value={null} timezone={null} onChange={onChange} />);

    await userEvent.click(screen.getByLabelText("Custom cron expression"));
    expect(screen.getByLabelText("Custom cron")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Custom cron"), "15 3 * * *");
    expect(onChange).toHaveBeenLastCalledWith("15 3 * * *", expect.any(String));
  });

  it("timezone dropdown calls onChange", async () => {
    const onChange = vi.fn();
    render(<SchedulePicker value="0 0 * * *" timezone="UTC" onChange={onChange} />);

    const timezoneSelect = screen.getByLabelText("Timezone");
    const optionElements = Array.from(timezoneSelect.querySelectorAll("option"));
    const fallbackTimezone = optionElements[0]?.getAttribute("value") ?? "UTC";
    const nextTimezone =
      optionElements
        .find((option) => option.getAttribute("value") !== "UTC")
        ?.getAttribute("value") ?? fallbackTimezone;

    await userEvent.selectOptions(timezoneSelect, nextTimezone);
    expect(onChange).toHaveBeenCalledWith("0 0 * * *", nextTimezone);
  });
});
