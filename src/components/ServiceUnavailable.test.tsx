import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/utils";
import { ServiceUnavailable } from "./ServiceUnavailable";

vi.mock("@/lib/config", () => ({
    config: { api: { baseUrl: "http://localhost:8000" } },
}));

vi.mock("next/link", () => ({
    default: ({ href, children }: { href: string; children: React.ReactNode }) => (
        <a href={href}>{children}</a>
    ),
}));

describe("ServiceUnavailable", () => {
    it("renders the error heading", () => {
        render(<ServiceUnavailable />);
        expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
            "Data service unavailable",
        );
    });

    it("displays the API base URL in the quick checks list", () => {
        render(<ServiceUnavailable />);
        expect(screen.getByText(/localhost:8000/)).toBeInTheDocument();
    });

    it("renders a Retry link pointing to /dashboard", () => {
        render(<ServiceUnavailable />);
        const link = screen.getByRole("link", { name: /retry/i });
        expect(link).toHaveAttribute("href", "/dashboard");
    });
});
