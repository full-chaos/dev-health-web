import { describe, expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen } from "@/test/utils";

import { ContextPacketExplorer } from "./ContextPacketExplorer";

describe("ContextPacketExplorer", () => {
    it("renders the deterministic sample packet in the prescribed category order", () => {
        render(<ContextPacketExplorer controlledState="sample" />);

        expect(screen.getByRole("heading", { name: "Context Packet" })).toBeInTheDocument();
        expect(screen.getByLabelText(/Goal/)).toHaveValue("Add repository-scoped ACR credentials");
        for (const category of ["State", "Pressure", "Cause", "Evidence", "Action"]) {
            expect(screen.getByRole("heading", { name: category, level: 2 })).toBeInTheDocument();
        }
        expect(screen.getByText("Packet status")).toBeInTheDocument();
        expect(screen.getByText("Freshness")).toBeInTheDocument();
        expect(screen.getByText("Coverage")).toBeInTheDocument();
        expect(screen.getByText("Budget")).toBeInTheDocument();
    });

    it("keeps editable values and announces a controlled loading transition without fetching", async () => {
        const user = userEvent.setup();
        render(<ContextPacketExplorer controlledState="sample" />);

        const goal = screen.getByLabelText(/Goal/);
        await user.clear(goal);
        await user.type(goal, "Inspect repository access boundaries");
        await user.click(screen.getByRole("button", { name: "Generate context" }));

        expect(goal).toHaveValue("Inspect repository access boundaries");
        expect(screen.getByTestId("data-state-loading")).toBeInTheDocument();
        expect(screen.getByRole("status")).toHaveTextContent("Preparing context packet");
    });

    it.each([
        [
            "not-entitled",
            "Agent Context Runtime is not available for this organization",
            "data-state-not-entitled",
        ],
        ["loading", "Preparing context packet", "data-state-loading"],
        ["empty", "No context matched this scope", "data-state-empty"],
        ["error", "Context packet could not be generated", "data-state-error"],
        ["degraded", "Partial context is available", "data-state-degraded"],
    ] as const)("renders the %s controlled state safely", (controlledState, title, testId) => {
        render(<ContextPacketExplorer controlledState={controlledState} />);

        expect(screen.getByTestId(testId)).toBeInTheDocument();
        expect(screen.getByText(title)).toBeInTheDocument();
    });
});
