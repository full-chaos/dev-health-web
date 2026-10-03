import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BreakoutSegment } from "./BreakoutSegment";

const push = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
    usePathname: () => "/risk/compounding",
    useSearchParams: () => new URLSearchParams("f=abc&role=em&origin=cockpit&breakout=repo"),
}));

beforeEach(() => push.mockReset());

describe("BreakoutSegment", () => {
    it("is the shared segmented control (concept): two toggle buttons, sentence case", () => {
        render(<BreakoutSegment breakout="repo" />);

        const group = screen.getByRole("group", { name: "Breakout" });
        expect(group).toHaveAttribute("data-testid", "breakout-segment");
        expect(
            within(group)
                .getAllByRole("button")
                .map((b) => b.textContent),
        ).toEqual(["By repo", "By team"]);
        expect(group.innerHTML).not.toMatch(/uppercase|tracking-|rounded-\(--radius-pill\)/u);
    });

    it("goes to the other breakout and keeps f, role and origin", () => {
        render(<BreakoutSegment breakout="repo" />);

        fireEvent.click(screen.getByRole("button", { name: "By team" }));
        expect(push).toHaveBeenCalledTimes(1);
        const [href, options] = push.mock.calls[0];
        const url = new URL(href, "https://app.example");
        expect(url.pathname).toBe("/risk/compounding");
        expect(url.searchParams.get("breakout")).toBe("team");
        expect(url.searchParams.get("f")).toBe("abc");
        expect(url.searchParams.get("role")).toBe("em");
        expect(url.searchParams.get("origin")).toBe("cockpit");
        expect(options).toEqual({ scroll: false });
    });

    it("marks the current breakout, does nothing when it is chosen again, and offers no person option", () => {
        render(<BreakoutSegment breakout="team" />);

        expect(screen.getByRole("button", { name: "By team" })).toHaveAttribute(
            "aria-pressed",
            "true",
        );
        expect(screen.getByRole("button", { name: "By repo" })).toHaveAttribute(
            "aria-pressed",
            "false",
        );
        fireEvent.click(screen.getByRole("button", { name: "By team" }));
        expect(push).not.toHaveBeenCalled();
        expect(screen.getAllByRole("button")).toHaveLength(2);
    });
});
