import { describe, expect, it } from "vitest";

import { render, screen } from "@/test/utils";
import { Section } from "./Section";

describe("Section", () => {
    it("renders title as h2, description, body", () => {
        render(
            <Section title="Risk trend" description="Last 90 days">
                <p>body</p>
            </Section>,
        );
        expect(screen.getByRole("heading", { level: 2, name: "Risk trend" })).toBeInTheDocument();
        expect(screen.getByText("Last 90 days")).toBeInTheDocument();
        expect(screen.getByText("body")).toBeInTheDocument();
    });

    it("uses h3 when asked", () => {
        render(
            <Section title="Inner" as="h3">
                x
            </Section>,
        );
        expect(screen.getByRole("heading", { level: 3, name: "Inner" })).toBeInTheDocument();
        expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
    });

    it("renders the action next to the title, and nothing when absent", () => {
        const { rerender, container } = render(<Section title="T">x</Section>);
        expect(screen.queryByRole("link")).toBeNull();
        expect(container.querySelector("p")).toBeNull();
        rerender(
            <Section title="T" action={<a href="/e">Evidence</a>}>
                x
            </Section>,
        );
        expect(screen.getByRole("link", { name: "Evidence" })).toHaveAttribute("href", "/e");
    });

    it("passes through props and merges className", () => {
        render(
            <Section title="T" data-testid="s" className="extra">
                x
            </Section>,
        );
        expect(screen.getByTestId("s")).toHaveClass("extra");
    });
});
