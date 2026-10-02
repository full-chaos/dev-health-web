import { describe, expect, it, vi } from "vitest";

const panelProps = vi.hoisted(() => ({ last: null as null | Record<string, unknown> }));
vi.mock("@/components/evidence/EvidencePanel", () => ({
    EvidencePanel: (props: Record<string, unknown>) => {
        panelProps.last = props;
        return <div data-testid="evidence-panel" />;
    },
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/metrics" }));

import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { screen, userEvent } from "@/test/utils";

import { MetricEvidenceButton } from "./MetricEvidenceButton";

const filters = {
    scope: { level: "org", ids: ["org-1"] },
    time: { range_days: 90 },
    who: {},
    what: {},
    why: {},
    how: {},
} as never;

describe("MetricEvidenceButton (section 'Evidence' action)", () => {
    it("is a small ghost button with the text 'Evidence', an icon, and the section in its name", () => {
        render(
            <MetricEvidenceButton
                section="Likely associations"
                subject={{ title: "Cycle Time", metric: "cycle_time", filters }}
            />,
        );
        const button = screen.getByRole("button", { name: "Evidence: Likely associations" });
        expect(button).toHaveTextContent(/^Evidence$/);
        expect(button.querySelector("svg")).not.toBeNull();
        // Ghost (no border, action colour) and small (28px).
        expect(button.className).toContain("border-transparent");
        expect(button.className).toContain("text-(--accent-2)");
        expect(button.className).toContain("min-h-7");
    });

    it("opens the shared drawer for the section's metric, with the scope and the role", async () => {
        render(
            <MetricEvidenceButton
                section="Primary contributors"
                subject={{ title: "Cycle Time", metric: "cycle_time", filters, role: "manager" }}
            />,
        );
        expect(screen.queryByTestId("evidence-panel")).toBeNull();
        await userEvent.click(
            screen.getByRole("button", { name: "Evidence: Primary contributors" }),
        );
        expect(screen.getByTestId("evidence-panel")).toBeInTheDocument();
        expect(panelProps.last).toMatchObject({
            isOpen: true,
            title: "Cycle Time",
            metric: "cycle_time",
            filters,
            role: "manager",
        });
    });
});
