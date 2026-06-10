/** PlanManager component tests — CHAOS-1240. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithToaster, screen, userEvent, waitFor, cleanup } from "@/test/utils";

const {
    mockCreateBillingPlan,
    mockDeleteBillingPlan,
    mockListBillingPlans,
    mockPullPlansFromStripe,
    mockSyncBillingPlanToStripe,
    mockUpdateBillingPlan,
} = vi.hoisted(() => ({
    mockCreateBillingPlan: vi.fn(),
    mockDeleteBillingPlan: vi.fn(),
    mockListBillingPlans: vi.fn(),
    mockPullPlansFromStripe: vi.fn(),
    mockSyncBillingPlanToStripe: vi.fn(),
    mockUpdateBillingPlan: vi.fn(),
}));

vi.mock("@/lib/billing/actions", () => ({
    createBillingPlan: mockCreateBillingPlan,
    deleteBillingPlan: mockDeleteBillingPlan,
    listBillingPlans: mockListBillingPlans,
    pullPlansFromStripe: mockPullPlansFromStripe,
    syncBillingPlanToStripe: mockSyncBillingPlanToStripe,
    updateBillingPlan: mockUpdateBillingPlan,
}));

import { PlanManager } from "./PlanManager";
import type { BillingPlanRecord } from "@/lib/billing/actions";

function makePlan(overrides: Partial<BillingPlanRecord> = {}): BillingPlanRecord {
    return {
        id: "plan-1",
        key: "team-monthly",
        name: "Team Monthly",
        description: "Team tier monthly plan",
        tier: "team",
        is_active: true,
        display_order: 10,
        stripe_product_id: "prod_123",
        metadata: {},
        prices: [
            {
                id: "price-1",
                plan_id: "plan-1",
                interval: "monthly",
                amount: 4900,
                currency: "usd",
                is_active: true,
                stripe_price_id: "price_stripe_1",
            },
        ],
        bundles: [],
        ...overrides,
    };
}

describe("PlanManager", () => {
    beforeEach(() => {
        mockCreateBillingPlan.mockReset();
        mockDeleteBillingPlan.mockReset();
        mockListBillingPlans.mockReset();
        mockPullPlansFromStripe.mockReset();
        mockSyncBillingPlanToStripe.mockReset();
        mockUpdateBillingPlan.mockReset();
    });

    afterEach(() => cleanup());

    it("renders the list of initial plans sorted by display_order", () => {
        const plans = [
            makePlan({ id: "p2", name: "Enterprise", display_order: 20 }),
            makePlan({ id: "p1", name: "Team", display_order: 10 }),
        ];
        renderWithToaster(<PlanManager initialPlans={plans} />);

        const headings = screen.getAllByRole("heading", { level: 3 });
        expect(headings.map((h) => h.textContent)).toEqual(["Team", "Enterprise"]);
    });

    it("creates a new plan and shows a success toast", async () => {
        mockCreateBillingPlan.mockResolvedValue({
            data: makePlan({ id: "new-plan", key: "starter", name: "Starter" }),
        });

        renderWithToaster(<PlanManager initialPlans={[]} />);

        await userEvent.type(screen.getByPlaceholderText(/plan name/i), "Starter");
        await userEvent.type(screen.getByPlaceholderText(/plan key/i), "starter");

        await userEvent.click(screen.getByRole("button", { name: /create plan/i }));

        await waitFor(() => {
            expect(mockCreateBillingPlan).toHaveBeenCalled();
        });
        await waitFor(() => {
            expect(screen.getByText(/Plan created/i)).toBeInTheDocument();
        });
    });

    it("shows an error toast when prices_json is invalid", async () => {
        renderWithToaster(<PlanManager initialPlans={[]} />);

        await userEvent.type(screen.getByPlaceholderText(/plan name/i), "Starter");
        await userEvent.type(screen.getByPlaceholderText(/plan key/i), "starter");

        const pricesInput = screen.getByPlaceholderText(/monthly/i);
        await userEvent.clear(pricesInput);
        await userEvent.type(pricesInput, "not-json");

        await userEvent.click(screen.getByRole("button", { name: /create plan/i }));

        await waitFor(() => {
            expect(screen.getByText(/Unexpected token|Invalid prices JSON/i)).toBeInTheDocument();
        });
        expect(mockCreateBillingPlan).not.toHaveBeenCalled();
    });

    it("archives an active plan and shows an archived toast", async () => {
        mockDeleteBillingPlan.mockResolvedValue({
            data: { deleted: true },
        });

        const plan = makePlan({ id: "p1", name: "Team Monthly" });
        renderWithToaster(<PlanManager initialPlans={[plan]} />);

        await userEvent.click(screen.getByRole("button", { name: /archive/i }));

        await waitFor(() => {
            expect(mockDeleteBillingPlan).toHaveBeenCalledWith("p1");
        });
        await waitFor(() => {
            expect(screen.getByText(/Plan archived/i)).toBeInTheDocument();
        });
    });

    it("syncs a plan to Stripe and shows a success toast", async () => {
        mockSyncBillingPlanToStripe.mockResolvedValue({
            data: makePlan({ id: "p1", stripe_product_id: "prod_new" }),
        });

        const plan = makePlan({ id: "p1" });
        renderWithToaster(<PlanManager initialPlans={[plan]} />);

        await userEvent.click(screen.getByRole("button", { name: /sync stripe/i }));

        await waitFor(() => {
            expect(mockSyncBillingPlanToStripe).toHaveBeenCalledWith("p1");
        });
        await waitFor(() => {
            expect(screen.getByText(/Plan synced to Stripe/i)).toBeInTheDocument();
        });
    });

    it("pulls plans from Stripe and reports the result", async () => {
        mockPullPlansFromStripe.mockResolvedValue({
            data: {
                created: [{ id: "x" }, { id: "y" }],
                updated: [],
                skipped: [],
                errors: [],
            },
        });
        mockListBillingPlans.mockResolvedValue({ data: [] });

        renderWithToaster(<PlanManager initialPlans={[]} />);

        await userEvent.click(screen.getByRole("button", { name: /pull from stripe/i }));

        await waitFor(() => {
            expect(mockPullPlansFromStripe).toHaveBeenCalled();
        });
        await waitFor(() => {
            expect(screen.getByText(/Pull complete: 2 created/i)).toBeInTheDocument();
        });
    });

    it("enters edit mode when Edit is clicked and shows a Cancel edit button", async () => {
        const plan = makePlan({ id: "p1", name: "Team Monthly" });
        renderWithToaster(<PlanManager initialPlans={[plan]} />);

        await userEvent.click(screen.getByRole("button", { name: /^edit$/i }));

        expect(screen.getByRole("button", { name: /cancel edit/i })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /save changes/i })).toBeInTheDocument();
    });
});
