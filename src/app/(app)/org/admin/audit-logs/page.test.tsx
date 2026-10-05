/** OrgAuditLogPage integration tests — CHAOS-2843. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, userEvent, waitFor, within } from "@/test/utils";
import type { AuditLog, AuditLogFilter } from "@/lib/admin/types";
import OrgAuditLogPage from "./page";

const mockListAuditLogs = vi.fn();
vi.mock("@/lib/admin/server", () => ({
    listAuditLogs: (...args: unknown[]) => mockListAuditLogs(...args),
}));

vi.mock("@/components/admin/AdminTierContext", () => ({
    useAdminTier: () => ({
        tier: "enterprise",
        features: { audit_log: true },
        minSyncIntervalHours: 0.25,
        limits: {},
    }),
}));

function makeEntry(overrides: Partial<AuditLog> = {}): AuditLog {
    return {
        id: "al-1",
        org_id: "org-1",
        user_id: null,
        actor_display_name: null,
        action: "org.create",
        resource_type: "organization",
        resource_id: "org-1",
        resource_display_name: null,
        description: "Created the organization",
        changes: null,
        request_metadata: null,
        status: "success",
        error_message: null,
        created_at: "2025-01-01T12:00:00Z",
        ...overrides,
    };
}

function respondWith(items: AuditLog[]) {
    return { data: { items, total: items.length, limit: 50, offset: 0 }, error: undefined };
}

describe("OrgAuditLogPage", () => {
    beforeEach(() => {
        mockListAuditLogs.mockReset();
    });
    afterEach(() => cleanup());

    it("loads and renders audit rows on mount", async () => {
        mockListAuditLogs.mockResolvedValue(respondWith([makeEntry()]));

        render(<OrgAuditLogPage />);

        await waitFor(() => expect(screen.getByText("org.create")).toBeInTheDocument());
    });

    it("supports apply \u2192 reset \u2192 apply-with-no-results with a customer-safe empty state distinct from the initial state", async () => {
        mockListAuditLogs.mockResolvedValueOnce(respondWith([makeEntry()]));
        const user = userEvent.setup();
        render(<OrgAuditLogPage />);
        await waitFor(() => expect(screen.getByText("org.create")).toBeInTheDocument());

        // Apply a filter that matches nothing.
        mockListAuditLogs.mockResolvedValueOnce(respondWith([]));
        await user.type(screen.getByLabelText(/action/i), "user.invite");
        await user.click(screen.getByRole("button", { name: /apply filters/i }));

        await waitFor(() =>
            expect(screen.getByTestId("audit-log-empty-filtered")).toBeInTheDocument(),
        );
        expect(screen.queryByTestId("audit-log-empty-initial")).not.toBeInTheDocument();

        const lastFilterCall = mockListAuditLogs.mock.calls.at(-1)?.[0] as AuditLogFilter;
        expect(lastFilterCall.action).toBe("user.invite");

        // Reset clears the filter and re-queries immediately.
        mockListAuditLogs.mockResolvedValueOnce(
            respondWith([makeEntry({ action: "user.invite" })]),
        );
        const emptyState = screen.getByTestId("audit-log-empty-filtered");
        await user.click(within(emptyState).getByRole("button", { name: /reset filters/i }));

        await waitFor(() => expect(screen.getByText("user.invite")).toBeInTheDocument());
        expect(screen.getByLabelText(/action/i)).toHaveValue("");
    });

    it("opens the detail drawer on row click and closes it cleanly", async () => {
        mockListAuditLogs.mockResolvedValue(respondWith([makeEntry()]));
        const user = userEvent.setup();
        render(<OrgAuditLogPage />);
        await waitFor(() => expect(screen.getByText("org.create")).toBeInTheDocument());

        await user.click(screen.getByRole("button", { name: /open details/i }));

        expect(await screen.findByTestId("audit-log-detail-drawer")).toBeInTheDocument();
        expect(screen.getByText("Created the organization")).toBeInTheDocument();

        await user.click(screen.getByTitle(/close panel/i));

        expect(screen.queryByTestId("audit-log-detail-drawer")).not.toBeInTheDocument();
    });

    it("has the h1 Organization, a section card 'Audit events' and the shared pager", async () => {
        mockListAuditLogs.mockResolvedValue(respondWith([makeEntry()]));
        render(<OrgAuditLogPage />);
        await waitFor(() => expect(screen.getByText("org.create")).toBeInTheDocument());

        expect(screen.getByRole("heading", { level: 1, name: "Organization" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { level: 2, name: "Audit events" })).toBeInTheDocument();
        expect(screen.getByTestId("admin-pager")).toHaveTextContent("Showing 1–1");
    });

    it("says one plain sentence with a Retry that re-runs the fetch, and never prints the backend text", async () => {
        mockListAuditLogs.mockResolvedValueOnce({
            data: undefined,
            error: "GET /api/v1/admin/audit 502 upstream",
        });
        const user = userEvent.setup();
        const { container } = render(<OrgAuditLogPage />);

        expect(
            await screen.findByText(/Audit logs could not be loaded\. Retry/u),
        ).toBeInTheDocument();
        expect(container.textContent).not.toContain("502");
        expect(container.textContent).not.toContain("Error loading audit logs");

        mockListAuditLogs.mockResolvedValueOnce(respondWith([makeEntry()]));
        await user.click(screen.getByRole("button", { name: "Retry" }));

        await waitFor(() => expect(screen.getByText("org.create")).toBeInTheDocument());
        expect(screen.queryByText(/could not be loaded/u)).toBeNull();
    });

    it("renders served names and ids in the row and detail drawer", async () => {
        const RES = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
        const ACT = "550e8400-e29b-41d4-a716-446655440000";
        mockListAuditLogs.mockResolvedValue(
            respondWith([
                makeEntry({
                    resource_id: RES,
                    resource_display_name: "Audited Organization",
                    user_id: ACT,
                    actor_display_name: "Audit Actor",
                }),
            ]),
        );
        const user = userEvent.setup();
        render(<OrgAuditLogPage />);
        const row = (await screen.findByText("org.create")).closest("tr")!;

        expect(row).toHaveTextContent("Audited Organization");
        expect(row).toHaveTextContent("Audit Actor");
        expect(row).toHaveTextContent(RES);
        expect(row).toHaveTextContent(ACT);
        expect(within(row).getByRole("button", { name: /copy resource id/i })).toHaveAttribute(
            "title",
            `Copy resource ID: ${RES}`,
        );

        await user.click(within(row).getByRole("button", { name: /open details/i }));
        const drawer = await screen.findByTestId("audit-log-detail-drawer");
        expect(drawer).toHaveTextContent(RES);
        expect(drawer).toHaveTextContent(ACT);
    });
});
