import { describe, expect, it } from "vitest";
import { render, screen } from "@/test/utils";

import { AdminHeader } from "./AdminHeader";

describe("AdminHeader", () => {
  it("renders without crashing", () => {
    render(<AdminHeader title="Billing" />);

    expect(screen.getByRole("heading", { name: "Billing" })).toBeInTheDocument();
  });

  it("renders with title and description", () => {
    render(
      <AdminHeader title="Billing" description="Manage plan, invoices, and payment methods." />,
    );

    expect(screen.getByRole("heading", { name: "Billing" })).toBeInTheDocument();
    expect(screen.getByText("Manage plan, invoices, and payment methods.")).toBeInTheDocument();
  });

  it("handles optional children gracefully", () => {
    render(
      <AdminHeader title="Billing">
        <button type="button">Upgrade plan</button>
      </AdminHeader>,
    );

    expect(screen.getByRole("button", { name: "Upgrade plan" })).toBeInTheDocument();
  });
});
