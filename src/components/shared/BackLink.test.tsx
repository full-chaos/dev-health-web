import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/utils";
import { BackLink } from "./BackLink";

vi.mock("next/link", () => ({
    default: ({
        href,
        children,
        ...props
    }: {
        href: string;
        children: React.ReactNode;
        [key: string]: unknown;
    }) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}));

describe("BackLink", () => {
    it("defaults to the canonical 'Back to Cockpit' return path", () => {
        render(<BackLink href="/" />);
        const link = screen.getByRole("link", { name: /back to cockpit/i });
        expect(link).toHaveAttribute("href", "/");
    });

    it("renders a contextual 'Back to {area}' path", () => {
        render(<BackLink href="/metrics" area="Metrics" />);
        expect(screen.getByRole("link", { name: /back to metrics/i })).toHaveAttribute(
            "href",
            "/metrics",
        );
    });

    it("accepts an explicit registry label", () => {
        render(<BackLink href="/work" label="Back to Cockpit" />);
        expect(screen.getByRole("link", { name: /back to cockpit/i })).toBeInTheDocument();
    });

    it("is not styled as a filter pill (quiet inline link, no pill background)", () => {
        render(<BackLink href="/" />);
        const link = screen.getByRole("link", { name: /back to cockpit/i });
        expect(link.className).not.toContain("rounded-(--radius-pill)");
        expect(link.className).toContain("text-(--text-muted)");
    });
});
