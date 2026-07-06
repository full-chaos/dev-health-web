import { describe, expect, it, vi } from "vitest";
import { render, screen, userEvent, within } from "@/test/utils";
import { RetentionPolicyTable } from "./RetentionPolicyTable";
import type { RetentionPolicy } from "@/lib/admin/types";

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

function renderTable(overrides: Partial<Parameters<typeof RetentionPolicyTable>[0]> = {}) {
    const onEditAction = vi.fn();
    const onToggleAction = vi.fn();
    const onDeleteAction = vi.fn();
    const onRequestRunAction = vi.fn();
    const props = {
        policies: [makePolicy()],
        togglingId: null,
        onEditAction,
        onToggleAction,
        onDeleteAction,
        onRequestRunAction,
        formatDate: (d: string | null) => d ?? "--",
        ...overrides,
    };
    render(<RetentionPolicyTable {...props} />);
    return { onEditAction, onToggleAction, onDeleteAction, onRequestRunAction };
}

describe("RetentionPolicyTable", () => {
    it("renders a customer-safe empty state when there are no policies", () => {
        renderTable({ policies: [] });
        expect(screen.getByText("No retention policies configured.")).toBeInTheDocument();
    });

    it("fires onRequestRunAction with the row's policy", async () => {
        const user = userEvent.setup();
        const policy = makePolicy();
        const { onRequestRunAction } = renderTable({ policies: [policy] });

        await user.click(screen.getByRole("button", { name: "Run Now" }));
        expect(onRequestRunAction).toHaveBeenCalledWith(policy);
    });

    it("requires explicit confirmation, with consequence copy, before disabling an active policy", async () => {
        const user = userEvent.setup();
        const policy = makePolicy({ is_active: true });
        const { onToggleAction } = renderTable({ policies: [policy] });

        await user.click(screen.getByRole("button", { name: "Disable" }));
        expect(onToggleAction).not.toHaveBeenCalled();
        const dialog = screen.getByRole("dialog", { name: "Disable this retention policy?" });
        expect(screen.getByText(/stops future automatic deletion/i)).toBeInTheDocument();

        await user.click(within(dialog).getByRole("button", { name: "Disable" }));
        expect(onToggleAction).toHaveBeenCalledWith(policy);
    });

    it("requires explicit confirmation, with consequence copy, before deleting a policy", async () => {
        const user = userEvent.setup();
        const policy = makePolicy();
        const { onDeleteAction } = renderTable({ policies: [policy] });

        await user.click(screen.getByRole("button", { name: "Delete" }));
        expect(onDeleteAction).not.toHaveBeenCalled();
        const dialog = screen.getByRole("dialog", { name: "Delete this retention policy?" });
        expect(screen.getByText(/does not restore any records/i)).toBeInTheDocument();

        await user.click(within(dialog).getByRole("button", { name: "Delete" }));
        expect(onDeleteAction).toHaveBeenCalledWith(policy);
    });
});
