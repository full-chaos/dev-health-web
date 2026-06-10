import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@/test/utils";
import { RoleSelector } from "./RoleSelector";

const mockPush = vi.fn();
const mockSearchParams = {
    get: vi.fn().mockReturnValue(null),
    toString: vi.fn().mockReturnValue(""),
    has: vi.fn().mockReturnValue(false),
};

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: mockPush }),
    usePathname: () => "/dashboard",
    useSearchParams: () => mockSearchParams,
}));

describe("RoleSelector", () => {
    it("renders the role selector container", () => {
        render(<RoleSelector />);
        expect(screen.getByTestId("role-selector")).toBeInTheDocument();
    });

    it("renders 'Lens' label", () => {
        render(<RoleSelector />);
        expect(screen.getByText(/lens/i)).toBeInTheDocument();
    });

    it("renders IC, EM, PM, and Leadership buttons", () => {
        render(<RoleSelector />);
        expect(screen.getByText("IC")).toBeInTheDocument();
        expect(screen.getByText("EM")).toBeInTheDocument();
        expect(screen.getByText("PM")).toBeInTheDocument();
        expect(screen.getByText("Leadership")).toBeInTheDocument();
    });

    it("marks the default role as active (aria-checked=true)", () => {
        render(<RoleSelector />);
        // Default role is "ic"
        const icRadio = screen.getByRole("radio", { name: "IC" });
        expect(icRadio).toHaveAttribute("aria-checked", "true");
    });

    it("calls router.push when a role button is clicked", () => {
        render(<RoleSelector />);
        fireEvent.click(screen.getByText("EM"));
        expect(mockPush).toHaveBeenCalled();
    });

    it("applies optional className to the container", () => {
        render(<RoleSelector className="custom-class" />);
        expect(screen.getByTestId("role-selector")).toHaveClass("custom-class");
    });
});
