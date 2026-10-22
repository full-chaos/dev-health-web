import { describe, expect, it, vi } from "vitest";

import { render, screen, userEvent } from "@/test/utils";

import { Switch } from "./Switch";

describe("Switch", () => {
    it("is a named switch whose aria-checked follows the checked prop", () => {
        const { rerender } = render(<Switch checked aria-label="Feature" onChange={() => {}} />);
        expect(screen.getByRole("switch", { name: "Feature" })).toHaveAttribute(
            "aria-checked",
            "true",
        );
        rerender(<Switch checked={false} aria-label="Feature" onChange={() => {}} />);
        expect(screen.getByRole("switch", { name: "Feature" })).toHaveAttribute(
            "aria-checked",
            "false",
        );
    });

    it("calls onChange with the opposite value on click", async () => {
        const onChange = vi.fn();
        render(<Switch checked={false} aria-label="Feature" onChange={onChange} />);
        await userEvent.click(screen.getByRole("switch", { name: "Feature" }));
        expect(onChange).toHaveBeenCalledWith(true);
    });

    it("toggles from the keyboard with Space and Enter", async () => {
        const onChange = vi.fn();
        render(<Switch checked aria-label="Feature" onChange={onChange} />);
        screen.getByRole("switch", { name: "Feature" }).focus();
        await userEvent.keyboard(" ");
        await userEvent.keyboard("{Enter}");
        expect(onChange).toHaveBeenCalledTimes(2);
        expect(onChange).toHaveBeenLastCalledWith(false);
    });

    it("does nothing while disabled", async () => {
        const onChange = vi.fn();
        render(<Switch checked aria-label="Feature" disabled onChange={onChange} />);
        const el = screen.getByRole("switch", { name: "Feature" });
        expect(el).toBeDisabled();
        await userEvent.click(el);
        expect(onChange).not.toHaveBeenCalled();
    });
});
