import { render, screen, waitFor, userEvent, fireEvent } from "@/test/utils";
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
        await userEvent.click(screen.getByTitle("Close panel"));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("closes from the backdrop button", async () => {
        const onClose = open();
        await userEvent.click(screen.getByRole("button", { name: "Close evidence panel" }));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("TODAY (removed by the Drawer change): Escape while closed still calls onCloseAction", () => {
        const onClose = open(vi.fn(), false);
        fireEvent.keyDown(window, { key: "Escape" });
        expect(onClose).toHaveBeenCalled();
    });
});
