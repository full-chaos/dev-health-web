/**
 * BillingSettings cancellation-flow tests — CHAOS-2839.
 *
 * Proves the `window.confirm` cancellation prompt was replaced by an
 * explicit two-choice modal: dismissing/cancelling the modal never issues a
 * cancellation request, and each explicit choice calls `cancelSubscription`
 * with the correct `immediately` argument.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithToaster, screen, userEvent, waitFor, within, cleanup } from "@/test/utils";
import type { SubscriptionDetails } from "@/lib/billing/actions";

const {
    mockGetSubscription,
    mockGetSubscriptionHistory,
    mockCancelSubscription,
    mockChangePlan,
    mockReactivateSubscription,
    mockStartTrialCheckout,
    mockListBillingPlans,
} = vi.hoisted(() => ({
    mockGetSubscription: vi.fn(),
    mockGetSubscriptionHistory: vi.fn(),
    mockCancelSubscription: vi.fn(),
    mockChangePlan: vi.fn(),
    mockReactivateSubscription: vi.fn(),
    mockStartTrialCheckout: vi.fn(),
    mockListBillingPlans: vi.fn(),
}));

vi.mock("@/lib/billing/actions", () => ({
    getSubscription: mockGetSubscription,
    getSubscriptionHistory: mockGetSubscriptionHistory,
    cancelSubscription: mockCancelSubscription,
    changePlan: mockChangePlan,
    reactivateSubscription: mockReactivateSubscription,
    startTrialCheckout: mockStartTrialCheckout,
    listBillingPlans: mockListBillingPlans,
}));

import { BillingSettings } from "./BillingSettings";

const ACTIVE_SUBSCRIPTION: SubscriptionDetails = {
    id: "sub_1",
    status: "active",
    stripe_subscription_id: "sub_stripe_1",
    stripe_customer_id: "cus_1",
    current_period_start: "2027-01-01T00:00:00Z",
    current_period_end: "2027-02-01T00:00:00Z",
    cancel_at_period_end: false,
    canceled_at: null,
    trial_start: null,
    trial_end: null,
    plan: { name: "Team" },
    price: { display_amount: "$49", interval: "month" },
};

async function renderWithActiveSubscriptionAndOpenModal() {
    renderWithToaster(<BillingSettings tier="team" />);

    await waitFor(() => {
        expect(screen.getByRole("button", { name: /^cancel$/i })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /^cancel$/i }));

    await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
}

describe("BillingSettings cancellation flow", () => {
    beforeEach(() => {
        mockGetSubscription.mockReset().mockResolvedValue({ data: ACTIVE_SUBSCRIPTION });
        mockGetSubscriptionHistory.mockReset().mockResolvedValue({ data: { items: [] } });
        mockCancelSubscription.mockReset().mockResolvedValue({ data: { status: "ok" } });
        mockChangePlan.mockReset();
        mockReactivateSubscription.mockReset();
        mockStartTrialCheckout.mockReset();
        mockListBillingPlans.mockReset();
    });

    afterEach(() => cleanup());

    it("opens an accessible dialog instead of a native confirm when Cancel is clicked", async () => {
        await renderWithActiveSubscriptionAndOpenModal();

        expect(screen.getByRole("button", { name: /cancel at period end/i })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /cancel immediately/i })).toBeInTheDocument();
        expect(mockCancelSubscription).not.toHaveBeenCalled();
    });

    it("makes no cancellation request when the dialog is dismissed", async () => {
        await renderWithActiveSubscriptionAndOpenModal();

        const dialog = screen.getByRole("dialog");
        await userEvent.click(within(dialog).getByRole("button", { name: /^cancel$/i }));

        await waitFor(() => {
            expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        });
        expect(mockCancelSubscription).not.toHaveBeenCalled();
    });

    it("calls cancelSubscription(false) when 'Cancel at period end' is chosen", async () => {
        await renderWithActiveSubscriptionAndOpenModal();

        await userEvent.click(screen.getByRole("button", { name: /cancel at period end/i }));

        await waitFor(() => {
            expect(mockCancelSubscription).toHaveBeenCalledTimes(1);
        });
        expect(mockCancelSubscription).toHaveBeenCalledWith(false);
    });

    it("calls cancelSubscription(true) when 'Cancel immediately' is chosen", async () => {
        await renderWithActiveSubscriptionAndOpenModal();

        await userEvent.click(screen.getByRole("button", { name: /cancel immediately/i }));

        await waitFor(() => {
            expect(mockCancelSubscription).toHaveBeenCalledTimes(1);
        });
        expect(mockCancelSubscription).toHaveBeenCalledWith(true);
    });
});
