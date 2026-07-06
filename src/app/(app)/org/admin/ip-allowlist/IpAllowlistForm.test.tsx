import { describe, expect, it, vi } from "vitest";
import { render, screen, userEvent } from "@/test/utils";
import { IpAllowlistForm } from "./IpAllowlistForm";
import type { IPAllowlist } from "@/lib/admin/types";

function renderForm(overrides: Partial<Parameters<typeof IpAllowlistForm>[0]> = {}) {
    const onSaveAction = vi.fn();
    const onCancelAction = vi.fn();
    const props = {
        mode: "create" as const,
        currentIp: "203.0.113.5",
        isSaving: false,
        onSaveAction,
        onCancelAction,
        ...overrides,
    };
    render(<IpAllowlistForm {...props} />);
    return { onSaveAction, onCancelAction };
}

describe("IpAllowlistForm", () => {
    it("rejects a malformed CIDR with a user-safe inline message and does not submit", async () => {
        const user = userEvent.setup();
        const { onSaveAction } = renderForm();

        await user.type(screen.getByLabelText("IP Range"), "999.1.1.1/99");
        await user.click(screen.getByRole("button", { name: "Save" }));

        expect(screen.getByText(/not a valid IPv4 or IPv6 address/i)).toBeInTheDocument();
        expect(onSaveAction).not.toHaveBeenCalled();
    });

    it("saves directly when the CIDR is valid and covers the current IP", async () => {
        const user = userEvent.setup();
        const { onSaveAction } = renderForm({ currentIp: "203.0.113.5" });

        await user.type(screen.getByLabelText("IP Range"), "203.0.113.0/24");
        await user.click(screen.getByRole("button", { name: "Save" }));

        expect(onSaveAction).toHaveBeenCalledWith(
            expect.objectContaining({ ip_range: "203.0.113.0/24" }),
        );
    });

    it("warns before saving a range that excludes the admin's own current IP, and blocks until acknowledged", async () => {
        const user = userEvent.setup();
        const { onSaveAction } = renderForm({ currentIp: "203.0.113.5" });

        await user.type(screen.getByLabelText("IP Range"), "10.0.0.0/24");
        await user.click(screen.getByRole("button", { name: "Save" }));

        // Direct save is blocked; a lockout-risk confirmation appears instead.
        expect(onSaveAction).not.toHaveBeenCalled();
        expect(
            screen.getByRole("dialog", { name: "This rule may lock you out" }),
        ).toBeInTheDocument();
        expect(screen.getByText(/not covered by this range/i)).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Save anyway" }));
        expect(onSaveAction).toHaveBeenCalledWith(
            expect.objectContaining({ ip_range: "10.0.0.0/24" }),
        );
    });

    it("warns before saving an IPv6 range when the admin's current IP is IPv4 (cross-version lockout)", async () => {
        const user = userEvent.setup();
        const { onSaveAction } = renderForm({ currentIp: "203.0.113.5" });

        await user.type(screen.getByLabelText("IP Range"), "2001:db8::/32");
        await user.click(screen.getByRole("button", { name: "Save" }));

        expect(onSaveAction).not.toHaveBeenCalled();
        expect(
            screen.getByRole("dialog", { name: "This rule may lock you out" }),
        ).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Save anyway" }));
        expect(onSaveAction).toHaveBeenCalledWith(
            expect.objectContaining({ ip_range: "2001:db8::/32" }),
        );
    });

    it("does not warn about lockout when editing an entry that is already inactive", async () => {
        const user = userEvent.setup();
        const inactiveEntry: IPAllowlist = {
            id: "ip-1",
            org_id: "org-1",
            ip_range: "10.0.0.0/24",
            description: null,
            is_active: false,
            created_by_id: null,
            created_at: "2025-01-01T00:00:00Z",
            updated_at: "2025-01-01T00:00:00Z",
            expires_at: null,
        };
        const { onSaveAction } = renderForm({
            mode: "edit",
            initialEntry: inactiveEntry,
            currentIp: "203.0.113.5",
        });

        await user.click(screen.getByRole("button", { name: "Save" }));

        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(onSaveAction).toHaveBeenCalledWith(
            expect.objectContaining({ ip_range: "10.0.0.0/24" }),
        );
    });

    it("fires onCancelAction when Cancel is clicked", async () => {
        const user = userEvent.setup();
        const { onCancelAction } = renderForm();

        await user.click(screen.getByRole("button", { name: "Cancel" }));
        expect(onCancelAction).toHaveBeenCalledTimes(1);
    });
});
