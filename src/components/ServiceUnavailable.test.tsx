import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/utils";
import { ServiceUnavailable } from "./ServiceUnavailable";

vi.mock("next/link", () => ({
    default: ({ href, children }: { href: string; children: React.ReactNode }) => (
        <a href={href}>{children}</a>
    ),
}));

describe("ServiceUnavailable", () => {
    it("renders the generic heading", () => {
        render(<ServiceUnavailable />);
        expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Service unavailable");
    });

    it("says the service is down, names no specific service and gives no operator checks", () => {
        const { container } = render(<ServiceUnavailable />);
        expect(
            screen.getByText("The service is down right now. Please check back soon."),
        ).toBeInTheDocument();
        expect(container.textContent).not.toMatch(/\bAPI\b|data service|status check/i);
        expect(screen.queryByText(/quick checks/i)).not.toBeInTheDocument();
        expect(screen.queryByRole("list")).not.toBeInTheDocument();
    });

    it("renders a Retry link pointing to /dashboard", () => {
        render(<ServiceUnavailable />);
        const link = screen.getByRole("link", { name: /retry/i });
        expect(link).toHaveAttribute("href", "/dashboard");
    });
});
