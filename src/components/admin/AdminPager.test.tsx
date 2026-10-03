import { describe, expect, it, vi } from "vitest";
import { render, screen, userEvent } from "@/test/utils";

import { AdminPager } from "./AdminPager";

const noop = () => {};

describe("AdminPager", () => {
    it("shows the range of the rows on the page, never a total", () => {
        render(
            <AdminPager
                offset={50}
                count={50}
                hasNext
                onPreviousAction={noop}
                onNextAction={noop}
            />,
        );

        expect(screen.getByText("Showing 51–100")).toBeInTheDocument();
    });

    it("disables Previous on the first page and Next when there is no next page", () => {
        render(
            <AdminPager
                offset={0}
                count={3}
                hasNext={false}
                onPreviousAction={noop}
                onNextAction={noop}
            />,
        );

        expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
        expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    });

    it("calls the actions, and both buttons are disabled while disabled", async () => {
        const previous = vi.fn();
        const next = vi.fn();
        const { rerender } = render(
            <AdminPager
                offset={50}
                count={50}
                hasNext
                onPreviousAction={previous}
                onNextAction={next}
            />,
        );

        await userEvent.click(screen.getByRole("button", { name: "Previous" }));
        await userEvent.click(screen.getByRole("button", { name: "Next" }));
        expect(previous).toHaveBeenCalledTimes(1);
        expect(next).toHaveBeenCalledTimes(1);

        rerender(
            <AdminPager
                offset={50}
                count={50}
                hasNext
                disabled
                onPreviousAction={previous}
                onNextAction={next}
            />,
        );
        expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
        expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    });
});
