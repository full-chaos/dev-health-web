import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/utils";
import { ServiceUnavailable, publicApiOrigin } from "./ServiceUnavailable";

const mockConfig = vi.hoisted(() => ({ api: { baseUrl: "http://localhost:8000" } }));
vi.mock("@/lib/config", () => ({ config: mockConfig }));

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

    it("shows the API origin for a public absolute URL, without path or credentials", () => {
        mockConfig.api.baseUrl = "https://user:pw@api.example.com/internal/v1?k=1";
        render(<ServiceUnavailable />);
        expect(screen.getByText("API at https://api.example.com")).toBeInTheDocument();
        expect(screen.queryByText(/pw|internal|k=1/)).not.toBeInTheDocument();
    });

    it('draws no "API at" line when the base URL is empty', () => {
        mockConfig.api.baseUrl = "";
        render(<ServiceUnavailable />);
        expect(screen.queryByText(/API at/)).not.toBeInTheDocument();
        expect(screen.getByText(/reachable from the web server/)).toBeInTheDocument();
    });

    it('draws no "API at" line when the base URL is relative (same-origin)', () => {
        mockConfig.api.baseUrl = "/api";
        render(<ServiceUnavailable />);
        expect(screen.queryByText(/API at/)).not.toBeInTheDocument();
    });

    it("publicApiOrigin rejects empty, relative and non-http values", () => {
        expect(publicApiOrigin(undefined)).toBeNull();
        expect(publicApiOrigin("  ")).toBeNull();
        expect(publicApiOrigin("/api")).toBeNull();
        expect(publicApiOrigin("ftp://x.example.com")).toBeNull();
        expect(publicApiOrigin("http://localhost:8000/x")).toBe("http://localhost:8000");
    });

    it("renders a Retry link pointing to /dashboard", () => {
        render(<ServiceUnavailable />);
        const link = screen.getByRole("link", { name: /retry/i });
        expect(link).toHaveAttribute("href", "/dashboard");
    });
});
