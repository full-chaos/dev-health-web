import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, userEvent } from "@/test/utils";
import { AuditLogDetailDrawer } from "./AuditLogDetailDrawer";
import type { AuditLog } from "@/lib/admin/types";

function makeEntry(overrides: Partial<AuditLog> = {}): AuditLog {
    return {
        id: "al-1",
        org_id: "org-1",
        user_id: "550e8400-e29b-41d4-a716-446655440000",
        action: "team.role_change",
        resource_type: "team_member",
        resource_id: "660e8400-e29b-41d4-a716-446655440111",
        description: "Promoted a member to admin",
        changes: { old_role: "member", new_role: "admin" },
        request_metadata: { ip: "203.0.113.4" },
        status: "success",
        error_message: null,
        created_at: "2025-01-01T12:00:00Z",
        ...overrides,
    };
}

describe("AuditLogDetailDrawer", () => {
    beforeEach(() => {
        userEvent.setup();
    });
    afterEach(() => cleanup());

    it("renders nothing when closed", () => {
        render(<AuditLogDetailDrawer entry={makeEntry()} isOpen={false} onCloseAction={vi.fn()} />);
        expect(screen.queryByTestId("audit-log-detail-drawer")).not.toBeInTheDocument();
    });

    it("renders nothing when there is no selected entry", () => {
        render(<AuditLogDetailDrawer entry={null} isOpen={true} onCloseAction={vi.fn()} />);
        expect(screen.queryByTestId("audit-log-detail-drawer")).not.toBeInTheDocument();
    });

    it("shows timestamp, actor, resource, action, and status when open", () => {
        render(<AuditLogDetailDrawer entry={makeEntry()} isOpen={true} onCloseAction={vi.fn()} />);

        expect(screen.getByTestId("audit-log-detail-drawer")).toBeInTheDocument();
        expect(screen.getByText("Jan 1, 2025, 12:00 PM UTC")).toBeInTheDocument();
        expect(screen.getByText("team.role_change")).toBeInTheDocument();
        expect(screen.getByText("team_member")).toBeInTheDocument();
        expect(screen.getByText("Success")).toBeInTheDocument();
        expect(screen.getAllByText("Unresolved")).toHaveLength(2);
    });

    it("renders Changes and Request details as typed, labeled fields — never a raw JSON dump", () => {
        render(<AuditLogDetailDrawer entry={makeEntry()} isOpen={true} onCloseAction={vi.fn()} />);

        expect(screen.getByText("Old Role")).toBeInTheDocument();
        expect(screen.getByText("member")).toBeInTheDocument();
        expect(screen.getByText("Ip")).toBeInTheDocument();
        expect(screen.getByText("203.0.113.4")).toBeInTheDocument();
        expect(screen.queryByText(/"old_role":"member"/)).not.toBeInTheDocument();
    });

    it("shows customer-safe empty messages when Changes and Request details are both empty", () => {
        render(
            <AuditLogDetailDrawer
                entry={makeEntry({ changes: null, request_metadata: null })}
                isOpen={true}
                onCloseAction={vi.fn()}
            />,
        );

        expect(screen.getByText("No changes were recorded for this event.")).toBeInTheDocument();
        expect(
            screen.getByText("No request details were recorded for this event."),
        ).toBeInTheDocument();
    });

    it("offers a copy affordance for the audit entry's own id", () => {
        render(<AuditLogDetailDrawer entry={makeEntry()} isOpen={true} onCloseAction={vi.fn()} />);
        expect(screen.getByRole("button", { name: /copy audit entry id/i })).toBeInTheDocument();
    });

    it("calls onCloseAction when the close button is clicked", async () => {
        const onCloseAction = vi.fn();
        const user = userEvent.setup();
        render(
            <AuditLogDetailDrawer
                entry={makeEntry()}
                isOpen={true}
                onCloseAction={onCloseAction}
            />,
        );

        await user.click(screen.getByTitle(/close panel/i));

        expect(onCloseAction).toHaveBeenCalledTimes(1);
    });

    it("calls onCloseAction when the backdrop is clicked", async () => {
        const onCloseAction = vi.fn();
        const user = userEvent.setup();
        render(
            <AuditLogDetailDrawer
                entry={makeEntry()}
                isOpen={true}
                onCloseAction={onCloseAction}
            />,
        );

        await user.click(screen.getByRole("button", { name: /close panel/i }));

        expect(onCloseAction).toHaveBeenCalled();
    });

    it("calls onCloseAction when Escape is pressed while open", async () => {
        const onCloseAction = vi.fn();
        const user = userEvent.setup();
        render(
            <AuditLogDetailDrawer
                entry={makeEntry()}
                isOpen={true}
                onCloseAction={onCloseAction}
            />,
        );

        await user.keyboard("{Escape}");

        expect(onCloseAction).toHaveBeenCalledTimes(1);
    });

    it("does not close on Escape when the drawer is closed", async () => {
        const onCloseAction = vi.fn();
        const user = userEvent.setup();
        render(
            <AuditLogDetailDrawer
                entry={makeEntry()}
                isOpen={false}
                onCloseAction={onCloseAction}
            />,
        );

        await user.keyboard("{Escape}");

        expect(onCloseAction).not.toHaveBeenCalled();
    });
});
