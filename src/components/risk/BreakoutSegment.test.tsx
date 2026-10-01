import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BreakoutSegment } from "./BreakoutSegment";

vi.mock("next/navigation", () => ({
    usePathname: () => "/risk/compounding",
    useSearchParams: () => new URLSearchParams("f=abc&role=em&origin=cockpit&breakout=repo"),
}));

describe("BreakoutSegment", () => {
    it("links to the other breakout and keeps f, role and origin", () => {
        render(<BreakoutSegment breakout="repo" />);

        const team = screen.getByRole("link", { name: "By team" });
        const url = new URL(team.getAttribute("href") ?? "", "https://app.example");
        expect(url.pathname).toBe("/risk/compounding");
        expect(url.searchParams.get("breakout")).toBe("team");
        expect(url.searchParams.get("f")).toBe("abc");
        expect(url.searchParams.get("role")).toBe("em");
        expect(url.searchParams.get("origin")).toBe("cockpit");
    });

    it("marks the current breakout and offers no person option", () => {
        render(<BreakoutSegment breakout="team" />);

        expect(screen.getByRole("link", { name: "By team" })).toHaveAttribute(
            "aria-current",
            "page",
        );
        expect(screen.getByRole("link", { name: "By repo" })).not.toHaveAttribute("aria-current");
        expect(screen.getAllByRole("link")).toHaveLength(2);
    });
});
