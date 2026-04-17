/** RefundDialog component tests — CHAOS-1240. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithToaster, screen, userEvent, waitFor, cleanup } from "@/test/utils";

const { mockCreateRefund } = vi.hoisted(() => ({
  mockCreateRefund: vi.fn(),
}));

vi.mock("@/lib/billing/actions", () => ({
  createRefund: mockCreateRefund,
}));

import { RefundDialog } from "./RefundDialog";

describe("RefundDialog", () => {
  beforeEach(() => {
    mockCreateRefund.mockReset();
  });

  afterEach(() => cleanup());

  it("renders only the trigger button when closed", () => {
    renderWithToaster(
      <RefundDialog
        invoiceId="in_1"
        invoiceAmountCents={10000}
        refundableAmountCents={10000}
      />
    );

    expect(screen.getByRole("button", { name: /issue refund/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /issue refund/i })).not.toBeInTheDocument();
  });

  it("opens the dialog when the trigger button is clicked", async () => {
    renderWithToaster(
      <RefundDialog
        invoiceId="in_1"
        invoiceAmountCents={10000}
        refundableAmountCents={10000}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /issue refund/i }));

    expect(screen.getByRole("heading", { name: /issue refund/i })).toBeInTheDocument();
    expect(screen.getByText(/invoice total: \$100\.00/i)).toBeInTheDocument();
    expect(screen.getByText(/refundable balance: \$100\.00/i)).toBeInTheDocument();
  });

  it("reveals the amount input when 'Partial refund' is toggled", async () => {
    renderWithToaster(
      <RefundDialog
        invoiceId="in_1"
        invoiceAmountCents={10000}
        refundableAmountCents={10000}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /issue refund/i }));
    await userEvent.click(screen.getByLabelText(/partial refund/i));

    expect(screen.getByLabelText(/amount \(usd\)/i)).toBeInTheDocument();
  });

  it("shows an error toast when the partial amount exceeds refundable balance", async () => {
    renderWithToaster(
      <RefundDialog
        invoiceId="in_1"
        invoiceAmountCents={10000}
        refundableAmountCents={5000}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /issue refund/i }));
    await userEvent.click(screen.getByLabelText(/partial refund/i));

    const amountInput = screen.getByLabelText(/amount \(usd\)/i);
    await userEvent.clear(amountInput);
    await userEvent.type(amountInput, "100");

    await userEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => {
      expect(
        screen.getAllByText(/Amount cannot exceed the refundable balance/i).length
      ).toBeGreaterThan(0);
    });
    expect(mockCreateRefund).not.toHaveBeenCalled();
  });

  it("submits a full refund and calls onRefundCreated on success", async () => {
    const onRefundCreated = vi.fn();
    mockCreateRefund.mockResolvedValue({
      data: {
        id: "re_1",
        org_id: "org-1",
        invoice_id: "in_1",
        subscription_id: null,
        stripe_refund_id: "re_stripe",
        stripe_charge_id: "ch_1",
        stripe_payment_intent_id: null,
        amount: 10000,
        currency: "usd",
        status: "succeeded",
        reason: "requested_by_customer",
        description: null,
        failure_reason: null,
        initiated_by: "user",
        metadata: {},
        created_at: null,
        updated_at: null,
      },
      error: null,
    });

    renderWithToaster(
      <RefundDialog
        invoiceId="in_1"
        invoiceAmountCents={10000}
        refundableAmountCents={10000}
        onRefundCreated={onRefundCreated}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /issue refund/i }));
    await userEvent.click(screen.getByRole("button", { name: /continue/i }));
    await userEvent.click(screen.getByRole("button", { name: /confirm refund/i }));

    await waitFor(() => {
      expect(mockCreateRefund).toHaveBeenCalledTimes(1);
    });
    expect(mockCreateRefund).toHaveBeenCalledWith(
      expect.objectContaining({
        invoiceId: "in_1",
        amount: 10000,
        reason: "requested_by_customer",
      })
    );
    await waitFor(() => {
      expect(screen.getByText(/Refund issued/i)).toBeInTheDocument();
    });
    expect(onRefundCreated).toHaveBeenCalledWith(
      expect.objectContaining({ id: "re_1" })
    );
  });

  it("shows an error toast when createRefund returns an error", async () => {
    mockCreateRefund.mockResolvedValue({
      data: null,
      error: "Stripe is unavailable",
    });

    renderWithToaster(
      <RefundDialog
        invoiceId="in_1"
        invoiceAmountCents={10000}
        refundableAmountCents={10000}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /issue refund/i }));
    await userEvent.click(screen.getByRole("button", { name: /continue/i }));
    await userEvent.click(screen.getByRole("button", { name: /confirm refund/i }));

    await waitFor(() => {
      expect(screen.getByText(/Stripe is unavailable/i)).toBeInTheDocument();
    });
  });

  it("lets the user change the refund reason", async () => {
    renderWithToaster(
      <RefundDialog
        invoiceId="in_1"
        invoiceAmountCents={10000}
        refundableAmountCents={10000}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /issue refund/i }));

    const select = screen.getByLabelText(/reason/i) as HTMLSelectElement;
    await userEvent.selectOptions(select, "duplicate");

    expect(select.value).toBe("duplicate");
  });
});
