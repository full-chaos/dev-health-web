import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OperatingReviewSizingNote } from "./OperatingReviewSizingNote";

describe("OperatingReviewSizingNote", () => {
    it("says how much of an issue-size section is sized", () => {
        render(
            <OperatingReviewSizingNote
                sizing={{
                    measure: "ISSUE_SIZE",
                    sizingCoverage: 0.25,
                    unsizedUnitCount: 3,
                    workUnitCount: 4,
                }}
            />,
        );
        expect(screen.getByTestId("operating-review-sizing-coverage").textContent).toBe(
            "Issue size coverage: 25%.",
        );
        expect(screen.getByTestId("operating-review-sizing-text").textContent).toBe(
            "Mostly unsized: 1 of 4 work units have an issue size. The other 3 have no size, so each counts as 1 work unit.",
        );
    });

    it("does not call a well-sized section mostly unsized", () => {
        render(
            <OperatingReviewSizingNote
                sizing={{
                    measure: "ISSUE_SIZE",
                    sizingCoverage: 0.5,
                    unsizedUnitCount: 2,
                    workUnitCount: 4,
                }}
            />,
        );
        expect(screen.getByTestId("operating-review-sizing-text").textContent).toBe(
            "2 of 4 work units have an issue size. The other 2 have no size, so each counts as 1 work unit.",
        );
    });

    it("reads a coverage the API did not produce as not measured, never as a fine reading", () => {
        render(
            <OperatingReviewSizingNote sizing={{ measure: "ISSUE_SIZE", sizingCoverage: null }} />,
        );
        expect(screen.getByTestId("operating-review-sizing-coverage").textContent).toBe(
            "Issue size coverage: Not measured.",
        );
    });

    it("draws nothing for work units or for a section that carries no sizing", () => {
        const { container, rerender } = render(
            <OperatingReviewSizingNote sizing={{ measure: "WORK_UNITS" }} />,
        );
        expect(container.firstChild).toBeNull();
        rerender(<OperatingReviewSizingNote sizing={null} />);
        expect(container.firstChild).toBeNull();
        rerender(<OperatingReviewSizingNote />);
        expect(container.firstChild).toBeNull();
    });
});
