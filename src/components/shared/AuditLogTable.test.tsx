import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@/test/utils";
import { AuditLogTable, type AuditEntry } from "./AuditLogTable";

const adminEntries: AuditEntry[] = [
    {
        id: "1",
        action: "org.create",
        resource_type: "organization",
        resource_id: "org-001",
        created_at: "2024-01-01T12:00:00Z",
        user_id: "user-abc",
        status: "success",
        description: "Created new org",
    },
    {
        id: "2",
        action: "user.invite",
        resource_type: "user",
        resource_id: "user-xyz",
        created_at: "2024-01-02T09:00:00Z",
        user_id: null,
        status: "failure",
        description: null,
    },
];

const billingEntries: AuditEntry[] = [
    {
        id: "b1",
        action: "plan.upgrade",
        resource_type: "plan",
        resource_id: "plan-pro",
        created_at: "2024-03-01T08:00:00Z",
        reconciliation_status: "matched",
    },
    {
        id: "b2",
        action: "invoice.create",
        resource_type: "invoice",
        resource_id: "inv-002",
        created_at: "2024-03-02T10:00:00Z",
        reconciliation_status: null,
    },
];

describe("AuditLogTable — admin variant", () => {
    it("renders all admin column headers", () => {
        render(<AuditLogTable variant="admin" entries={adminEntries} />);
        expect(screen.getByText("Timestamp")).toBeInTheDocument();
        expect(screen.getByText("Action")).toBeInTheDocument();
        expect(screen.getByText("Resource")).toBeInTheDocument();
        expect(screen.getByText("User")).toBeInTheDocument();
        expect(screen.getByText("Status")).toBeInTheDocument();
        expect(screen.getByText("Description")).toBeInTheDocument();
    });

    it("renders a row for each admin entry", () => {
        render(<AuditLogTable variant="admin" entries={adminEntries} />);
        expect(screen.getByText("org.create")).toBeInTheDocument();
        expect(screen.getByText("user.invite")).toBeInTheDocument();
    });

    it("shows 'System' when user_id is null", () => {
        render(<AuditLogTable variant="admin" entries={adminEntries} />);
        expect(screen.getByText("System")).toBeInTheDocument();
    });

    it("shows empty state message when entries are empty", () => {
        render(<AuditLogTable variant="admin" entries={[]} />);
        expect(screen.getByText("No audit logs found.")).toBeInTheDocument();
    });

    it("shows status badges for success and failure", () => {
        render(<AuditLogTable variant="admin" entries={adminEntries} />);
        expect(screen.getByText("success")).toBeInTheDocument();
        expect(screen.getByText("failure")).toBeInTheDocument();
    });
});

describe("AuditLogTable — billing variant", () => {
    it("renders billing column headers", () => {
        render(<AuditLogTable variant="billing" entries={billingEntries} />);
        expect(screen.getByText("Action")).toBeInTheDocument();
        expect(screen.getByText("Resource")).toBeInTheDocument();
        expect(screen.getByText("Status")).toBeInTheDocument();
        expect(screen.getByText("Created")).toBeInTheDocument();
    });

    it("renders entries with action badges", () => {
        render(<AuditLogTable variant="billing" entries={billingEntries} />);
        expect(screen.getByText("plan.upgrade")).toBeInTheDocument();
        expect(screen.getByText("invoice.create")).toBeInTheDocument();
    });

    it("calls onSelect when a row is clicked", () => {
        const onSelect = vi.fn();
        render(<AuditLogTable variant="billing" entries={billingEntries} onSelect={onSelect} />);
        fireEvent.click(screen.getByText("plan.upgrade").closest("tr")!);
        expect(onSelect).toHaveBeenCalledWith("b1");
    });

    it("shows '-' when reconciliation_status is null", () => {
        render(<AuditLogTable variant="billing" entries={billingEntries} />);
        expect(screen.getByText("-")).toBeInTheDocument();
    });
});
