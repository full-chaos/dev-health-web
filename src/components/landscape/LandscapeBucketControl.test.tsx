import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@/test/utils";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { LandscapeBucketControl } from "./LandscapeBucketControl";

const hrefs = { week: "/landscape?bucket=week&f=x", month: "/landscape?bucket=month&f=x" };
const labels = { week: "Week", month: "Month" };

describe("LandscapeBucketControl (concept L13)", () => {
    beforeEach(() => push.mockReset());

    it("is the shared segmented control: sentence-case Week and Month, the selected one pressed", () => {
        render(<LandscapeBucketControl value="week" hrefs={hrefs} labels={labels} />);
        const group = screen.getByRole("group", { name: "Bucket" });
        expect(group).toHaveAttribute("data-testid", "landscape-bucket");
        const week = screen.getByRole("button", { name: "Week" });
        const month = screen.getByRole("button", { name: "Month" });
        expect(week).toHaveAttribute("aria-pressed", "true");
        expect(month).toHaveAttribute("aria-pressed", "false");
        for (const b of [week, month]) expect(b.className).not.toMatch(/uppercase|tracking-/);
    });

    it("choosing the other value goes to its href; choosing the selected one does nothing", () => {
        render(<LandscapeBucketControl value="week" hrefs={hrefs} labels={labels} />);
        fireEvent.click(screen.getByRole("button", { name: "Week" }));
        expect(push).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: "Month" }));
        expect(push).toHaveBeenCalledWith(hrefs.month);
    });
});
