import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@/test/utils";
import userEvent from "@testing-library/user-event";
import { AuditLogFilters } from "./AuditLogFilters";

describe("AuditLogFilters — admin variant", () => {
  it("renders labelled action and resource type inputs", () => {
    render(<AuditLogFilters variant="admin" onFilter={vi.fn()} />);
    expect(screen.getByLabelText(/action/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/resource type/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/start date/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/end date/i)).toBeInTheDocument();
  });

  it("calls onFilter with typed values on submit", async () => {
    const onFilter = vi.fn();
    const user = userEvent.setup();
    render(<AuditLogFilters variant="admin" onFilter={onFilter} />);

    await user.type(screen.getByLabelText(/action/i), "org.create");
    // Use querySelector since <form> needs a name attr for getByRole("form")
    fireEvent.submit(document.querySelector("form")!);

    expect(onFilter).toHaveBeenCalledWith(expect.objectContaining({ action: "org.create" }));
  });

  it("omits empty fields from the filter call", () => {
    const onFilter = vi.fn();
    render(<AuditLogFilters variant="admin" onFilter={onFilter} />);
    fireEvent.submit(document.querySelector("form")!);

    expect(onFilter).toHaveBeenCalledWith({
      action: undefined,
      resource_type: undefined,
      start_date: undefined,
      end_date: undefined,
    });
  });

  it("renders the Search button", () => {
    render(<AuditLogFilters variant="admin" onFilter={vi.fn()} />);
    expect(screen.getByRole("button", { name: /search/i })).toBeInTheDocument();
  });
});

describe("AuditLogFilters — billing variant", () => {
  it("renders the reconciliation status select", () => {
    render(<AuditLogFilters variant="billing" onApply={vi.fn()} />);
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.getByText("any status")).toBeInTheDocument();
  });

  it("calls onApply with billing filter shape on submit", async () => {
    const onApply = vi.fn();
    const user = userEvent.setup();
    render(<AuditLogFilters variant="billing" onApply={onApply} />);

    await user.selectOptions(screen.getByRole("combobox"), "matched");
    fireEvent.submit(document.querySelector("form")!);

    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ reconciliation_status: "matched" }),
    );
  });

  it("renders the Apply button", () => {
    render(<AuditLogFilters variant="billing" onApply={vi.fn()} />);
    expect(screen.getByRole("button", { name: /apply/i })).toBeInTheDocument();
  });

  it("omits empty fields from the apply call", () => {
    const onApply = vi.fn();
    render(<AuditLogFilters variant="billing" onApply={onApply} />);
    fireEvent.submit(document.querySelector("form")!);

    expect(onApply).toHaveBeenCalledWith({
      resource_type: undefined,
      action: undefined,
      reconciliation_status: undefined,
      from_date: undefined,
      to_date: undefined,
    });
  });
});
