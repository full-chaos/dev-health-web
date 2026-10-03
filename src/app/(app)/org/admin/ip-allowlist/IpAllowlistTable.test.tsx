import { describe, expect, it, vi } from "vitest";
import { render, screen, userEvent, within } from "@/test/utils";
import { IpAllowlistTable } from "./IpAllowlistTable";
import type { IPAllowlist } from "@/lib/admin/types";

function makeEntry(overrides: Partial<IPAllowlist> = {}): IPAllowlist {
    return {
        id: "ip-1",
        org_id: "org-1",
        ip_range: "192.168.1.0/24",
        description: "Office",
        is_active: true,
        created_by_id: null,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
        expires_at: null,
        ...overrides,
    };
}

function renderTable(overrides: Partial<Parameters<typeof IpAllowlistTable>[0]> = {}) {
    const onEditAction = vi.fn();
    const onToggleAction = vi.fn();
    const onDeleteAction = vi.fn();
    const props = {
        entries: [makeEntry()],
        currentIp: "203.0.113.5",
        togglingId: null,
        onEditAction,
        onToggleAction,
        onDeleteAction,
        formatDate: (d: string | null) => d ?? "--",
        ...overrides,
    };
    render(<IpAllowlistTable {...props} />);
    return { onEditAction, onToggleAction, onDeleteAction };
}

describe("IpAllowlistTable", () => {
    it("renders a customer-safe empty state when there are no entries", () => {
        renderTable({ entries: [] });
        expect(screen.getByText("No IP allowlist entries configured.")).toBeInTheDocument();
    });

    it("fires onEditAction with the row's entry", async () => {
        const user = userEvent.setup();
        const entry = makeEntry();
        const { onEditAction } = renderTable({ entries: [entry] });

        await user.click(screen.getByRole("button", { name: "Edit" }));
        expect(onEditAction).toHaveBeenCalledWith(entry);
    });

    it("requires explicit confirmation, with consequence copy, before disabling an active rule", async () => {
        const user = userEvent.setup();
        const entry = makeEntry({ is_active: true, ip_range: "192.168.1.0/24" });
        const { onToggleAction } = renderTable({ entries: [entry] });

        await user.click(screen.getByRole("button", { name: "Disable" }));
        expect(onToggleAction).not.toHaveBeenCalled();
        const dialog = screen.getByRole("dialog", { name: "Disable this IP rule?" });
        expect(dialog).toBeInTheDocument();
        expect(screen.getByText(/removes this restriction/i)).toBeInTheDocument();

        await user.click(within(dialog).getByRole("button", { name: "Disable" }));
        expect(onToggleAction).toHaveBeenCalledWith(entry);
    });

    it("warns about lockout risk when enabling a rule that would exclude the current IP", async () => {
        const user = userEvent.setup();
        const entry = makeEntry({ is_active: false, ip_range: "10.0.0.0/24" });
        renderTable({ entries: [entry], currentIp: "203.0.113.5" });

        await user.click(screen.getByRole("button", { name: "Enable" }));
        expect(screen.getByText(/does not include your current IP/i)).toBeInTheDocument();
    });

    it("requires explicit confirmation, with consequence copy, before deleting an entry", async () => {
        const user = userEvent.setup();
        const entry = makeEntry();
        const { onDeleteAction } = renderTable({ entries: [entry] });

        await user.click(screen.getByRole("button", { name: "Delete" }));
        expect(onDeleteAction).not.toHaveBeenCalled();
        const dialog = screen.getByRole("dialog", { name: "Delete this IP rule?" });
        expect(dialog).toBeInTheDocument();
        expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();

        await user.click(within(dialog).getByRole("button", { name: "Delete" }));
        expect(onDeleteAction).toHaveBeenCalledWith(entry);
    });

    it("draws the design columns (IP Range, Description, Added, Actions) and keeps every served element", async () => {
        renderTable({
            entries: [
                makeEntry({
                    description: null,
                    created_at: "2025-01-01T00:00:00Z",
                    expires_at: "2026-12-31T00:00:00Z",
                }),
            ],
        });

        const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
        expect(headers).toEqual(["IP Range", "Description", "Added", "Actions"]);
        const row = screen.getByText("192.168.1.0/24").closest("tr")!;
        // Status pill in the range cell, Expires as a caption under Added, em dash for no description.
        expect(within(row).getAllByRole("cell")[0]).toHaveTextContent("Active");
        expect(within(row).getAllByRole("cell")[1]).toHaveTextContent("—");
        expect(within(row).getAllByRole("cell")[2]).toHaveTextContent(
            "Expires 2026-12-31T00:00:00Z",
        );
        // No loss of working actions.
        for (const name of ["Edit", "Disable", "Delete"]) {
            expect(within(row).getByRole("button", { name })).toBeInTheDocument();
        }
    });

    it("shows no Expires caption when the rule does not expire", () => {
        renderTable({ entries: [makeEntry({ expires_at: null })] });

        expect(screen.queryByText(/^Expires/u)).toBeNull();
    });
});
