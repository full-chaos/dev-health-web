/** RetentionPolicyPage integration tests (CHAOS-2842). */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, userEvent, waitFor, within } from "@/test/utils";
import type { RetentionPolicy } from "@/lib/admin/types";

const mockListRetentionPolicies = vi.fn();
const mockCreateRetentionPolicy = vi.fn();
const mockUpdateRetentionPolicy = vi.fn();
const mockDeleteRetentionPolicy = vi.fn();
const mockExecuteRetentionPolicy = vi.fn();
const mockListRetentionResourceTypes = vi.fn();

vi.mock("@/lib/admin/server", () => ({
    listRetentionPolicies: (...args: unknown[]) => mockListRetentionPolicies(...args),
    createRetentionPolicy: (...args: unknown[]) => mockCreateRetentionPolicy(...args),
    updateRetentionPolicy: (...args: unknown[]) => mockUpdateRetentionPolicy(...args),
    deleteRetentionPolicy: (...args: unknown[]) => mockDeleteRetentionPolicy(...args),
    executeRetentionPolicy: (...args: unknown[]) => mockExecuteRetentionPolicy(...args),
    listRetentionResourceTypes: (...args: unknown[]) => mockListRetentionResourceTypes(...args),
}));

let mockTier = {
    tier: "enterprise",
    features: { custom_retention: true },
    minSyncIntervalHours: 0.25,
    limits: {},
};
vi.mock("@/components/admin/AdminTierContext", () => ({
    useAdminTier: () => mockTier,
}));

import RetentionPolicyPage from "./page";

function makePolicy(overrides: Partial<RetentionPolicy> = {}): RetentionPolicy {
    return {
        id: "rp-1",
        org_id: "org-1",
        resource_type: "audit_logs",
        retention_days: 90,
        description: null,
        is_active: true,
        last_run_at: null,
        last_run_deleted_count: null,
        next_run_at: null,
        created_by_id: null,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
        ...overrides,
    };
}

function respondWith(items: RetentionPolicy[]) {
    return { data: { items, total: items.length, limit: 50, offset: 0 }, error: undefined };
}

describe("RetentionPolicyPage", () => {
    beforeEach(() => {
        mockListRetentionPolicies.mockReset();
        mockCreateRetentionPolicy.mockReset();
        mockUpdateRetentionPolicy.mockReset();
        mockDeleteRetentionPolicy.mockReset();
        mockExecuteRetentionPolicy.mockReset();
        mockListRetentionResourceTypes.mockReset();
        mockListRetentionResourceTypes.mockResolvedValue({ data: ["audit_logs", "metrics"] });
        mockTier = {
            tier: "enterprise",
            features: { custom_retention: true },
            minSyncIntervalHours: 0.25,
            limits: {},
        };
    });
    afterEach(() => cleanup());

    it("renders the locked upsell state when the enterprise feature gate is closed", async () => {
        mockTier = { ...mockTier, features: { custom_retention: false } };
        mockListRetentionPolicies.mockResolvedValue(respondWith([]));

        render(<RetentionPolicyPage />);

        expect(
            await screen.findByRole("heading", { name: "Feature unavailable" }),
        ).toBeInTheDocument();
        expect(
            screen.getByText("Contact an administrator to enable custom retention for this plan."),
        ).toBeInTheDocument();
    });

    it("loads and renders policies on mount when the gate is open", async () => {
        mockListRetentionPolicies.mockResolvedValue(respondWith([makePolicy()]));

        render(<RetentionPolicyPage />);

        await waitFor(() => expect(screen.getByText("audit_logs")).toBeInTheDocument());
    });

    it("shows a customer-safe empty state when there are no policies", async () => {
        mockListRetentionPolicies.mockResolvedValue(respondWith([]));

        render(<RetentionPolicyPage />);

        await waitFor(() =>
            expect(screen.getByText("No retention policies configured.")).toBeInTheDocument(),
        );
    });

    it("creates a new policy through the form", async () => {
        mockListRetentionPolicies.mockResolvedValueOnce(respondWith([]));
        mockCreateRetentionPolicy.mockResolvedValue({ data: makePolicy(), error: undefined });
        mockListRetentionPolicies.mockResolvedValueOnce(respondWith([makePolicy()]));
        const user = userEvent.setup();

        render(<RetentionPolicyPage />);
        await waitFor(() => expect(mockListRetentionResourceTypes).toHaveBeenCalled());

        await user.click(screen.getByRole("button", { name: "Add Policy" }));
        await user.selectOptions(screen.getByLabelText("Resource Type"), "audit_logs");
        await user.click(screen.getByRole("button", { name: "Save" }));

        await waitFor(() =>
            expect(mockCreateRetentionPolicy).toHaveBeenCalledWith(
                expect.objectContaining({ resource_type: "audit_logs", retention_days: 90 }),
            ),
        );
    });

    it("deletes a policy only after explicit confirmation", async () => {
        const policy = makePolicy();
        mockListRetentionPolicies.mockResolvedValue(respondWith([policy]));
        mockDeleteRetentionPolicy.mockResolvedValue({ data: undefined, error: undefined });
        const user = userEvent.setup();

        render(<RetentionPolicyPage />);
        await waitFor(() => expect(screen.getByText("audit_logs")).toBeInTheDocument());

        await user.click(screen.getByRole("button", { name: "Delete" }));
        const dialog = screen.getByRole("dialog", { name: "Delete this retention policy?" });
        expect(mockDeleteRetentionPolicy).not.toHaveBeenCalled();

        await user.click(within(dialog).getByRole("button", { name: "Delete" }));
        await waitFor(() => expect(mockDeleteRetentionPolicy).toHaveBeenCalledWith("rp-1"));
    });

    it("runs the dry-run-then-confirm manual run flow end to end", async () => {
        const policy = makePolicy();
        mockListRetentionPolicies.mockResolvedValue(respondWith([policy]));
        mockExecuteRetentionPolicy.mockImplementation((_id: string, dryRun: boolean) =>
            Promise.resolve(
                dryRun
                    ? { data: { deleted_count: 7, error: null } }
                    : { data: { deleted_count: 7, error: null } },
            ),
        );
        const user = userEvent.setup();

        render(<RetentionPolicyPage />);
        await waitFor(() => expect(screen.getByText("audit_logs")).toBeInTheDocument());

        await user.click(screen.getByRole("button", { name: "Run Now" }));

        expect(mockExecuteRetentionPolicy).toHaveBeenCalledWith("rp-1", true);
        await waitFor(() => expect(screen.getByText("7")).toBeInTheDocument());

        const dialog = screen.getByRole("dialog", { name: "Run retention policy now?" });
        await user.click(within(dialog).getByRole("button", { name: "Run Now" }));

        await waitFor(() => expect(mockExecuteRetentionPolicy).toHaveBeenCalledWith("rp-1", false));
    });

    it("surfaces a 200-OK embedded execute failure instead of silently refreshing", async () => {
        const policy = makePolicy();
        mockListRetentionPolicies.mockResolvedValue(respondWith([policy]));
        mockExecuteRetentionPolicy.mockImplementation((_id: string, dryRun: boolean) =>
            Promise.resolve(
                dryRun
                    ? { data: { deleted_count: 7, error: null } }
                    : { data: { deleted_count: 0, error: "Policy is inactive" } },
            ),
        );
        const user = userEvent.setup();

        render(<RetentionPolicyPage />);
        await waitFor(() => expect(screen.getByText("audit_logs")).toBeInTheDocument());

        await user.click(screen.getByRole("button", { name: "Run Now" }));
        await waitFor(() => expect(screen.getByText("7")).toBeInTheDocument());

        const dialog = screen.getByRole("dialog", { name: "Run retention policy now?" });
        await user.click(within(dialog).getByRole("button", { name: "Run Now" }));

        await waitFor(() => expect(mockExecuteRetentionPolicy).toHaveBeenCalledWith("rp-1", false));
        await waitFor(() => expect(screen.getByText("Policy is inactive")).toBeInTheDocument());
        // Only the initial mount call + the dry-run should have listed policies —
        // a failed execute must not silently trigger a refetch as if it succeeded.
        expect(mockListRetentionPolicies).toHaveBeenCalledTimes(1);
    });
});

describe("RetentionPolicyPage design A6/A7 (CHAOS-8239)", () => {
    beforeEach(() => {
        mockListRetentionPolicies.mockReset();
        mockDeleteRetentionPolicy.mockReset();
        mockUpdateRetentionPolicy.mockReset();
    });
    afterEach(() => cleanup());

    it("has the h1 Organization, the add action in the header as the primary button with the icon first, and a section card", async () => {
        mockListRetentionPolicies.mockResolvedValue(respondWith([makePolicy()]));
        render(<RetentionPolicyPage />);
        await waitFor(() => expect(screen.getByText("audit_logs")).toBeInTheDocument());

        expect(screen.getByRole("heading", { level: 1, name: "Organization" })).toBeInTheDocument();
        const add = within(screen.getByTestId("page-header")).getByRole("button", {
            name: "Add Policy",
        });
        expect(add.firstElementChild?.querySelector("svg") ?? null).not.toBeNull();
        expect(add.className).toContain("bg-(--action)");
        expect(screen.getByTestId("admin-pager")).toHaveTextContent("Showing 1–1");
    });

    it("says one plain sentence with a Retry that re-runs the load, and never prints the backend text", async () => {
        mockListRetentionPolicies.mockResolvedValueOnce({
            data: undefined,
            error: "GET /api/v1/admin/x 502 upstream",
        });
        const user = userEvent.setup();
        const { container } = render(<RetentionPolicyPage />);

        expect(
            await screen.findByText(/Retention policies could not be loaded\. Retry/u),
        ).toBeInTheDocument();
        expect(container.textContent).not.toContain("502");

        mockListRetentionPolicies.mockResolvedValueOnce(respondWith([makePolicy()]));
        await user.click(screen.getByRole("button", { name: "Retry" }));

        await waitFor(() => expect(screen.getByText("audit_logs")).toBeInTheDocument());
        expect(screen.queryByText(/could not be loaded/u)).toBeNull();
    });

    it("shows a plan-gate answer as a warning notice with the served sentence, not a danger error", async () => {
        mockListRetentionPolicies.mockResolvedValueOnce({
            data: undefined,
            error: "This feature requires the enterprise plan (current plan: community).",
        });
        render(<RetentionPolicyPage />);

        const text = await screen.findByText(
            "This feature requires the enterprise plan (current plan: community).",
        );
        expect(text.closest("[data-notice-variant]")).toHaveAttribute(
            "data-notice-variant",
            "warn",
        );
    });

    it("keeps the served message of a failed action (feedback the admin must read)", async () => {
        mockListRetentionPolicies.mockResolvedValue(respondWith([makePolicy()]));
        mockUpdateRetentionPolicy.mockResolvedValue({
            data: undefined,
            error: "Rule overlaps an existing rule",
        });
        const user = userEvent.setup();
        render(<RetentionPolicyPage />);
        await waitFor(() => expect(screen.getByText("audit_logs")).toBeInTheDocument());

        await user.click(screen.getByRole("button", { name: /^(Disable|Enable)/u }));
        await user.click(
            within(await screen.findByRole("dialog")).getByRole("button", {
                name: /^(Disable|Enable)/u,
            }),
        );

        expect(await screen.findByText("Rule overlaps an existing rule")).toBeInTheDocument();
        expect(screen.queryByText(/could not be loaded/u)).toBeNull();
    });

    it("shows the dashed empty state and no pager when there are no rows", async () => {
        mockListRetentionPolicies.mockResolvedValue(respondWith([]));
        render(<RetentionPolicyPage />);

        expect(
            await screen.findByTestId("data-state-detector-enabled-no-findings"),
        ).toBeInTheDocument();
        expect(screen.queryByTestId("admin-pager")).toBeNull();
    });

    it("draws the status as a pill with an icon, and Delete as the danger outline that wins over the secondary look", async () => {
        mockListRetentionPolicies.mockResolvedValue(respondWith([makePolicy()]));
        render(<RetentionPolicyPage />);

        const pill = await screen.findByText("Active");
        expect(pill.firstElementChild?.tagName.toLowerCase()).toBe("svg");
        expect(pill.className).not.toMatch(/(^|\s)border/u);
        const del = screen.getByRole("button", { name: "Delete" });
        expect(del).toHaveClass("text-(--negative)!");
        expect(del).toHaveClass("hover:bg-(--negative-wash)!");
    });
});
