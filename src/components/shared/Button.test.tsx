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

    it("pins the prototype look on every button: sentence case, 6px radius, 7px icon gap", () => {
        for (const v of ["primary", "secondary", "ghost"] as const) {
            const c = buttonClassName(v, "md");
            expect(c).toContain("rounded-sm");
            expect(c).toContain("gap-1.75");
            expect(c).toContain("font-[550]");
            expect(c).not.toContain("uppercase");
            expect(c).not.toContain("tracking-");
            expect(c).not.toContain("rounded-full");
        }
    });

    it("draws the keyboard focus ring in the action teal, never the selection orange (CHAOS-8141)", () => {
        const cls = buttonClassName("primary", "md");
        expect(cls).toContain("focus-visible:ring-(--accent-2)");
        expect(cls).not.toContain("focus-visible:ring-(--accent) ");
    });

    it("pins the size classes: md 35px, small 28px", () => {
        expect(buttonClassName("secondary", "md")).toContain("min-h-8.75");
        expect(buttonClassName("secondary", "md")).toContain("px-3.25");
        expect(buttonClassName("secondary", "sm")).toContain("min-h-7");
        expect(buttonClassName("secondary", "sm")).toContain("px-2.25");
        expect(buttonClassName("secondary", "sm")).toContain("text-xs");
    });

    it("pins the variant colors", () => {
        const primary = buttonClassName("primary");
        expect(primary).toContain("bg-(--action)");
        expect(primary).toContain("text-(--on-action)");
        const secondary = buttonClassName("secondary");
        expect(secondary).toContain("bg-(--card)");
        expect(secondary).toContain("border-(--card-stroke)");
        const ghost = buttonClassName("ghost");
        expect(ghost).toContain("border-transparent");
        expect(ghost).toContain("bg-transparent");
        expect(ghost).toContain("text-(--accent-2)");
        expect(ghost).not.toContain("accent-text");
        // Teal marks actions; orange only marks the current selection.
        for (const v of ["primary", "secondary", "ghost"] as const) {
            expect(buttonClassName(v)).not.toMatch(/(?:text|bg|border)-\(--accent(?:-text|-1)?\)/);
        }
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
        expect(btn.className).toContain("w-8.75");
        expect(btn.className).toContain("p-0");
        expect(btn.className).toContain("rounded-sm");
    });

    it("buttonClassName uses the square size only when iconOnly", () => {
        expect(buttonClassName("ghost", "sm", "", true)).toContain("w-7");
        expect(buttonClassName("ghost", "sm")).not.toContain(" w-7 ");
    });
});
