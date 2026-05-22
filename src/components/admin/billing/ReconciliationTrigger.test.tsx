/** ReconciliationTrigger component tests — CHAOS-1240. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, userEvent, cleanup } from "@/test/utils";
import { ReconciliationTrigger } from "./ReconciliationTrigger";

describe("ReconciliationTrigger", () => {
  afterEach(() => cleanup());

  it("renders the idle Run Reconciliation button when not running", () => {
    render(<ReconciliationTrigger running={false} report={null} onRun={vi.fn()} />);

    expect(screen.getByRole("button", { name: /run reconciliation/i })).toBeEnabled();
  });

  it("disables the button and shows progress label while running", () => {
    render(<ReconciliationTrigger running report={null} onRun={vi.fn()} />);

    const btn = screen.getByRole("button", { name: /reconciliation in progress/i });
    expect(btn).toBeDisabled();
  });

  it("invokes onRun when the button is clicked", async () => {
    const onRun = vi.fn().mockResolvedValue(undefined);
    render(<ReconciliationTrigger running={false} report={null} onRun={onRun} />);

    await userEvent.click(screen.getByRole("button", { name: /run reconciliation/i }));

    expect(onRun).toHaveBeenCalledTimes(1);
  });

  it("renders report counts when a report is present", () => {
    render(
      <ReconciliationTrigger
        running={false}
        report={{
          started_at: "2024-01-01T00:00:00Z",
          completed_at: "2024-01-01T00:01:00Z",
          subscriptions_checked: 12,
          invoices_checked: 34,
          refunds_checked: 5,
          mismatches: [
            {
              resource_type: "invoice",
              resource_id: "in_1",
              stripe_id: "in_stripe",
              field: "amount",
              local_value: 100,
              stripe_value: 90,
              severity: "high",
            },
            {
              resource_type: "invoice",
              resource_id: "in_2",
              stripe_id: "in_stripe_2",
              field: "status",
              local_value: "open",
              stripe_value: "paid",
              severity: "medium",
            },
          ],
          missing_local: ["loc_1"],
          missing_stripe: [],
        }}
        onRun={vi.fn()}
      />,
    );

    expect(screen.getByText(/subscriptions:\s*12/i)).toBeInTheDocument();
    expect(screen.getByText(/invoices:\s*34/i)).toBeInTheDocument();
    expect(screen.getByText(/refunds:\s*5/i)).toBeInTheDocument();
    expect(screen.getByText(/mismatches:\s*2/i)).toBeInTheDocument();
    expect(screen.getByText(/missing local:\s*1/i)).toBeInTheDocument();
    expect(screen.getByText(/missing stripe:\s*0/i)).toBeInTheDocument();
  });

  it("omits the report grid when report is null", () => {
    const { container } = render(
      <ReconciliationTrigger running={false} report={null} onRun={vi.fn()} />,
    );

    expect(container.querySelectorAll("p").length).toBe(0);
  });
});
