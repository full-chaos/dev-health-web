import { describe, expect, it, vi } from "vitest";

import { render, screen, userEvent } from "@/test/utils";

import { SegmentedControl } from "./SegmentedControl";

const OPTIONS = [
    { id: "a", label: "Alpha" },
    { id: "b", label: "Beta" },
] as const;

describe("SegmentedControl", () => {
    it("is a named group of toggle buttons; the selected one is pressed", () => {
        render(
            <SegmentedControl ariaLabel="Mode" options={OPTIONS} value="b" onChange={() => {}} />,
        );
        expect(screen.getByRole("group", { name: "Mode" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Beta" })).toHaveAttribute(
            "aria-pressed",
            "true",
        );
        expect(screen.getByRole("button", { name: "Alpha" })).toHaveAttribute(
            "aria-pressed",
            "false",
        );
    });

    it("calls onChange with the id of the clicked segment", async () => {
        const onChange = vi.fn();
        render(
            <SegmentedControl ariaLabel="Mode" options={OPTIONS} value="a" onChange={onChange} />,
        );
        await userEvent.click(screen.getByRole("button", { name: "Beta" }));
        expect(onChange).toHaveBeenCalledWith("b");
    });

    it("is the small prototype group: no wide cards, the selection wash on the selected segment only", () => {
        render(
            <SegmentedControl ariaLabel="Mode" options={OPTIONS} value="a" onChange={() => {}} />,
        );
        const group = screen.getByRole("group", { name: "Mode" });
        expect(group.className).toContain("inline-flex");
        expect(group.className).not.toMatch(/\bflex-1\b|\bw-full\b/);
        const selected = screen.getByRole("button", { name: "Alpha" });
        const other = screen.getByRole("button", { name: "Beta" });
        expect(selected.className).toContain("bg-(--accent-wash)");
        expect(other.className).not.toContain("bg-(--accent-wash)");
        for (const b of [selected, other]) expect(b.className).not.toContain("flex-1");
    });
});
