import { describe, expect, it, vi } from "vitest";
import { render, screen, userEvent, waitFor } from "@/test/utils";
import { RetentionRunConfirm } from "./RetentionRunConfirm";
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

describe("RetentionRunConfirm", () => {
    it("renders nothing when no policy is targeted", () => {
        render(
            <RetentionRunConfirm
                policy={null}
                onDryRunAction={vi.fn()}
                onExecuteAction={vi.fn()}
                onCloseAction={vi.fn()}
            />,
        );
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("fetches a real dry-run count and blocks confirm until it resolves", async () => {
        const onDryRunAction = vi
            .fn()
            .mockResolvedValue({ data: { deleted_count: 42, error: null } });
        render(
            <RetentionRunConfirm
                policy={makePolicy()}
                onDryRunAction={onDryRunAction}
                onExecuteAction={vi.fn()}
                onCloseAction={vi.fn()}
            />,
        );

        expect(screen.getByRole("button", { name: "Run Now" })).toBeDisabled();
        expect(onDryRunAction).toHaveBeenCalledWith("rp-1");

        await waitFor(() => expect(screen.getByText("42")).toBeInTheDocument());
        expect(screen.getByText(/42 audit_logs record\(s\)/i)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Run Now" })).toBeEnabled();
    });

    it("only calls onExecuteAction after the admin confirms, and closes afterward", async () => {
        const onDryRunAction = vi
            .fn()
            .mockResolvedValue({ data: { deleted_count: 5, error: null } });
        const onExecuteAction = vi
            .fn()
            .mockResolvedValue({ data: { deleted_count: 5, error: null } });
        const onCloseAction = vi.fn();
        const user = userEvent.setup();

        render(
            <RetentionRunConfirm
                policy={makePolicy()}
                onDryRunAction={onDryRunAction}
                onExecuteAction={onExecuteAction}
                onCloseAction={onCloseAction}
            />,
        );

        await waitFor(() => expect(screen.getByRole("button", { name: "Run Now" })).toBeEnabled());
        expect(onExecuteAction).not.toHaveBeenCalled();

        await user.click(screen.getByRole("button", { name: "Run Now" }));

        await waitFor(() => expect(onExecuteAction).toHaveBeenCalledWith("rp-1"));
        await waitFor(() => expect(onCloseAction).toHaveBeenCalledTimes(1));
    });

    it("keeps confirm disabled and shows the error when the dry run fails", async () => {
        const onDryRunAction = vi.fn().mockResolvedValue({ error: "Backend unavailable" });
        render(
            <RetentionRunConfirm
                policy={makePolicy()}
                onDryRunAction={onDryRunAction}
                onExecuteAction={vi.fn()}
                onCloseAction={vi.fn()}
            />,
        );

        await waitFor(() => expect(screen.getByText("Backend unavailable")).toBeInTheDocument());
        expect(screen.getByRole("button", { name: "Run Now" })).toBeDisabled();
    });

    it("dismisses via Cancel without executing", async () => {
        const onDryRunAction = vi
            .fn()
            .mockResolvedValue({ data: { deleted_count: 1, error: null } });
        const onExecuteAction = vi.fn();
        const onCloseAction = vi.fn();
        const user = userEvent.setup();

        render(
            <RetentionRunConfirm
                policy={makePolicy()}
                onDryRunAction={onDryRunAction}
                onExecuteAction={onExecuteAction}
                onCloseAction={onCloseAction}
            />,
        );

        const cancelButtons = screen.getAllByRole("button", { name: "Cancel" });
        const cancelButton = cancelButtons.find((button) => button.textContent === "Cancel");
        if (!cancelButton) throw new Error("Expected a labeled Cancel button.");
        await user.click(cancelButton);
        expect(onExecuteAction).not.toHaveBeenCalled();
        expect(onCloseAction).toHaveBeenCalledTimes(1);
    });
});
