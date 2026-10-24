import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { UncategorizedNote } from "./UncategorizedNote";

describe("UncategorizedNote", () => {
    it("says how many work units the mix leaves out", () => {
        render(<UncategorizedNote stats={{ total: 10, uncategorized_count: 4 }} />);
        expect(screen.getByTestId("uncategorized-note").textContent).toBe(
            "4 of 10 work units have too little text to categorize and are left out of the theme mix.",
        );
    });

    it("says when every unit is left out, never a split", () => {
        render(<UncategorizedNote stats={{ total: 3, uncategorized_count: 3 }} />);
        expect(screen.getByTestId("uncategorized-note").textContent).toContain("3 of 3 work units");
    });

    it("draws nothing when no unit is left out", () => {
        const { container } = render(
            <UncategorizedNote stats={{ total: 10, uncategorized_count: 0 }} />,
        );
        expect(container.firstChild).toBeNull();
    });

    it("says not measured when the API sent no count, and draws nothing without stats", () => {
        const { container, rerender } = render(
            <UncategorizedNote stats={{ total: 10, uncategorized_count: null }} />,
        );
        expect(screen.getByTestId("uncategorized-note").textContent).toBe(
            "Work units left out of the theme mix: not measured.",
        );
        rerender(<UncategorizedNote stats={undefined} />);
        expect(container.firstChild).toBeNull();
    });
});
