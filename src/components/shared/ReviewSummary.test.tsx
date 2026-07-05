import { describe, expect, it } from "vitest";
import { render, screen } from "@/test/utils";

import { ReviewSummary } from "./ReviewSummary";

describe("ReviewSummary", () => {
    it("renders one row per label/value pair", () => {
        render(
            <ReviewSummary
                rows={[
                    { label: "Organization", value: "Acme Corp" },
                    { label: "Seats", value: 42 },
                ]}
            />,
        );

        expect(screen.getByText("Organization")).toBeInTheDocument();
        expect(screen.getByText("Acme Corp")).toBeInTheDocument();
        expect(screen.getByText("Seats")).toBeInTheDocument();
        expect(screen.getByText("42")).toBeInTheDocument();
    });

    it("renders ReactNode values, not only strings", () => {
        render(
            <ReviewSummary
                rows={[{ label: "Status", value: <strong>Active</strong> }]}
            />,
        );

        expect(screen.getByText("Active").tagName).toBe("STRONG");
    });

    it("renders no warnings region when warnings is omitted or empty", () => {
        render(<ReviewSummary rows={[{ label: "Plan", value: "Team" }]} />);

        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("renders each warning inside an alert region for destructive-change callouts", () => {
        render(
            <ReviewSummary
                rows={[{ label: "Plan", value: "Team" }]}
                warnings={["This will remove 3 pending invites.", "Billing will be prorated."]}
            />,
        );

        const alert = screen.getByRole("alert");
        expect(alert).toHaveTextContent("This will remove 3 pending invites.");
        expect(alert).toHaveTextContent("Billing will be prorated.");
    });

    it("uses the id override for row keys when provided", () => {
        render(
            <ReviewSummary
                rows={[
                    { id: "row-a", label: "Repeat label", value: "First" },
                    { id: "row-b", label: "Repeat label", value: "Second" },
                ]}
            />,
        );

        expect(screen.getByText("First")).toBeInTheDocument();
        expect(screen.getByText("Second")).toBeInTheDocument();
        expect(screen.getAllByText("Repeat label")).toHaveLength(2);
    });
});
