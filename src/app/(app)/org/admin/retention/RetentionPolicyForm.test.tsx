import { describe, expect, it, vi } from "vitest";
import { render, screen, userEvent } from "@/test/utils";
import { RetentionPolicyForm } from "./RetentionPolicyForm";
import type { RetentionPolicy } from "@/lib/admin/types";

function makePolicy(overrides: Partial<RetentionPolicy> = {}): RetentionPolicy {
    return {
        id: "rp-1",
        org_id: "org-1",
        resource_type: "audit_logs",
        retention_days: 90,
        description: "Keep audit logs",
        is_active: true,
        last_run_at: "2025-06-01T00:00:00Z",
        last_run_deleted_count: 12,
        next_run_at: "2025-07-01T00:00:00Z",
        created_by_id: "u-1",
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
        ...overrides,
    };
}

function renderForm(overrides: Partial<Parameters<typeof RetentionPolicyForm>[0]> = {}) {
    const onSaveAction = vi.fn();
    const onCancelAction = vi.fn();
    const props = {
        mode: "create" as const,
        resourceTypes: ["audit_logs", "metrics"],
        isSaving: false,
        onSaveAction,
        onCancelAction,
        ...overrides,
    };
    render(<RetentionPolicyForm {...props} />);
    return { onSaveAction, onCancelAction };
}

describe("RetentionPolicyForm", () => {
    it("disables Save until a resource type is selected on create", () => {
        renderForm();
        expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    });

    it("explains resource type, retention period, and expected effect while filling out the form", async () => {
        const user = userEvent.setup();
        renderForm();

        await user.selectOptions(screen.getByLabelText("Resource Type"), "audit_logs");

        expect(screen.getByText("Expected effect")).toBeInTheDocument();
        expect(
            screen.getByText(/audit_logs records older than 90 days will be automatically/i),
        ).toBeInTheDocument();
    });

    it("submits the create payload with the selected resource type and retention days", async () => {
        const user = userEvent.setup();
        const { onSaveAction } = renderForm();

        await user.selectOptions(screen.getByLabelText("Resource Type"), "metrics");
        await user.click(screen.getByRole("button", { name: "Save" }));

        expect(onSaveAction).toHaveBeenCalledWith(
            expect.objectContaining({ resource_type: "metrics", retention_days: 90 }),
        );
    });

    it("shows last run and next run, and locks the resource type, when editing", () => {
        renderForm({ mode: "edit", initialPolicy: makePolicy() });

        expect(screen.getByLabelText("Resource Type")).toBeDisabled();
        expect(screen.getByText("Last run")).toBeInTheDocument();
        expect(screen.getByText("Next run")).toBeInTheDocument();
        expect(screen.queryByText("Never")).not.toBeInTheDocument();
    });

    it("submits an update payload without resource_type when editing", async () => {
        const user = userEvent.setup();
        const { onSaveAction } = renderForm({ mode: "edit", initialPolicy: makePolicy() });

        await user.click(screen.getByRole("button", { name: "Save" }));

        expect(onSaveAction).toHaveBeenCalledWith(
            expect.not.objectContaining({ resource_type: expect.anything() }),
        );
        expect(onSaveAction).toHaveBeenCalledWith(expect.objectContaining({ retention_days: 90 }));
    });
});
