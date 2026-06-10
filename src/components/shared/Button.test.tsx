import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/utils";
import { Button, buttonClassName } from "./Button";

describe("Button", () => {
    it("renders children and defaults to type=button", () => {
        render(<Button>Save</Button>);
        const btn = screen.getByRole("button", { name: "Save" });
        expect(btn).toBeInTheDocument();
        expect(btn).toHaveAttribute("type", "button");
    });

    it("fires onClick", () => {
        const onClick = vi.fn();
        render(<Button onClick={onClick}>Go</Button>);
        screen.getByRole("button", { name: "Go" }).click();
        expect(onClick).toHaveBeenCalledOnce();
    });

    it("applies variant + size classes through buttonClassName", () => {
        const primary = buttonClassName("primary", "md");
        expect(primary).toContain("bg-(--accent-2)");
        expect(primary).toContain("rounded-(--radius-pill)");
        expect(primary).toContain("text-label-caps");
        const ghostSm = buttonClassName("ghost", "sm");
        expect(ghostSm).toContain("border-transparent");
        expect(ghostSm).toContain("px-3");
        expect(ghostSm).toContain("text-(--text-muted)");
    });
});
