/** AuditDetailPanel component tests — CHAOS-1240. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, userEvent, waitFor, cleanup } from "@/test/utils";
import { AuditDetailPanel } from "./AuditDetailPanel";
import type { BillingAuditEntry } from "@/app/(app)/superadmin/billing/audit/actions";

function makeEntry(overrides: Partial<BillingAuditEntry> = {}): BillingAuditEntry {
  return {
    id: "entry-1",
    org_id: "org-1",
    actor_id: null,
    action: "reconciliation_check",
    resource_type: "invoice",
    resource_id: "in_1",
    description: "Invoice mismatch",
    stripe_event_id: null,
    local_state: { amount: 10000, status: "open" },
    stripe_state: { amount: 9000, status: "open" },
    reconciliation_status: "pending",
    created_at: new Date("2024-01-01T00:00:00Z").toISOString(),
    ...overrides,
  };
}

describe("AuditDetailPanel", () => {
  afterEach(() => cleanup());

  it("shows a helper message when no entry is selected", () => {
    render(<AuditDetailPanel entry={null} onResolveAction={vi.fn()} />);

    expect(
      screen.getByText(/Select an audit entry to inspect local vs Stripe state/i)
    ).toBeInTheDocument();
  });

  it("renders the entry description and diff rows", () => {
    render(<AuditDetailPanel entry={makeEntry()} onResolveAction={vi.fn()} />);

    expect(screen.getByText("Invoice mismatch")).toBeInTheDocument();
    expect(screen.getByText("amount")).toBeInTheDocument();
    expect(screen.getByText("status")).toBeInTheDocument();
    expect(screen.getByText("10000")).toBeInTheDocument();
    expect(screen.getByText("9000")).toBeInTheDocument();
  });

  it("shows 'No state data available' when both states are empty", () => {
    render(
      <AuditDetailPanel
        entry={makeEntry({ local_state: {}, stripe_state: {} })}
        onResolveAction={vi.fn()}
      />
    );

    expect(screen.getByText(/No state data available/i)).toBeInTheDocument();
  });

  it("does nothing on submit when resolution is empty", async () => {
    const onResolveAction = vi.fn().mockResolvedValue(undefined);
    render(<AuditDetailPanel entry={makeEntry()} onResolveAction={onResolveAction} />);

    await userEvent.click(screen.getByRole("button", { name: /resolve/i }));

    expect(onResolveAction).not.toHaveBeenCalled();
  });

  it("calls onResolveAction with the resolution text on submit, then clears the input", async () => {
    const onResolveAction = vi.fn().mockResolvedValue(undefined);
    render(<AuditDetailPanel entry={makeEntry()} onResolveAction={onResolveAction} />);

    const input = screen.getByPlaceholderText(/resolution details/i);
    await userEvent.type(input, "manual override");
    await userEvent.click(screen.getByRole("button", { name: /resolve/i }));

    await waitFor(() => {
      expect(onResolveAction).toHaveBeenCalledWith("manual override");
    });
    await waitFor(() => {
      expect(input).toHaveValue("");
    });
  });
});
