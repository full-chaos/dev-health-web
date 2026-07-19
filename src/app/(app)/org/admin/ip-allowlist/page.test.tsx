/** IPAllowlistPage integration tests (CHAOS-2842). */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, userEvent, waitFor, within } from "@/test/utils";
import type { IPAllowlist } from "@/lib/admin/types";

const mockListIPAllowlistEntries = vi.fn();
const mockCreateIPAllowlistEntry = vi.fn();
const mockUpdateIPAllowlistEntry = vi.fn();
const mockDeleteIPAllowlistEntry = vi.fn();
const mockGetCurrentClientIp = vi.fn();

vi.mock("@/lib/admin/server", () => ({
    listIPAllowlistEntries: (...args: unknown[]) => mockListIPAllowlistEntries(...args),
    createIPAllowlistEntry: (...args: unknown[]) => mockCreateIPAllowlistEntry(...args),
    updateIPAllowlistEntry: (...args: unknown[]) => mockUpdateIPAllowlistEntry(...args),
    deleteIPAllowlistEntry: (...args: unknown[]) => mockDeleteIPAllowlistEntry(...args),
    getCurrentClientIp: (...args: unknown[]) => mockGetCurrentClientIp(...args),
}));

let mockTier = {
    tier: "enterprise",
    features: { ip_allowlist: true },
    minSyncIntervalHours: 0.25,
    limits: {},
};
vi.mock("@/components/admin/AdminTierContext", () => ({
    useAdminTier: () => mockTier,
}));

import IPAllowlistPage from "./page";

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

function respondWith(items: IPAllowlist[]) {
    return { data: { items, total: items.length, limit: 50, offset: 0 }, error: undefined };
}

describe("IPAllowlistPage", () => {
    beforeEach(() => {
        mockListIPAllowlistEntries.mockReset();
        mockCreateIPAllowlistEntry.mockReset();
        mockUpdateIPAllowlistEntry.mockReset();
        mockDeleteIPAllowlistEntry.mockReset();
        mockGetCurrentClientIp.mockReset();
        mockGetCurrentClientIp.mockResolvedValue({ data: "203.0.113.5" });
        mockTier = {
            tier: "enterprise",
            features: { ip_allowlist: true },
            minSyncIntervalHours: 0.25,
            limits: {},
        };
    });
    afterEach(() => cleanup());

    it("renders the locked upsell state when the enterprise feature gate is closed", async () => {
        mockTier = { ...mockTier, features: { ip_allowlist: false } };
        mockListIPAllowlistEntries.mockResolvedValue(respondWith([]));

        render(<IPAllowlistPage />);

        expect(
            await screen.findByRole("heading", { name: "Feature unavailable" }),
        ).toBeInTheDocument();
        expect(
            screen.getByText("Contact an administrator to enable ip allowlist for this plan."),
        ).toBeInTheDocument();
    });

    it("loads and renders entries on mount when the gate is open", async () => {
        mockListIPAllowlistEntries.mockResolvedValue(respondWith([makeEntry()]));

        render(<IPAllowlistPage />);

        await waitFor(() => expect(screen.getByText("192.168.1.0/24")).toBeInTheDocument());
    });

    it("creates a new entry directly when it covers the admin's current IP", async () => {
        mockListIPAllowlistEntries.mockResolvedValueOnce(respondWith([]));
        mockCreateIPAllowlistEntry.mockResolvedValue({ data: makeEntry(), error: undefined });
        mockListIPAllowlistEntries.mockResolvedValueOnce(respondWith([makeEntry()]));
        const user = userEvent.setup();

        render(<IPAllowlistPage />);
        await waitFor(() => expect(mockGetCurrentClientIp).toHaveBeenCalled());

        await user.click(screen.getByRole("button", { name: "Add IP Rule" }));
        await user.type(screen.getByLabelText("IP Range"), "203.0.113.0/24");
        await user.click(screen.getByRole("button", { name: "Save" }));

        await waitFor(() =>
            expect(mockCreateIPAllowlistEntry).toHaveBeenCalledWith(
                expect.objectContaining({ ip_range: "203.0.113.0/24" }),
            ),
        );
    });

    it("supports the full edit flow, prefilling the existing entry", async () => {
        const entry = makeEntry({ ip_range: "203.0.113.0/24" });
        mockListIPAllowlistEntries.mockResolvedValue(respondWith([entry]));
        mockUpdateIPAllowlistEntry.mockResolvedValue({ data: { ...entry, description: "HQ" } });
        const user = userEvent.setup();

        render(<IPAllowlistPage />);
        await waitFor(() => expect(screen.getByText("203.0.113.0/24")).toBeInTheDocument());

        await user.click(screen.getByRole("button", { name: "Edit" }));
        expect(screen.getByLabelText("IP Range")).toHaveValue("203.0.113.0/24");

        await user.clear(screen.getByLabelText("Description"));
        await user.type(screen.getByLabelText("Description"), "HQ");
        await user.click(screen.getByRole("button", { name: "Save" }));

        await waitFor(() =>
            expect(mockUpdateIPAllowlistEntry).toHaveBeenCalledWith(
                "ip-1",
                expect.objectContaining({ description: "HQ" }),
            ),
        );
    });

    it("deletes an entry only after explicit confirmation", async () => {
        const entry = makeEntry();
        mockListIPAllowlistEntries.mockResolvedValue(respondWith([entry]));
        mockDeleteIPAllowlistEntry.mockResolvedValue({ data: undefined, error: undefined });
        const user = userEvent.setup();

        render(<IPAllowlistPage />);
        await waitFor(() => expect(screen.getByText("192.168.1.0/24")).toBeInTheDocument());

        await user.click(screen.getByRole("button", { name: "Delete" }));
        const dialog = screen.getByRole("dialog", { name: "Delete this IP rule?" });
        expect(mockDeleteIPAllowlistEntry).not.toHaveBeenCalled();

        await user.click(within(dialog).getByRole("button", { name: "Delete" }));
        await waitFor(() => expect(mockDeleteIPAllowlistEntry).toHaveBeenCalledWith("ip-1"));
    });

    it("shows a customer-safe empty state when there are no entries", async () => {
        mockListIPAllowlistEntries.mockResolvedValue(respondWith([]));

        render(<IPAllowlistPage />);

        await waitFor(() =>
            expect(screen.getByText("No IP allowlist entries configured.")).toBeInTheDocument(),
        );
    });
});
