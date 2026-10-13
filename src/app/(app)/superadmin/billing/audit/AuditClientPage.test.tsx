import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@/test/utils";

vi.mock("./actions", () => ({
    getAuditEntry: vi.fn(),
    getAuditLog: vi.fn(),
    resolveAuditMismatch: vi.fn(),
    triggerReconciliation: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/components/shared/AuditLogFilters", () => ({ AuditLogFilters: () => null }));
vi.mock("@/components/admin/billing/AuditDetailPanel", () => ({ AuditDetailPanel: () => null }));
vi.mock("@/components/admin/billing/ReconciliationTrigger", () => ({
    ReconciliationTrigger: () => null,
}));

import { AuditClientPage } from "./AuditClientPage";

const EMPTY = /No billing audit entries for this organization and filter\./;

describe("AuditClientPage empty state (CHAOS-9283)", () => {
    it("says the list is empty when the read succeeded with 0 rows", () => {
        render(<AuditClientPage initialEntries={[]} />);
        expect(screen.getByText(EMPTY)).toBeInTheDocument();
    });

    it("shows no empty sentence when there are rows", () => {
        render(
            <AuditClientPage
                initialEntries={[
                    {
                        id: "b1",
                        action: "plan.upgrade",
                        resource_type: "plan",
                        resource_id: "plan-pro",
                        created_at: "2024-03-01T08:00:00Z",
                    } as never,
                ]}
            />,
        );
        expect(screen.getByText("plan.upgrade")).toBeInTheDocument();
        expect(screen.queryByText(EMPTY)).not.toBeInTheDocument();
    });

    it("shows the failure text, not the empty sentence, when the read failed", () => {
        render(<AuditClientPage initialEntries={[]} initialError="Could not be read" />);
        expect(screen.getByText("Could not be read")).toBeInTheDocument();
        expect(screen.queryByText(EMPTY)).not.toBeInTheDocument();
    });
});
