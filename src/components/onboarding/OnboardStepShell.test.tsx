import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { OnboardStepShell } from "./OnboardStepShell";

describe("OnboardStepShell", () => {
    it("renders the title, subtitle, and children", () => {
        render(
            <OnboardStepShell
                currentStep="workspace"
                title="Set up your workspace"
                subtitle="Step one"
            >
                <p>Body content</p>
            </OnboardStepShell>,
        );

        expect(screen.getByRole("heading", { name: "Set up your workspace" })).toBeInTheDocument();
        expect(screen.getByText("Step one")).toBeInTheDocument();
        expect(screen.getByText("Body content")).toBeInTheDocument();
    });

    it("marks the current step accessibly in the progress list", () => {
        render(
            <OnboardStepShell currentStep="integration" title="Connect a tool">
                <p>Body</p>
            </OnboardStepShell>,
        );

        const progress = screen.getByRole("list", { name: "Onboarding progress" });
        const items = within(progress).getAllByRole("listitem");
        expect(items).toHaveLength(3);

        const current = items.find((item) => item.getAttribute("aria-current") === "step");
        expect(current).toHaveTextContent("Integration");
    });
});
