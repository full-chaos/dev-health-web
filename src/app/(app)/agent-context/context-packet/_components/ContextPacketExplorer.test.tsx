import { describe, expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen, waitFor } from "@/test/utils";

import { ContextPacketExplorer } from "./ContextPacketExplorer";

describe("ContextPacketExplorer", () => {
    it("renders the deterministic sample packet in the prescribed category order", () => {
        render(<ContextPacketExplorer controlledState="sample" />);

        expect(screen.getByRole("heading", { name: "Context Fabric" })).toBeInTheDocument();
        expect(screen.queryByText("Context Packet")).not.toBeInTheDocument();
        expect(screen.getByLabelText(/Goal/)).toHaveValue("Add repository-scoped ACR credentials");
        expect(screen.getByLabelText(/Goal.*required/)).toBeRequired();
        expect(screen.getByLabelText(/Repository.*required/)).toBeRequired();
        for (const category of ["State", "Pressure", "Cause", "Evidence", "Action"]) {
            expect(screen.getByRole("heading", { name: category, level: 2 })).toBeInTheDocument();
        }
        expect(screen.getByText("Context Fabric status")).toBeInTheDocument();
        expect(screen.queryByText("Packet status")).not.toBeInTheDocument();
        expect(
            screen.getByRole("region", { name: "Context Fabric diagnostics" }),
        ).toBeInTheDocument();
        expect(screen.getByText("Freshness")).toBeInTheDocument();
        expect(screen.getByText("Coverage")).toBeInTheDocument();
        expect(screen.getByText("Budget")).toBeInTheDocument();
        expect(screen.getByText("Coverage is complete.")).toBeInTheDocument();
    });

    it("completes a sample request and restores focus to the generated packet", async () => {
        const user = userEvent.setup();
        render(<ContextPacketExplorer controlledState="sample" />);

        const goal = screen.getByLabelText(/Goal/);
        await user.clear(goal);
        await user.type(goal, "Inspect repository access boundaries");
        await user.click(screen.getByRole("button", { name: "Generate context" }));

        expect(goal).toHaveValue("Inspect repository access boundaries");
        await waitFor(() =>
            expect(
                screen.getByRole("region", { name: "Generated Context Fabric response" }),
            ).toHaveFocus(),
        );
        expect(screen.getByRole("button", { name: "Generate context" })).toBeEnabled();
    });

    it("validates required fields and renders the submitted goal in the packet", async () => {
        const user = userEvent.setup();
        render(<ContextPacketExplorer controlledState="sample" />);
        const goal = screen.getByLabelText(/Goal/);
        await user.clear(goal);
        await user.click(screen.getByRole("button", { name: "Generate context" }));
        expect(goal).toHaveFocus();
        expect(goal).toHaveAttribute("aria-invalid", "true");
        expect(screen.getByText("Goal is required.")).toBeInTheDocument();
        await user.type(goal, "Review constrained credentials");
        await user.click(screen.getByRole("button", { name: "Generate context" }));
        await waitFor(() =>
            expect(
                screen.getByRole("heading", { name: "Review constrained credentials" }),
            ).toBeInTheDocument(),
        );
    });

    it("clears the associated goal error when the focused invalid field becomes valid", async () => {
        const user = userEvent.setup();
        render(<ContextPacketExplorer controlledState="sample" />);
        const goal = screen.getByLabelText(/Goal/);

        await user.clear(goal);
        await user.click(screen.getByRole("button", { name: "Generate context" }));

        expect(goal).toHaveAttribute("aria-describedby", "context-goal-error");
        await user.type(goal, "Review the authorized repository scope");

        expect(goal).toHaveAttribute("aria-invalid", "false");
        expect(goal).not.toHaveAttribute("aria-describedby");
        expect(screen.queryByText("Goal is required.")).not.toBeInTheDocument();
    });

    it("limits repository selection to the server-authorized options", () => {
        render(<ContextPacketExplorer controlledState="sample" />);

        expect(screen.getByRole("combobox", { name: /Repository/ })).toHaveValue(
            "full-chaos/dev-health-acr",
        );
        expect(
            screen.getByRole("option", { name: "full-chaos/dev-health-acr" }),
        ).toBeInTheDocument();
    });

    it("renders packet diagnostics, checks, and next steps without collapsing contract data", () => {
        render(<ContextPacketExplorer controlledState="sample" />);

        expect(screen.getByText(/linear: fresh/)).toBeInTheDocument();
        expect(screen.getByText(/4,?210 serialized bytes/)).toBeInTheDocument();
        expect(screen.getByText("Test cross-repository denial")).toBeInTheDocument();
        expect(screen.getByText("Implement hashed fcacr_ bearer tokens")).toBeInTheDocument();
    });

    it("discloses the sanitized evidence fields for observed claims", async () => {
        const user = userEvent.setup();
        render(<ContextPacketExplorer controlledState="sample" />);

        await user.click(screen.getByRole("button", { name: "Open evidence" }));

        expect(screen.getByText("Credential authorization review")).toBeInTheDocument();
        expect(screen.getByText("Repository credential requirements")).toBeInTheDocument();
        expect(screen.getByText(/Evidence is available/)).toBeInTheDocument();
    });

    it.each([
        [
            "not-entitled",
            "Agent Context Runtime is not available for this organization",
            "data-state-not-entitled",
        ],
        ["loading", "Preparing Context Fabric response", "data-state-loading"],
        ["empty", "No context matched this scope", "data-state-empty"],
        ["error", "Context Fabric response could not be generated", "data-state-error"],
        ["degraded", "Partial context is available", "data-state-degraded"],
    ] as const)("renders the %s controlled state safely", (controlledState, title, testId) => {
        render(<ContextPacketExplorer controlledState={controlledState} />);

        expect(screen.getByTestId(testId)).toBeInTheDocument();
        expect(screen.getByText(title)).toBeInTheDocument();
    });

    it("renders partial coverage, unavailable sources, and degraded reasons", () => {
        render(<ContextPacketExplorer controlledState="degraded" />);

        expect(screen.getByText("Coverage is partial.")).toBeInTheDocument();
        expect(
            screen.getByText(
                /clickhouse_work_graph: Demo fixture does not include hosted ClickHouse/,
            ),
        ).toBeInTheDocument();
        expect(
            screen.getByText("Hosted evidence is unavailable in this demo fixture."),
        ).toBeInTheDocument();
    });

    it("renders available packet groups with an explicit partial coverage explanation", () => {
        render(<ContextPacketExplorer controlledState="partial" />);

        expect(screen.getByRole("heading", { name: "Pressure", level: 2 })).toBeInTheDocument();
        expect(screen.getByText("Coverage is partial.")).toBeInTheDocument();
        expect(
            screen.getByText(
                /clickhouse_work_graph: Demo fixture does not include hosted ClickHouse/,
            ),
        ).toBeInTheDocument();
    });
});
