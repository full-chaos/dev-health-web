/** Billing org name: the served `org_name` is shown; "Unresolved" when absent; never the org id (CHAOS-8956). */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@/test/utils";
import type { InvoiceRecord } from "@/lib/billing/actions";
import { InvoiceDetailModal } from "./InvoiceDetailModal";
import { InvoiceList } from "./InvoiceList";
import { RefundList } from "./RefundList";
import { SubscriptionList } from "./SubscriptionList";

vi.mock("@/lib/billing/actions", () => ({
    getInvoice: vi.fn(),
    getInvoices: vi.fn(),
    voidInvoice: vi.fn(),
    getRefunds: vi.fn(),
    getSubscriptions: vi.fn(),
}));

const ORG_ID = "5b0c7c0e-3f0a-4a53-9a0e-2d6f6f4c9a11";

const invoice = (extra: Partial<InvoiceRecord> = {}) =>
    ({
        id: "inv-1",
        org_id: ORG_ID,
        status: "open",
        amount_due: 100,
        amount_paid: 0,
        amount_remaining: 100,
        currency: "usd",
        created_at: "2024-01-01T00:00:00Z",
        line_items: [],
        ...extra,
    }) as unknown as InvoiceRecord;

const page = <T,>(items: T[]) => ({ items, total: items.length, limit: 10, offset: 0 });

afterEach(cleanup);

describe("billing org name", () => {
    it("invoice list shows the served org_name", () => {
        const { container } = render(
            <InvoiceList showOrgColumn initialData={page([invoice({ org_name: "Acme Corp" })])} />,
        );
        expect(screen.getByText("Acme Corp")).toBeTruthy();
        expect(container.textContent).not.toContain(ORG_ID);
    });

    it("invoice list shows Unresolved when org_name is null or absent", () => {
        const { container } = render(
            <InvoiceList
                showOrgColumn
                initialData={page([invoice({ org_name: null }), invoice({ id: "inv-2" })])}
            />,
        );
        expect(screen.getAllByText("Unresolved")).toHaveLength(2);
        expect(container.textContent).not.toContain(ORG_ID);
    });

    it("invoice detail shows the org name, then Unresolved", () => {
        const { rerender } = render(
            <InvoiceDetailModal
                invoice={invoice({ org_name: "Acme Corp" })}
                isOpen
                onClose={() => {}}
            />,
        );
        expect(screen.getByTestId("invoice-org-name").textContent).toBe("Acme Corp");
        rerender(<InvoiceDetailModal invoice={invoice()} isOpen onClose={() => {}} />);
        expect(screen.getByTestId("invoice-org-name").textContent).toBe("Unresolved");
        expect(document.body.textContent).not.toContain(ORG_ID);
    });

    it("subscription list shows org_name, Unresolved when absent", () => {
        const base = {
            status: "active",
            stripe_subscription_id: "sub_1",
            stripe_customer_id: "cus_1",
            org_id: ORG_ID,
        };
        const { container } = render(
            <SubscriptionList
                initialData={
                    page([
                        { ...base, id: "s1", org_name: "Acme Corp" },
                        { ...base, id: "s2" },
                    ]) as unknown as React.ComponentProps<typeof SubscriptionList>["initialData"]
                }
            />,
        );
        expect(screen.getByText("Acme Corp")).toBeTruthy();
        expect(screen.getByText("Unresolved")).toBeTruthy();
        expect(container.textContent).not.toContain(ORG_ID);
    });

    it("refund list shows org_name, Unresolved when absent", () => {
        const base = { org_id: ORG_ID, amount: 100, currency: "usd", status: "succeeded" };
        const { container } = render(
            <RefundList
                initialData={
                    page([
                        { ...base, id: "r1", org_name: "Acme Corp" },
                        { ...base, id: "r2", org_name: null },
                    ]) as unknown as React.ComponentProps<typeof RefundList>["initialData"]
                }
            />,
        );
        expect(screen.getByText("Acme Corp")).toBeTruthy();
        expect(screen.getByText("Unresolved")).toBeTruthy();
        expect(container.textContent).not.toContain(ORG_ID);
    });
});
