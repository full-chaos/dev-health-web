/** IPAllowlistPage integration tests (CHAOS-2842). */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buttonClassName } from "@/components/shared/Button";
import { render, screen, cleanup, userEvent, waitFor, within } from "@/test/utils";
import type { IPAllowlist } from "@/lib/admin/types";

const logError = vi.hoisted(() => vi.fn());
vi.mock("@/lib/logger", () => ({
    logger: { error: logError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

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

describe("IPAllowlistPage design A6/A7 (CHAOS-8239)", () => {
    beforeEach(() => {
        mockListIPAllowlistEntries.mockReset();
        mockDeleteIPAllowlistEntry.mockReset();
        mockUpdateIPAllowlistEntry.mockReset();
    });
    afterEach(() => cleanup());

    it("has the h1 Organization, the add action in the header as the primary button with the icon first, and a section card", async () => {
        mockListIPAllowlistEntries.mockResolvedValue(respondWith([makeEntry()]));
        render(<IPAllowlistPage />);
        await waitFor(() => expect(screen.getByText("192.168.1.0/24")).toBeInTheDocument());

        expect(screen.getByRole("heading", { level: 1, name: "Organization" })).toBeInTheDocument();
        const add = within(screen.getByTestId("page-header")).getByRole("button", {
            name: "Add IP Rule",
        });
        expect(add.firstElementChild?.querySelector("svg") ?? null).not.toBeNull();
        expect(add.className).toContain("bg-(--action)");
        expect(screen.getByTestId("admin-pager")).toHaveTextContent("Showing 1–1");
    });

    it("says one plain sentence with a Retry that re-runs the load, and never prints the backend text", async () => {
        mockListIPAllowlistEntries.mockResolvedValueOnce({
            data: undefined,
            error: "GET /api/v1/admin/x 502 upstream",
        });
        const user = userEvent.setup();
        const { container } = render(<IPAllowlistPage />);

        expect(
            await screen.findByText(/IP allowlist entries could not be loaded\. Retry/u),
        ).toBeInTheDocument();
        expect(container.textContent).not.toContain("502");

        mockListIPAllowlistEntries.mockResolvedValueOnce(respondWith([makeEntry()]));
        await user.click(screen.getByRole("button", { name: "Retry" }));

        await waitFor(() => expect(screen.getByText("192.168.1.0/24")).toBeInTheDocument());
        expect(screen.queryByText(/could not be loaded/u)).toBeNull();
    });

    it("shows a plan-gate answer as a warning notice with the served sentence, not a danger error", async () => {
        mockListIPAllowlistEntries.mockResolvedValueOnce({
            data: undefined,
            error: "This feature requires the enterprise plan (current plan: community).",
        });
        render(<IPAllowlistPage />);

        const text = await screen.findByText(
            "This feature requires the enterprise plan (current plan: community).",
        );
        expect(text.closest("[data-notice-variant]")).toHaveAttribute(
            "data-notice-variant",
            "warn",
        );
    });

    async function failToggleWith(result: { error: string; status?: number }) {
        mockListIPAllowlistEntries.mockResolvedValue(respondWith([makeEntry()]));
        mockUpdateIPAllowlistEntry.mockResolvedValue({ data: undefined, ...result });
        const user = userEvent.setup();
        const view = render(<IPAllowlistPage />);
        await waitFor(() => expect(screen.getByText("192.168.1.0/24")).toBeInTheDocument());

        await user.click(screen.getByRole("button", { name: /^(Disable|Enable)/u }));
        await user.click(
            within(await screen.findByRole("dialog")).getByRole("button", {
                name: /^(Disable|Enable)/u,
            }),
        );
        return view;
    }

    it("shows the served message of a failed action only for a validation answer (4xx)", async () => {
        await failToggleWith({ error: "Rule overlaps an existing rule", status: 409 });

        expect(await screen.findByText("Rule overlaps an existing rule")).toBeInTheDocument();
        expect(screen.queryByText(/could not be loaded/u)).toBeNull();
    });

    it("logs the backend text of a 5xx and of a network failure, but not of a validation answer", async () => {
        logError.mockClear();
        await failToggleWith({ error: "backend 502 text", status: 502 });
        expect(await screen.findByText(/That change could not be completed/u)).toBeInTheDocument();
        expect(logError).toHaveBeenCalledWith(
            expect.objectContaining({ err: "backend 502 text", status: 502 }),
            "Admin action failed",
        );

        cleanup();
        logError.mockClear();
        await failToggleWith({ error: "Bad CIDR", status: 422 });
        expect(await screen.findByText("Bad CIDR")).toBeInTheDocument();
        expect(logError).not.toHaveBeenCalledWith(expect.anything(), "Admin action failed");
    });

    it("shows one plain sentence for a 5xx, and not the served text", async () => {
        const { container } = await failToggleWith({
            error: "GET /api/v1/admin/x 502 upstream",
            status: 502,
        });

        expect(
            await screen.findByText("That change could not be completed. Try again in a moment."),
        ).toBeInTheDocument();
        expect(container.textContent).not.toContain("502");
    });

    it("shows one plain sentence for a network failure (no status), and not the served text", async () => {
        const { container } = await failToggleWith({ error: "fetch failed: ECONNRESET" });

        expect(
            await screen.findByText("That change could not be completed. Try again in a moment."),
        ).toBeInTheDocument();
        expect(container.textContent).not.toContain("ECONNRESET");
    });

    it("shows the dashed empty state and no pager when there are no rows", async () => {
        mockListIPAllowlistEntries.mockResolvedValue(respondWith([]));
        render(<IPAllowlistPage />);

        expect(
            await screen.findByTestId("data-state-detector-enabled-no-findings"),
        ).toBeInTheDocument();
        expect(screen.queryByTestId("admin-pager")).toBeNull();
    });

    it("draws the status as a pill with an icon, and Delete as the shared danger variant", async () => {
        mockListIPAllowlistEntries.mockResolvedValue(respondWith([makeEntry()]));
        render(<IPAllowlistPage />);

        const pill = await screen.findByText("Active");
        expect(pill.firstElementChild?.tagName.toLowerCase()).toBe("svg");
        expect(pill.className).not.toMatch(/(^|\s)border/u);
        const del = screen.getByRole("button", { name: "Delete" });
        // The shared danger variant (CHAOS-8254), no `!` override.
        for (const token of buttonClassName("danger", "sm").split(" ")) {
            expect(del).toHaveClass(token);
        }
        expect(del.className).not.toContain("!");
    });

    it("shows dates as 'Sep 29, 2026' (shared UTC date) and a missing date as an em dash", async () => {
        mockListIPAllowlistEntries.mockResolvedValue(
            respondWith([makeEntry({ created_at: "2025-09-29T12:00:00Z", description: null })]),
        );
        render(<IPAllowlistPage />);

        const row = (await screen.findByText("192.168.1.0/24")).closest("tr")!;
        expect(row).toHaveTextContent("Sep 29, 2025");
        expect(row.textContent).not.toContain("--");
        expect(row).toHaveTextContent("—");
        expect(row.textContent).not.toMatch(/\d+\/\d+\/\d+/u);
    });
});
