import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, userEvent } from "@/test/utils";
import { AuditLogEmptyState } from "./AuditLogEmptyState";

describe("AuditLogEmptyState", () => {
    afterEach(() => cleanup());

    it("shows a distinct initial empty state with no reset action when no filters are applied", () => {
        render(<AuditLogEmptyState hasActiveFilters={false} onResetAction={vi.fn()} />);

        expect(screen.getByTestId("audit-log-empty-initial")).toBeInTheDocument();
        expect(screen.getByText("No audit events recorded yet")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /reset filters/i })).not.toBeInTheDocument();
    });

    it("shows a distinct filtered empty state with a reset action when filters are applied", () => {
        render(<AuditLogEmptyState hasActiveFilters={true} onResetAction={vi.fn()} />);

        expect(screen.getByTestId("audit-log-empty-filtered")).toBeInTheDocument();
        expect(screen.getByText("No audit events match these filters")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /reset filters/i })).toBeInTheDocument();
    });

    it("renders different titles for the initial vs filtered states", () => {
        const { rerender } = render(
            <AuditLogEmptyState hasActiveFilters={false} onResetAction={vi.fn()} />,
        );
        const initialTitle = screen.getByText("No audit events recorded yet").textContent;

        rerender(<AuditLogEmptyState hasActiveFilters={true} onResetAction={vi.fn()} />);
        const filteredTitle = screen.getByText("No audit events match these filters").textContent;

        expect(initialTitle).not.toBe(filteredTitle);
    });

    it("calls onResetAction when the Reset filters action is clicked", async () => {
        const onResetAction = vi.fn();
        const user = userEvent.setup();
        render(<AuditLogEmptyState hasActiveFilters={true} onResetAction={onResetAction} />);

        await user.click(screen.getByRole("button", { name: /reset filters/i }));

        expect(onResetAction).toHaveBeenCalledTimes(1);
    });
});
