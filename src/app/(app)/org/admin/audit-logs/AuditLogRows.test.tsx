import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, userEvent } from "@/test/utils";
import { AuditLogRows } from "./AuditLogRows";
import type { AuditLog } from "@/lib/admin/types";

function makeEntry(overrides: Partial<AuditLog> = {}): AuditLog {
    return {
        id: "al-1",
        org_id: "org-1",
        user_id: "550e8400-e29b-41d4-a716-446655440000",
        actor_display_name: null,
        action: "user.login",
        resource_type: "user",
        resource_id: "660e8400-e29b-41d4-a716-446655440111",
        resource_display_name: null,
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
    let user: ReturnType<typeof userEvent.setup>;

    beforeEach(() => {
        // userEvent.setup() installs its own jsdom-friendly clipboard stub, so
        // AuditIdentityLabel's copy affordance has something real to write to.
        user = userEvent.setup();
        vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
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
        render(
            <AuditLogRows entries={[makeEntry({ user_id: null })]} onRowSelectAction={vi.fn()} />,
        );
        expect(screen.getByText("System")).toBeInTheDocument();
    });

    it("shows an Unresolved treatment for null served actor and resource names", () => {
        render(<AuditLogRows entries={[makeEntry()]} onRowSelectAction={vi.fn()} />);
        expect(screen.getAllByText("Unresolved")).toHaveLength(2);
    });

    it("renders served actor and resource names alongside their ids", () => {
        const actorId = "550e8400-e29b-41d4-a716-446655440000";
        const resourceId = "660e8400-e29b-41d4-a716-446655440111";
        render(
            <AuditLogRows
                entries={[
                    makeEntry({
                        user_id: actorId,
                        actor_display_name: "Audit Actor",
                        resource_id: resourceId,
                        resource_display_name: "Audit Resource",
                    }),
                ]}
                onRowSelectAction={vi.fn()}
            />,
        );

        expect(screen.getByText("Audit Actor")).toBeInTheDocument();
        expect(screen.getByText("Audit Resource")).toBeInTheDocument();
        expect(screen.queryByText(actorId)).not.toBeInTheDocument();
        expect(screen.queryByText(resourceId)).not.toBeInTheDocument();
        expect(screen.getByText("Audit Actor")).toHaveAttribute("title", actorId);
        expect(screen.getByText("Audit Resource")).toHaveAttribute("title", resourceId);
        expect(screen.getByRole("button", { name: /copy actor id/i })).toHaveAttribute(
            "title",
            `Copy actor ID: ${actorId}`,
        );
    });

    it("shows no id text or id piece for null or absent names (old backend)", () => {
        const absent = makeEntry();
        delete absent.actor_display_name;
        delete absent.resource_display_name;
        const { container } = render(
            <AuditLogRows
                entries={[makeEntry(), absent, makeEntry({ actor_display_name: "  " })]}
                onRowSelectAction={vi.fn()}
            />,
        );
        expect(screen.getAllByText("Unresolved")).toHaveLength(6);
        expect(container.textContent).not.toMatch(/550e8400|660e8400|[0-9a-f]{8}/i);
        expect(container.textContent).not.toContain("Not reported");
    });

    it("calls onRowSelectAction when the explicit Open details button is clicked", async () => {
        const onRowSelectAction = vi.fn();
        const entry = makeEntry();
        render(<AuditLogRows entries={[entry]} onRowSelectAction={onRowSelectAction} />);

        await user.click(screen.getByRole("button", { name: /open details/i }));

        expect(onRowSelectAction).toHaveBeenCalledTimes(1);
        expect(onRowSelectAction).toHaveBeenCalledWith(entry);
    });

    it("calls onRowSelectAction on Enter when the Open details button is focused", async () => {
        const onRowSelectAction = vi.fn();
        const entry = makeEntry();
        render(<AuditLogRows entries={[entry]} onRowSelectAction={onRowSelectAction} />);

        screen.getByRole("button", { name: /open details/i }).focus();
        await user.keyboard("{Enter}");

        expect(onRowSelectAction).toHaveBeenCalledWith(entry);
    });

    it("also opens the row as a pointer-only enhancement when clicking elsewhere in the row", async () => {
        const onRowSelectAction = vi.fn();
        const entry = makeEntry();
        render(<AuditLogRows entries={[entry]} onRowSelectAction={onRowSelectAction} />);

        await user.click(screen.getByText("user.login"));

        expect(onRowSelectAction).toHaveBeenCalledWith(entry);
    });

    it("does not open the row when a copy affordance inside it is clicked", async () => {
        const onRowSelectAction = vi.fn();
        render(<AuditLogRows entries={[makeEntry()]} onRowSelectAction={onRowSelectAction} />);

        await user.click(screen.getAllByRole("button", { name: /copy resource id/i })[0]);

        expect(onRowSelectAction).not.toHaveBeenCalled();
    });

    it("copies without opening the drawer when a focused copy button is triggered via Enter or Space", async () => {
        const onRowSelectAction = vi.fn();
        const writeText = vi.spyOn(navigator.clipboard, "writeText");
        render(<AuditLogRows entries={[makeEntry()]} onRowSelectAction={onRowSelectAction} />);

        const copyButton = screen.getAllByRole("button", { name: /copy resource id/i })[0];
        copyButton.focus();
        await user.keyboard("{Enter}");

        expect(writeText).toHaveBeenCalled();
        expect(onRowSelectAction).not.toHaveBeenCalled();

        await user.keyboard(" ");

        expect(onRowSelectAction).not.toHaveBeenCalled();
    });
});
