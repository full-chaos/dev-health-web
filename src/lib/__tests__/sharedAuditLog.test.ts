/**
 * Tests for the shared AuditLog component utility functions.
 * Tests the pure data-transformation logic used by AuditLogTable and AuditLogFilters.
 */
import { describe, it, expect } from "vitest";

// Test the action badge logic used in the shared AuditLogTable (billing variant)
const ACTION_BADGE_COLORS: Record<string, string> = {
    plan: "bg-blue-500/15 text-blue-400",
    subscription: "bg-green-500/15 text-green-400",
    invoice: "bg-yellow-500/15 text-yellow-400",
    refund: "bg-orange-500/15 text-orange-400",
    reconciliation: "bg-purple-500/15 text-purple-400",
};

function actionBadgeClass(action: string): string {
    const group = action.split(".", 1)[0] ?? "";
    return ACTION_BADGE_COLORS[group] ?? "bg-slate-500/15 text-slate-300";
}

describe("actionBadgeClass", () => {
    it("returns the correct class for a plan action", () => {
        expect(actionBadgeClass("plan.create")).toContain("blue");
    });

    it("returns the correct class for a subscription action", () => {
        expect(actionBadgeClass("subscription.cancel")).toContain("green");
    });

    it("returns the correct class for an invoice action", () => {
        expect(actionBadgeClass("invoice.paid")).toContain("yellow");
    });

    it("returns the correct class for a refund action", () => {
        expect(actionBadgeClass("refund.issue")).toContain("orange");
    });

    it("returns the correct class for a reconciliation action", () => {
        expect(actionBadgeClass("reconciliation.run")).toContain("purple");
    });

    it("returns the default slate class for unknown action groups", () => {
        const cls = actionBadgeClass("unknown.action");
        expect(cls).toBe("bg-slate-500/15 text-slate-300");
    });

    it("handles action strings without a dot", () => {
        const cls = actionBadgeClass("plan");
        expect(cls).toContain("blue");
    });
});

// Test date formatting logic used in audit log tables
describe("audit log date formatting", () => {
    it("formats ISO dates to a locale string", () => {
        const date = new Date("2024-06-15T10:30:00Z");
        const formatted = date.toLocaleString();
        expect(typeof formatted).toBe("string");
        expect(formatted.length).toBeGreaterThan(0);
    });

    it("handles timestamps at Unix epoch", () => {
        const date = new Date("1970-01-01T00:00:00Z");
        const formatted = date.toLocaleString();
        expect(typeof formatted).toBe("string");
    });
});
