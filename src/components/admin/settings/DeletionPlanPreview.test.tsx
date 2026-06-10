import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DeletionPlanPreview, type DeletionResult } from "./DeletionPlanPreview";

const plan: DeletionResult = {
    organizationId: "org-1",
    dryRun: true,
    timestamp: "2026-01-01T00:00:00Z",
    deletedCounts: { organizations: 1, settings: 2, repo_metrics_daily: 3 },
    disabledJobCount: 2,
    credentialDeletionCount: 1,
    warnings: ["ClickHouse URI not configured; analytics tables were not verified."],
};

function renderPreview(overrides: Partial<Parameters<typeof DeletionPlanPreview>[0]> = {}) {
    const props = {
        plan,
        onConfirm: vi.fn(),
        onCancel: vi.fn(),
        isPending: false,
        confirmText: "",
        expectedConfirmText: "org-1",
        setConfirmText: vi.fn(),
        ...overrides,
    };
    render(<DeletionPlanPreview {...props} />);
    return props;
}

describe("DeletionPlanPreview", () => {
    it("renders per-category counts, jobs, credentials, total and warnings", () => {
        renderPreview();
        expect(screen.getByText("Deletion Plan Preview")).toBeTruthy();
        expect(screen.getByText("Scheduled Jobs (Disabled)")).toBeTruthy();
        expect(screen.getByText("Credentials")).toBeTruthy();
        expect(screen.getByText("Total Records")).toBeTruthy();
        // total = 1 + 2 + 3
        expect(screen.getByText("6")).toBeTruthy();
        expect(screen.getByText(/ClickHouse URI not configured/)).toBeTruthy();
    });

    it("disables confirm until the confirmation text matches", () => {
        renderPreview({ confirmText: "" });
        const button = screen.getByRole("button", {
            name: "Delete Forever",
        }) as HTMLButtonElement;
        expect(button.disabled).toBe(true);
    });

    it("enables confirm and fires onConfirm when text matches", () => {
        const onConfirm = vi.fn();
        renderPreview({ confirmText: "org-1", onConfirm });
        const button = screen.getByRole("button", {
            name: "Delete Forever",
        }) as HTMLButtonElement;
        expect(button.disabled).toBe(false);
        fireEvent.click(button);
        expect(onConfirm).toHaveBeenCalledTimes(1);
    });
});
