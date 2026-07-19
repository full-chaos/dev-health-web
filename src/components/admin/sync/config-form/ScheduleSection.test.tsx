import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ScheduleSection } from "./ScheduleSection";

vi.mock("@/components/billing/UpgradeGate", () => ({
    UpgradeGate: ({ children }: { readonly children: React.ReactNode }) => children,
}));

vi.mock("../SchedulePicker", () => ({
    SchedulePicker: () => <div>Schedule picker</div>,
}));

describe("ScheduleSection", () => {
    it("labels activation independently from the gated schedule controls", () => {
        render(
            <ScheduleSection
                isActive
                onIsActiveChange={vi.fn()}
                scheduleCron={null}
                timezone={null}
                onScheduleChange={vi.fn()}
            />,
        );

        expect(screen.getByLabelText("Enable this sync configuration")).toBeChecked();
        expect(
            screen.getByText(
                "Activation keeps this configuration available for manual runs. Automatic scheduling is controlled separately below.",
            ),
        ).toBeVisible();
        expect(screen.queryByLabelText("Enable automatic sync schedule")).not.toBeInTheDocument();
        expect(screen.getByText("Schedule picker")).toBeVisible();
    });
});
