/** InvoiceDetailModal component tests — CHAOS-1240. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, userEvent, cleanup } from "@/test/utils";
import { InvoiceDetailModal } from "./InvoiceDetailModal";
import type { InvoiceRecord } from "@/lib/billing/actions";

function makeInvoice(overrides: Partial<InvoiceRecord> = {}): InvoiceRecord {
    return {
        id: "inv-1",
        org_id: "org-1",
        subscription_id: null,
        stripe_invoice_id: "in_ABC",
        stripe_customer_id: "cus_ABC",
        status: "open",
        amount_due: 10000,
        amount_paid: 0,
        amount_remaining: 10000,
        currency: "usd",
        period_start: null,
        period_end: null,
        hosted_invoice_url: null,
        pdf_url: null,
        payment_intent_id: null,
        finalized_at: null,
        paid_at: null,
        voided_at: null,
        attempt_count: 0,
        metadata: {},
        created_at: "2024-01-01T00:00:00Z",
        updated_at: null,
        line_items: [
            {
                id: "li-1",
                invoice_id: "inv-1",
                description: "Team subscription",
                quantity: 1,
                amount: 10000,
                currency: "usd",
                stripe_line_item_id: "il_1",
                stripe_price_id: "price_abc",
                period_start: null,
                period_end: null,
                metadata: {},
            },
        ],
        ...overrides,
    } as unknown as InvoiceRecord;
}

describe("InvoiceDetailModal", () => {
    afterEach(() => cleanup());

    it("renders nothing when isOpen=false", () => {
        const { container } = render(
            <InvoiceDetailModal invoice={makeInvoice()} isOpen={false} onClose={vi.fn()} />,
        );

        expect(container).toBeEmptyDOMElement();
    });

    it("renders nothing when invoice is null", () => {
        const { container } = render(
            <InvoiceDetailModal invoice={null} isOpen onClose={vi.fn()} />,
        );

        expect(container).toBeEmptyDOMElement();
    });

    it("renders invoice details, header, and line items when open", () => {
        render(<InvoiceDetailModal invoice={makeInvoice()} isOpen onClose={vi.fn()} />);

        expect(screen.getByRole("heading", { name: /invoice details/i })).toBeInTheDocument();
        expect(screen.getByText("in_ABC")).toBeInTheDocument();
        expect(screen.getByText("cus_ABC")).toBeInTheDocument();
        expect(screen.getByText("open")).toBeInTheDocument();
        expect(screen.getByText("Team subscription")).toBeInTheDocument();
        expect(screen.getAllByText("$100.00").length).toBeGreaterThanOrEqual(1);
    });

    it("renders 'No line items found.' when there are no lines", () => {
        render(
            <InvoiceDetailModal
                invoice={makeInvoice({ line_items: [] })}
                isOpen
                onClose={vi.fn()}
            />,
        );

        expect(screen.getByText(/No line items found/i)).toBeInTheDocument();
    });

    it("calls onClose when the Close button is clicked", async () => {
        const onClose = vi.fn();
        render(<InvoiceDetailModal invoice={makeInvoice()} isOpen onClose={onClose} />);

        await userEvent.click(screen.getByRole("button", { name: /close/i }));

        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
