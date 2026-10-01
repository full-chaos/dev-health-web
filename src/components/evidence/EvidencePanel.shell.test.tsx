import { render, screen, waitFor, userEvent, fireEvent } from "@/test/utils";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { EvidencePanel } from "./EvidencePanel";
import type { MetricFilter } from "@/lib/filters/types";

const { mockGetExplainData } = vi.hoisted(() => ({ mockGetExplainData: vi.fn() }));

vi.mock("@/lib/api/home", () => ({ getExplainData: mockGetExplainData }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));

const filters = {
    scope: { level: "org", ids: ["org-1"] },
    time: { range_days: 30 },
    who: {},
    what: {},
    why: {},
    how: {},
} as MetricFilter;

const DATA = {
    metric: "cycle_time",
    label: "Cycle Time",
    summary: "Cycle time appears lower in this window.",
    trend: "down",
    magnitude: "small",
    evidence: [],
    actions: [],
};

function open(onClose = vi.fn(), isOpen = true) {
    mockGetExplainData.mockResolvedValue(DATA);
    render(
        <EvidencePanel
            isOpen={isOpen}
            onCloseAction={onClose}
            title="Cycle Time"
            metric="cycle_time"
            filters={filters}
        />,
    );
    return onClose;
}

describe("EvidencePanel shell (what callers rely on)", () => {
    it("renders nothing when closed", () => {
        open(vi.fn(), false);
        expect(screen.queryByText("Evidence & Context")).toBeNull();
        expect(screen.queryByRole("heading", { name: "Cycle Time" })).toBeNull();
    });

    it("shows the eyebrow and the title when open", async () => {
        open();
        expect(screen.getByText("Evidence & Context")).toBeInTheDocument();
        expect(screen.getByRole("heading", { level: 2, name: "Cycle Time" })).toBeInTheDocument();
        await waitFor(() => expect(mockGetExplainData).toHaveBeenCalled());
    });

    it("closes on Escape while open", async () => {
        const onClose = open();
        await userEvent.keyboard("{Escape}");
        expect(onClose).toHaveBeenCalled();
    });

    it("closes from the header close button", async () => {
        const onClose = open();
        await userEvent.click(screen.getByRole("button", { name: "Close" }));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("closes from the backdrop, which is no longer a focusable button", async () => {
        const onClose = open();
        expect(screen.queryByRole("button", { name: "Close evidence panel" })).toBeNull();
        await userEvent.click(screen.getByTestId("drawer-backdrop"));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("Escape while closed does not call onCloseAction (the old window listener was always on)", () => {
        const onClose = open(vi.fn(), false);
        fireEvent.keyDown(window, { key: "Escape" });
        fireEvent.keyDown(document, { key: "Escape" });
        expect(onClose).not.toHaveBeenCalled();
    });

    it("is a modal dialog named by the title", () => {
        open();
        const dialog = screen.getByRole("dialog", { name: "Cycle Time" });
        expect(dialog).toHaveAttribute("aria-modal", "true");
    });

    it("keeps the Open evidence link, in the dialog, by the same name", async () => {
        open();
        const link = await screen.findByRole("link", { name: /Open evidence/i });
        expect(screen.getByRole("dialog")).toContainElement(link);
    });

    it("moves focus to Close on open and back to the opener on close", async () => {
        function Host() {
            const [isOpen, setOpen] = useState(false);
            return (
                <div>
                    <button type="button" onClick={() => setOpen(true)}>
                        Opener
                    </button>
                    <EvidencePanel
                        isOpen={isOpen}
                        onCloseAction={() => setOpen(false)}
                        title="Cycle Time"
                        metric="cycle_time"
                        filters={filters}
                    />
                </div>
            );
        }
        mockGetExplainData.mockResolvedValue(DATA);
        render(<Host />);
        const opener = screen.getByRole("button", { name: "Opener" });
        await userEvent.click(opener);
        expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
        await userEvent.keyboard("{Escape}");
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(opener).toHaveFocus();
    });

    it("locks page scroll while open", () => {
        document.body.style.overflow = "auto";
        open();
        expect(document.body.style.overflow).toBe("hidden");
    });
});
