import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/utils";
import userEvent from "@testing-library/user-event";
import { FilterPills, type FilterPillOption } from "./FilterPills";

const options: FilterPillOption[] = [
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
];

describe("FilterPills", () => {
  it("renders a radiogroup with one radio per option", () => {
    render(
      <FilterPills options={options} value="week" onChange={vi.fn()} ariaLabel="Time grain" />,
    );
    expect(screen.getByRole("radiogroup", { name: "Time grain" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
  });

  it("marks the selected option with aria-checked=true", () => {
    render(
      <FilterPills options={options} value="month" onChange={vi.fn()} ariaLabel="Time grain" />,
    );
    expect(screen.getByRole("radio", { name: "Month" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Week" })).toHaveAttribute("aria-checked", "false");
  });

  it("calls onChange with the option id", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <FilterPills options={options} value="week" onChange={onChange} ariaLabel="Time grain" />,
    );
    await user.click(screen.getByRole("radio", { name: "Month" }));
    expect(onChange).toHaveBeenCalledWith("month");
  });

  it("renders an optional leading label and test id", () => {
    render(
      <FilterPills
        options={options}
        value="week"
        onChange={vi.fn()}
        ariaLabel="Time grain"
        leadingLabel="Grain"
        testId="grain-pills"
      />,
    );
    expect(screen.getByText("Grain")).toBeInTheDocument();
    expect(screen.getByTestId("grain-pills")).toBeInTheDocument();
  });
});
