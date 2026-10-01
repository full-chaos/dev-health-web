import { describe, it, expect } from "vitest";

import { DataState, type DataStateVariant } from "./DataState";
import { render, screen } from "@/test/utils";

const EMPTY: Exclude<DataStateVariant, "loading" | "error">[] = [
    "no-data-connected",
    "source-unsupported",
    "detector-unavailable",
    "detector-enabled-no-findings",
    "insufficient-confidence",
    "preview-not-populated",
];

describe("DataState empty / unavailable visuals (CHAOS-7601)", () => {
    it.each(EMPTY)("%s is the neutral dashed box with its own icon", (variant) => {
        const { container } = render(<DataState variant={variant} />);
        const box = container.querySelector(".border-dashed") as HTMLElement;
        expect(box).not.toBeNull();
        expect(box.className).toContain("rounded-(--radius-sm)");
        expect(box.querySelector("svg[aria-hidden='true']")).not.toBeNull();
    });

    it("no empty or unavailable variant uses a status color (missing is not healthy, not a warning)", () => {
        for (const variant of EMPTY) {
            const { container, unmount } = render(<DataState variant={variant} />);
            expect(container.innerHTML).not.toMatch(
                /positive|caution|negative|amber|emerald|green|red-/,
            );
            unmount();
        }
    });

    it("the six variants do not share one icon", () => {
        const icons = new Set<string>();
        for (const variant of EMPTY) {
            const { container, unmount } = render(<DataState variant={variant} />);
            icons.add(container.querySelector("svg")?.getAttribute("class") ?? "");
            unmount();
        }
        expect(icons.size).toBeGreaterThan(1);
    });

    it("a caller-supplied icon replaces the default", () => {
        render(<DataState variant="no-data-connected" icon={<span data-testid="mine" />} />);
        expect(screen.getByTestId("mine")).toBeInTheDocument();
    });

    it("loading keeps the busy status and honors reduced motion", () => {
        const { container } = render(<DataState variant="loading" />);
        expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
        expect(container.innerHTML).toContain("motion-reduce:animate-none");
    });
});
