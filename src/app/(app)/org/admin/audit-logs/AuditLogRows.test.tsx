import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, userEvent } from "@/test/utils";
import { AuditLogRows } from "./AuditLogRows";
import type { AuditLog } from "@/lib/admin/types";

function makeEntry(overrides: Partial<AuditLog> = {}): AuditLog {
    return {
        id: "al-1",
        org_id: "org-1",
        user_id: "550e8400-e29b-41d4-a716-446655440000",
        action: "user.login",
        resource_type: "user",
        resource_id: "660e8400-e29b-41d4-a716-446655440111",
        description: null,
        changes: null,
        request_metadata: null,
        status: "success",
        error_message: null,
        created_at: "2025-01-01T12:00:00Z",
        ...overrides,
    };
}

describe("AuditLogRows", () => {
    beforeEach(() => {
        // AuditIdentityLabel's copy affordance uses navigator.clipboard, which
        // user-event's clipboard stub supplies once setup() has run.
        userEvent.setup();
    });
    afterEach(() => cleanup());

    it("renders the investigation column headers", () => {
        render(<AuditLogRows entries={[makeEntry()]} onRowSelectAction={vi.fn()} />);
        expect(screen.getByText("Timestamp")).toBeInTheDocument();
        expect(screen.getByText("Action")).toBeInTheDocument();
        expect(screen.getByText("Resource")).toBeInTheDocument();
        expect(screen.getByText("Actor")).toBeInTheDocument();
        expect(screen.getByText("Status")).toBeInTheDocument();
    });

    it("formats the timestamp deterministically in UTC", () => {
        render(<AuditLogRows entries={[makeEntry()]} onRowSelectAction={vi.fn()} />);
        expect(screen.getByText("Jan 1, 2025, 12:00 PM UTC")).toBeInTheDocument();
    });

    it("shows System when the entry has no actor", () => {
        render(<AuditLogRows entries={[makeEntry({ user_id: null })]} onRowSelectAction={vi.fn()} />);
        expect(screen.getByText("System")).toBeInTheDocument();
    });

    it("shows an Unresolved treatment for actor and resource ids with no known name", () => {
        render(<AuditLogRows entries={[makeEntry()]} onRowSelectAction={vi.fn()} />);
        expect(screen.getAllByText("Unresolved")).toHaveLength(2);
    });

    it("calls onRowSelectAction with the clicked entry", async () => {
        const onRowSelectAction = vi.fn();
        const user = userEvent.setup();
        const entry = makeEntry();
        render(<AuditLogRows entries={[entry]} onRowSelectAction={onRowSelectAction} />);

        await user.click(screen.getByRole("button", { name: /user\.login/i }));

        expect(onRowSelectAction).toHaveBeenCalledWith(entry);
    });

    it("calls onRowSelectAction on Enter key when a row is focused", async () => {
        const onRowSelectAction = vi.fn();
        const user = userEvent.setup();
        const entry = makeEntry();
        render(<AuditLogRows entries={[entry]} onRowSelectAction={onRowSelectAction} />);

        screen.getByRole("button", { name: /user\.login/i }).focus();
        await user.keyboard("{Enter}");

        expect(onRowSelectAction).toHaveBeenCalledWith(entry);
    });

    it("does not open the row when a copy affordance inside it is clicked", async () => {
        const onRowSelectAction = vi.fn();
        const user = userEvent.setup();
        render(<AuditLogRows entries={[makeEntry()]} onRowSelectAction={onRowSelectAction} />);

        await user.click(screen.getAllByRole("button", { name: /copy resource id/i })[0]);

        expect(onRowSelectAction).not.toHaveBeenCalled();
    });
});
