import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@/test/utils";
import { Button, buttonClassName } from "./Button";

const Dot = () => <svg data-testid="dot" />;

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
        expect(primary).toContain("rounded-full");
        const ghostSm = buttonClassName("ghost", "sm");
        expect(ghostSm).toContain("border-transparent");
        expect(ghostSm).toContain("text-[10px]");
    });

    it("renders a start icon before the label, hidden from assistive tech", () => {
        render(<Button icon={<Dot />}>Copy link</Button>);
        const btn = screen.getByRole("button", { name: "Copy link" });
        expect(btn.firstChild).toHaveAttribute("aria-hidden", "true");
        expect(btn.firstChild).toContainElement(screen.getByTestId("dot"));
        expect(btn.lastChild?.nodeType).toBe(Node.TEXT_NODE);
    });

    it("renders an end icon after the label", () => {
        render(
            <Button icon={<Dot />} iconPosition="end">
                Next
            </Button>,
        );
        const btn = screen.getByRole("button", { name: "Next" });
        expect(btn.lastChild).toContainElement(screen.getByTestId("dot"));
        expect(btn.firstChild?.nodeType).toBe(Node.TEXT_NODE);
    });

    it("icon-only is a fixed circle named by aria-label with no text", () => {
        render(<Button iconOnly icon={<Dot />} aria-label="Switch theme" variant="ghost" />);
        const btn = screen.getByRole("button", { name: "Switch theme" });
        expect(btn.textContent).toBe("");
        expect(btn.className).toContain("w-9");
        expect(btn.className).toContain("p-0");
        expect(btn.className).toContain("rounded-full");
    });

    it("buttonClassName uses the square size only when iconOnly", () => {
        expect(buttonClassName("ghost", "sm", "", true)).toContain("w-7");
        expect(buttonClassName("ghost", "sm")).not.toContain("w-7");
    });
});
