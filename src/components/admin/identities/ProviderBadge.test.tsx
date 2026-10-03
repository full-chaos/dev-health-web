import { describe, expect, it } from "vitest";
import { render, screen } from "@/test/utils";

import { ProviderBadge } from "./ProviderBadge";

describe("ProviderBadge (CHAOS-8253)", () => {
    it("reads exactly 'provider: name', lowercase as served, no space before the colon", () => {
        render(<ProviderBadge provider="github" username="avery-ex" />);

        expect(screen.getByText("github: avery-ex")).toBeInTheDocument();
        expect(screen.queryByText(/Github/u)).toBeNull();
        expect(screen.queryByText(/ :/u)).toBeNull();
    });

    it("is an outlined pill: a hairline, no wash, no icon", () => {
        const { container } = render(<ProviderBadge provider="linear" username="x" />);

        const pill = container.firstElementChild as HTMLElement;
        expect(pill.className).toContain("border-(--card-stroke)");
        expect(pill.className).not.toContain("wash");
        expect(pill.querySelector("svg")).toBeNull();
    });
});
